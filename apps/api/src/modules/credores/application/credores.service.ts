import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { promises as fs } from 'fs';
import { existsSync } from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import PDFDocument from 'pdfkit';
import JSZip from 'jszip';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infra/prisma.service';
import { BatchActionDto } from '../dto/batch-action.dto';
import { CreateCredorDto } from '../dto/create-credor.dto';
import { ListCredoresQueryDto } from '../dto/list-credores-query.dto';
import { UpdateCredorDto } from '../dto/update-credor.dto';

const PREPOSICOES = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

function toTitleCaseName(input: string): string {
  return input
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((chunk, index) => {
      const low = chunk.toLowerCase();
      if (index > 0 && PREPOSICOES.has(low)) return low;
      return low.charAt(0).toUpperCase() + low.slice(1);
    })
    .join(' ');
}

function toCanonical(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function toSlug(input: string): string {
  return toCanonical(input)
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function toUpperFolder(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizeLeadingCredorCode(input: string): string {
  const raw = String(input ?? '').replace(/\s+/g, ' ').trim();
  return (
    raw
      .replace(/^\d+\s*[-–—.:)_]*\s*/u, '')
      .replace(/\s*\([^)]*\)/g, '')
      .replace(/\s+/g, ' ')
      .trim() || raw
  );
}

function stripNumericSuffix(input: string): string {
  return input.replace(/\s*\(\d+\)\s*$/, '').trim();
}

function resolveGroupFolderName(groupName: string | undefined): string | null {
  const normalized = toCanonical(groupName ?? '');
  if (!normalized) return null;
  if (normalized.includes('sports')) return 'SPORTS';
  if (normalized === 'lgm' || normalized.includes('golden')) return 'LGM';
  return null;
}

function isLikelyCredorFolderMatch(folderName: string, credorName: string): boolean {
  const folderSlug = toSlug(stripNumericSuffix(folderName));
  const credorSlug = toSlug(stripNumericSuffix(sanitizeLeadingCredorCode(credorName)));
  if (!folderSlug || !credorSlug) return false;
  if (folderSlug === credorSlug) return true;
  if (folderSlug.startsWith(`${credorSlug}-`) || folderSlug.includes(`-${credorSlug}`)) return true;
  if (folderSlug.includes(credorSlug) || credorSlug.includes(folderSlug)) return true;
  return false;
}

function resolveProjectRootFromCwd(): string {
  let current = process.cwd();
  for (let i = 0; i < 8; i += 1) {
    const hasApps = existsSync(path.join(current, 'apps'));
    const hasPgcRoot = existsSync(path.join(current, 'PGC')) || existsSync(path.join(current, 'LGM'));
    if (hasApps && hasPgcRoot) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return process.cwd();
}

function normalizeEmpresaHistoryKey(input: string): string {
  return String(input ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/^\d+\s*[-–—.:)_]*\s*/u, '')
    .replace(/\s+/g, ' ')
    .trim();
}

type DiscountHistoryLogEntry = {
  createdAt?: string;
  requestId?: string;
  numeroPgc?: string;
  credorSlug?: string;
  credorName?: string;
  empresa?: string;
  descontoAtual?: number;
  carryoverAnterior?: number;
  aplicadoNoPgc?: number;
  saldoProximoPgc?: number;
};

type CredorDiscountHistoryRow = {
  id: string;
  pgc: string;
  empresa: string;
  desconto_total: number;
  desconto_aplicado: number;
  restante_proximo_pgc: number;
  desconto_acumulado: number;
  carryover_anterior: number;
  created_at?: string;
};

@Injectable()
export class CredoresService {
  constructor(private readonly prisma: PrismaService) {}

  private async loadDiscountHistoryRowsForCredor(credorName: string): Promise<CredorDiscountHistoryRow[]> {
    const workspaceRoot = resolveProjectRootFromCwd();
    const candidateFiles = [
      path.join(workspaceRoot, 'PGC', 'LGM', 'descontos-historico.json'),
      path.join(workspaceRoot, 'PGC', 'SPORTS', 'descontos-historico.json'),
    ];

    const credorSlug = toSlug(sanitizeLeadingCredorCode(credorName));
    if (!credorSlug) return [];

    const allRows: CredorDiscountHistoryRow[] = [];

    for (const filePath of candidateFiles) {
      const exists = await fs
        .stat(filePath)
        .then((st) => st.isFile())
        .catch(() => false);
      if (!exists) continue;

      const parsed = await fs
        .readFile(filePath, 'utf8')
        .then((raw) => JSON.parse(raw) as DiscountHistoryLogEntry[])
        .catch(() => [] as DiscountHistoryLogEntry[]);

      if (!Array.isArray(parsed) || parsed.length === 0) continue;

      const filtered = parsed.filter((entry) => {
        const bySlug = toSlug(entry.credorSlug ?? '') === credorSlug;
        const byName = toSlug(sanitizeLeadingCredorCode(entry.credorName ?? '')) === credorSlug;
        return bySlug || byName;
      });

      for (const entry of filtered) {
        const descontoAtual = Number(entry.descontoAtual ?? 0);
        const carryoverAnterior = Number(entry.carryoverAnterior ?? 0);
        const aplicadoNoPgc = Number(entry.aplicadoNoPgc ?? 0);
        const saldoProximoPgc = Number(entry.saldoProximoPgc ?? 0);
        const descontoTotal = Number((descontoAtual + carryoverAnterior).toFixed(2));

        allRows.push({
          id: `${entry.requestId ?? '-'}::${entry.numeroPgc ?? '-'}::${entry.empresa ?? '-'}::${entry.createdAt ?? ''}`,
          pgc: String(entry.numeroPgc ?? '-'),
          empresa: String(entry.empresa ?? '-'),
          desconto_total: Number(descontoTotal.toFixed(2)),
          desconto_aplicado: Number(aplicadoNoPgc.toFixed(2)),
          restante_proximo_pgc: Number(saldoProximoPgc.toFixed(2)),
          desconto_acumulado: Number(descontoTotal.toFixed(2)),
          carryover_anterior: Number(carryoverAnterior.toFixed(2)),
          created_at: entry.createdAt,
        });
      }
    }

    const latestByPgcEmpresa = new Map<string, CredorDiscountHistoryRow>();
    for (const row of allRows) {
      const key = `${row.pgc}::${normalizeEmpresaHistoryKey(row.empresa)}`;
      const current = latestByPgcEmpresa.get(key);
      if (!current) {
        latestByPgcEmpresa.set(key, row);
        continue;
      }

      const currentTs = Date.parse(String(current.created_at ?? '')) || 0;
      const nextTs = Date.parse(String(row.created_at ?? '')) || 0;
      if (nextTs >= currentTs) {
        latestByPgcEmpresa.set(key, row);
      }
    }

    const dedupedRows = Array.from(latestByPgcEmpresa.values());
    dedupedRows.sort((a, b) => {
      const aPgc = Number(String(a.pgc).replace(/\D/g, ''));
      const bPgc = Number(String(b.pgc).replace(/\D/g, ''));
      if (Number.isFinite(aPgc) && Number.isFinite(bPgc) && aPgc !== bPgc) return bPgc - aPgc;
      return String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''));
    });

    return dedupedRows;
  }

  async list(query: ListCredoresQueryDto) {

    // Filtro base
    let where: Prisma.CredorWhereInput = {
      grupoId: query.grupoId ?? undefined,
      periodo: query.periodo ?? undefined,
      enviado: query.enviado,
    };

    if (query.nome?.trim()) {
      where.nomeCanonico = { contains: toCanonical(query.nome), mode: 'insensitive' };
    }

    // Filtro por numero_pgc: só retorna credores que tenham pelo menos 1 rendimento com esse numero_pgc
    if (query.numero_pgc) {
      where = {
        ...where,
        rendimentos: {
          some: {
            numero_pgc: query.numero_pgc,
          },
        },
      };
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.credor.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: { [query.orderBy ?? 'nomeExibivel']: query.order ?? 'asc' },
        include: {
          grupo: true,
          rendimentos: {
            select: {
              valor: true,
              numero_pgc: true,
              referencia: true,
              created_at: true,
            },
            orderBy: { created_at: 'desc' },
          },
        },
      }),
      this.prisma.credor.count({ where }),
    ]);

    const data = items.map((item) => {
      const valorTotal = item.rendimentos.reduce((acc, r) => acc + Number(r.valor), 0);
      const latestRendimento = item.rendimentos[0];

      // Identifica o maior número de PGC numérico entre todos os rendimentos do credor
      const allPgcs = item.rendimentos
        .map(r => ({ pgc: r.numero_pgc, num: Number(String(r.numero_pgc ?? '').replace(/\D/g, '')) }))
        .filter(p => !isNaN(p.num))
        .sort((a, b) => b.num - a.num);

      const latestNumericPgc = allPgcs[0]?.pgc;

      // Calcula o Valor do PGC específico (ou do mais recente numérico)
      const targetPgc = query.numero_pgc || latestNumericPgc || latestRendimento?.numero_pgc;
      const valorPgc = item.rendimentos
        .filter((r) => r.numero_pgc === targetPgc)
        .reduce((acc, r) => acc + Number(r.valor), 0);

      return {
        id: item.id,
        slug: item.slug,
        nome: sanitizeLeadingCredorCode(item.nomeExibivel),
        nome_normalizado: item.nomeCanonico,
        email: item.email,
        periodo: item.periodo || latestRendimento?.referencia || undefined,
        numero_pgc: targetPgc || undefined,
        enviado: item.enviado,
        data_envio: item.data_envio,
        grupo: item.grupo,
        valor_total: valorTotal,
        valor_pgc: valorPgc,
      };
    });

    return {
      data,
      page: {
        skip: query.skip ?? 0,
        take: query.take ?? 20,
        total,
      },
    };
  }

  async getById(id: string) {
    const credor = await this.prisma.credor.findUnique({
      where: { id },
      include: {
        grupo: true,
        rendimentos: { orderBy: { created_at: 'desc' } },
        historicos: { orderBy: { created_at: 'desc' } },
      },
    });

    if (!credor) throw new NotFoundException('Credor nao encontrado.');

    const descontos_historico = await this.loadDiscountHistoryRowsForCredor(credor.nomeExibivel);

    const total = credor.rendimentos.reduce((acc, item) => acc + Number(item.valor), 0);
    const quantidade_periodos = new Set(
      credor.rendimentos
        .map((item) => String(item.numero_pgc ?? '').trim())
        .filter((pgc) => pgc !== '' && pgc !== '-'),
    ).size;

    const media = quantidade_periodos > 0 ? total / quantidade_periodos : 0;

    return {
      ...credor,
      descontos_historico,
      resumo: {
        total,
        media,
        quantidade_periodos,
      },
    };
  }

  async create(dto: CreateCredorDto) {
    const nomeExibivel = toTitleCaseName(dto.nome);
    const nomeCanonico = toCanonical(nomeExibivel);
    const existingByCanonical = await this.prisma.credor.findFirst({
      where: { nomeCanonico },
      select: { id: true },
    });

    if (existingByCanonical) {
      return this.prisma.credor.update({
        where: { id: existingByCanonical.id },
        data: {
          nomeExibivel,
          nomeCanonico,
          email: dto.email?.trim() || undefined,
          periodo: dto.periodo?.trim() || undefined,
          grupoId: dto.grupoId || undefined,
        },
      });
    }

    let slug = toSlug(nomeExibivel);

    if (!slug) {
      throw new BadRequestException('Nome invalido para gerar slug.');
    }

    const slugExists = await this.prisma.credor.findUnique({ where: { slug } });
    if (slugExists) {
      slug = `${slug}-${Math.floor(Math.random() * 10000)}`;
    }

    if (dto.grupoId) {
      const grupo = await this.prisma.grupo.findUnique({ where: { id: dto.grupoId } });
      if (!grupo) {
        throw new BadRequestException('Grupo informado nao existe.');
      }
    }

    try {
      return await this.prisma.credor.create({
        data: {
          slug,
          nomeExibivel,
          nomeCanonico,
          email: dto.email?.trim(),
          periodo: dto.periodo?.trim(),
          grupoId: dto.grupoId,
        },
      });
    } catch {
      throw new ConflictException('Nao foi possivel criar credor.');
    }
  }

  async update(id: string, dto: UpdateCredorDto) {
    const current = await this.prisma.credor.findUnique({ where: { id } });
    if (!current) {
      throw new NotFoundException('Credor nao encontrado.');
    }

    const allowProtected = dto.allow_protected_update === true;
    if (dto.nome && current.protegidoNome && !allowProtected) {
      throw new BadRequestException('Campo nome esta protegido para importacao.');
    }
    if (dto.email && current.protegidoEmail && !allowProtected) {
      throw new BadRequestException('Campo email esta protegido para importacao.');
    }

    if (dto.grupoId) {
      const grupo = await this.prisma.grupo.findUnique({ where: { id: dto.grupoId } });
      if (!grupo) {
        throw new BadRequestException('Grupo informado nao existe.');
      }
    }

    const nomeExibivel = dto.nome ? toTitleCaseName(dto.nome) : undefined;
    const nomeCanonico = nomeExibivel ? toCanonical(nomeExibivel) : undefined;

    if (nomeCanonico) {
      const duplicate = await this.prisma.credor.findFirst({
        where: {
          nomeCanonico,
          id: { not: id },
        },
        select: { id: true },
      });

      if (duplicate) {
        throw new ConflictException('Ja existe um credor com este nome.');
      }
    }

    return this.prisma.credor.update({
      where: { id },
      data: {
        nomeExibivel,
        nomeCanonico,
        email: dto.email?.trim(),
        periodo: dto.periodo?.trim(),
        grupoId: dto.grupoId,
        enviado: dto.enviado,
        data_envio: dto.data_envio ? new Date(dto.data_envio) : dto.enviado === false ? null : undefined,
      },
    });
  }

  async remove(id: string) {
    const found = await this.prisma.credor.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('Credor nao encontrado.');

    await this.prisma.$transaction(async (tx) => {
      await tx.credorProcessingStatus.deleteMany({ where: { credorId: id } });
      await tx.credor.delete({ where: { id } });
    });
    return { deleted: true };
  }

  async batchMarkEnviado(dto: BatchActionDto) {
    const now = new Date();
    await this.prisma.credor.updateMany({
      where: { id: { in: dto.ids } },
      data: { enviado: true, data_envio: now },
    });
    return { updated: dto.ids.length };
  }

  async batchMarkNaoEnviado(dto: BatchActionDto) {
    await this.prisma.credor.updateMany({
      where: { id: { in: dto.ids } },
      data: { enviado: false, data_envio: null },
    });
    return { updated: dto.ids.length };
  }

  async batchDelete(dto: BatchActionDto) {
    await this.prisma.$transaction(async (tx) => {
      await tx.credorProcessingStatus.deleteMany({ where: { credorId: { in: dto.ids } } });
      await tx.credor.deleteMany({ where: { id: { in: dto.ids } } });
    });
    return { deleted: dto.ids.length };
  }

  async exportRows(query: ListCredoresQueryDto) {
    const result = await this.list({ ...query, skip: 0, take: 5000 });
    return result.data.map((item) => ({
      nome: item.nome,
      nome_normalizado: item.nome_normalizado,
      email: item.email ?? '',
      periodo: item.periodo ?? '',
      enviado: item.enviado ? 'sim' : 'nao',
      data_envio: item.data_envio ? new Date(item.data_envio).toISOString() : '',
      grupo: item.grupo?.nome ?? '',
      valor_total: item.valor_total,
    }));
  }

  async openFolder(id: string, numeroPgc?: string) {
    const credor = await this.prisma.credor.findUnique({ where: { id }, include: { grupo: true } });
    if (!credor) {
      throw new NotFoundException('Credor nao encontrado.');
    }

    const workspaceRoot = resolveProjectRootFromCwd();
    const targetPgcRaw = String(numeroPgc ?? '').trim();
    const targetPgcNumeric = String(Number(targetPgcRaw));
    const targetPgcs = Array.from(new Set([targetPgcRaw, targetPgcNumeric].filter((v) => v && v !== 'NaN')));

    const candidateRoots: string[] = [];

    if (targetPgcs.length > 0) {
      const groupFolder = resolveGroupFolderName(credor.grupo?.nome);
      for (const pgc of targetPgcs) {
        if (groupFolder === 'SPORTS') {
          candidateRoots.push(path.join(workspaceRoot, 'PGC', 'SPORTS', pgc));
        } else if (groupFolder === 'LGM') {
          candidateRoots.push(path.join(workspaceRoot, 'LGM', `LGM${pgc}`));
        } else {
          candidateRoots.push(path.join(workspaceRoot, 'PGC', pgc));
        }
      }
    }

    const artifactsRoot = path.join(workspaceRoot, 'artifacts');
    const artifactsPgcDirs = await fs.readdir(artifactsRoot, { withFileTypes: true }).catch(() => []);
    for (const dir of artifactsPgcDirs) {
      if (!dir.isDirectory()) continue;
      candidateRoots.push(path.join(artifactsRoot, dir.name));
    }

    const expectedFolders = [
      toUpperFolder(credor.nomeExibivel),
      toUpperFolder(sanitizeLeadingCredorCode(credor.nomeExibivel)),
      sanitizeLeadingCredorCode(credor.nomeExibivel),
      credor.nomeExibivel,
    ].filter(Boolean);

    for (const root of candidateRoots) {
      const rootExists = await fs
        .stat(root)
        .then((st) => st.isDirectory())
        .catch(() => false);
      if (!rootExists) continue;

      const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);

      // Fast path: tenta abrir nomes esperados de pasta primeiro.
      for (const name of expectedFolders) {
        const direct = path.join(root, name);
        const exists = await fs
          .stat(direct)
          .then((st) => st.isDirectory())
          .catch(() => false);
        if (exists) {
          exec(`start "" "${direct}"`);
          return { opened: true, path: direct };
        }
      }

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (!isLikelyCredorFolderMatch(entry.name, credor.nomeExibivel)) continue;

        const candidate = path.join(root, entry.name);
        exec(`start "" "${candidate}"`);
        return { opened: true, path: candidate };
      }
    }

    return {
      opened: false,
      message: targetPgcs.length > 0
        ? `Pasta do credor nao encontrada para o PGC ${targetPgcs[0]}.`
        : 'Pasta do credor nao encontrada nos artefatos locais.',
    };
  }

  async generateCredorPdf(id: string): Promise<Buffer> {
    const credor = await this.getById(id);
    const doc = new PDFDocument({ margin: 40 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)));

    doc.fontSize(18).text('Relatorio Completo de Credor');
    doc.moveDown();
    doc.fontSize(12).text(`Nome: ${credor.nomeExibivel}`);
    doc.text(`Email: ${credor.email ?? '-'}`);
    doc.text(`Periodo: ${credor.periodo ?? '-'}`);
    doc.text(`Grupo: ${credor.grupo?.nome ?? '-'}`);
    doc.text(`Total: ${Number(credor.resumo.total).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
    doc.text(`Media: ${Number(credor.resumo.media).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
    doc.moveDown();

    doc.fontSize(14).text('Historico PGC');
    for (const h of credor.historicos) {
      doc.fontSize(10).text(`- ${h.numero_pgc ?? 'SEM_PGC'} | ${h.periodo ?? '-'} | ${h.evento}`);
    }

    doc.moveDown();
    doc.fontSize(14).text('Rendimentos');
    for (const r of credor.rendimentos) {
      doc
        .fontSize(10)
        .text(
          `- ${r.numero_pgc ?? 'SEM_PGC'} | ${r.referencia} | ${Number(r.valor).toLocaleString('pt-BR', {
            minimumFractionDigits: 2,
          })}`,
        );
    }

    doc.end();
    await new Promise<void>((resolve) => doc.on('end', () => resolve()));
    return Buffer.concat(chunks);
  }

  async generateRendimentoPdf(id: string): Promise<Buffer> {
    const rendimento = await this.prisma.rendimento.findUnique({
      where: { id },
      include: { credor: true },
    });
    if (!rendimento) {
      throw new NotFoundException('Rendimento nao encontrado.');
    }

    const doc = new PDFDocument({ margin: 40 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)));

    doc.fontSize(18).text('Rendimento Individual');
    doc.moveDown();
    doc.fontSize(12).text(`Credor: ${rendimento.credor.nomeExibivel}`);
    doc.text(`PGC: ${rendimento.numero_pgc ?? 'SEM_PGC'}`);
    doc.text(`Referencia: ${rendimento.referencia}`);
    doc.text(`Valor: ${Number(rendimento.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
    doc.end();

    await new Promise<void>((resolve) => doc.on('end', () => resolve()));
    return Buffer.concat(chunks);
  }

  async generateBatchPdfZip(ids: string[]): Promise<Buffer> {
    const zip = new JSZip();

    for (const id of ids) {
      const credor = await this.prisma.credor.findUnique({ where: { id } });
      if (!credor) continue;

      const pdf = await this.generateCredorPdf(id);
      zip.file(`${credor.slug || id}.pdf`, pdf);
    }

    return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } });
  }
}
