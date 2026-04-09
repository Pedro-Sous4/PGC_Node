import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ProcessingStatus } from '@prisma/client';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import nodemailer from 'nodemailer';
import JSZip from 'jszip';
import { PrismaService } from '../../../infra/prisma.service';
import { SendEmailsDto } from '../dto/send-emails.dto';
import { UpdateTemplateDto } from '../dto/update-template.dto';
import { SystemSettingsService } from '../../system-settings/application/system-settings.service';

type EmailTemplate = {
  mensagem_principal: string;
  texto_minimo: string;
  texto_descontos: string;
};

const DEFAULT_TEMPLATE: EmailTemplate = {
  mensagem_principal:
    '{credor.nome},\nOlá,\n\nSegue em anexo produtividade, relatório com os bloqueios de comissão (distrato e inadimplência) e relação de clientes repassados.\n\nNo e-mail constam 4 planilhas, sendo elas:\n- Os valores de cada empresa para emissão - PGC {historico.numero_pgc} EMISSÃO\n- O borderô com os clientes que estão sendo repassados - PGC {historico.numero_pgc}\n- A produtividade que está com o nome PRODUTIVIDADE {historico.periodo}\n- O histórico das comissões bloqueadas por inadimplência e/ou distrato - EXTRATO\n\n{info_minimo}\n{info_descontos}\n\n\nNotas devem ser enviadas até SEXTA-FEIRA, dia 16/{historico.periodo}, às 12:00h.\n\nInformamos que o endereço da empresa ALTOS DA BORGES EMPREENDIMENTOS IMOBILIÁRIOS LTDA foi alterado para o seguinte local:\nRua Luiz de Camões, 360, Vila Nova, Novo Hamburgo/RS – CEP: 93.520-280.\n\nRessaltamos que, a partir desta data, não serão aceitas notas fiscais emitidas com o endereço antigo.\n\nAtenciosamente,',
  texto_minimo: 'Minimo/fixo: {minimo.valor}. Empresa emissao: {minimo.empresa}. CNPJ: {minimo.cnpj}.',
  texto_descontos: 'Descontos aplicados:\n{linhas_descontos}',
};

type MinimoInfo = {
  valor: string;
  empresa: string;
  cnpj: string;
};

type DiscountHistoryEntry = {
  requestId?: string;
  numeroPgc?: string;
  credorName?: string;
  credorSlug?: string;
  empresa?: string;
  aplicadoNoPgc?: number;
  descontoAtual?: number;
};

type SendReport = {
  sent: number;
  failed: number;
  pending: number;
  details: Array<{
    credorId: string;
    status: string;
    attempts: number;
    fromEmail?: string;
    info_minimo?: string;
    info_descontos?: string;
    error?: string;
    batch?: number;
  }>;
};

type MailAttachment = {
  filename: string;
  path?: string;
  content?: Buffer;
};

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  if (chunkSize <= 0) return [items];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

function normalizeCredorKey(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function textOf(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizeGoldenCredorName(nome: string): string {
  let text = String(nome ?? '');
  text = text.replace(/^\s*\d+\s*[-–—:\._]*\s*/u, '');
  text = text.replace(/\([^)]*\)/g, '');
  return normalizeCredorKey(text);
}

function parseNumberLikeWorker(value: unknown): number {
  const raw = String(value ?? '').trim();
  if (!raw) return 0;

  let normalized = raw.replace(/\s/g, '');
  normalized = normalized.replace(/[^0-9,.-]/g, '');

  const hasComma = normalized.includes(',');
  const hasDot = normalized.includes('.');

  if (hasComma && hasDot) {
    const lastComma = normalized.lastIndexOf(',');
    const lastDot = normalized.lastIndexOf('.');
    const decimalSep = lastComma > lastDot ? ',' : '.';
    const thousandSep = decimalSep === ',' ? '.' : ',';
    normalized = normalized.split(thousandSep).join('');
    normalized = normalized.replace(decimalSep, '.');
  } else if (hasComma) {
    normalized = normalized.replace(/\./g, '');
    normalized = normalized.replace(',', '.');
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrencyBr(value: number): string {
  if (!Number.isFinite(value)) return 'R$ 0,00';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function formatDescontoLine(descricao: string, valor: string): string {
  const empresa = String(descricao ?? '')
    .replace(/^\s*\d+\s*-\s*/i, '')
    .trim();
  const valorTexto = String(valor ?? '').trim();

  if (valorTexto && empresa) {
    return `Desconto de ${valorTexto} na empresa ${empresa}`;
  }

  if (valorTexto) {
    return `Desconto de ${valorTexto}`;
  }

  if (empresa) {
    return `Desconto na empresa ${empresa}`;
  }

  return '';
}

function hasMinimoData(minimo: MinimoInfo): boolean {
  const valor = String(minimo.valor ?? '').trim();
  return valor !== '' && valor !== '-';
}

function hasWorkbookExtension(fileName: string): boolean {
  return /\.(xlsx|xlsm|xls)$/i.test(fileName);
}

function uniqueAttachments(items: MailAttachment[]): MailAttachment[] {
  const seen = new Set<string>();
  const out: MailAttachment[] = [];

  for (const item of items) {
    const key = item.path ? `path:${path.resolve(item.path)}` : `content:${item.filename}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }

  return out;
}

function applyTemplate(template: string, map: Record<string, string>): string {
  let text = template;
  for (const [key, value] of Object.entries(map)) {
    text = text.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  }
  return text;
}

function adaptTemplateWithoutProdutividade(template: string): string {
  const withoutProdutividadeLines = template
    .split(/\r?\n/)
    .filter((line) => !/produtividade/i.test(line))
    .join('\n');

  return withoutProdutividadeLines
    .replace(/No e-mail constam\s+4\s+planilhas/gi, 'No e-mail constam 3 planilhas')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

@Injectable()
export class EmailsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly systemSettingsService: SystemSettingsService,
  ) {}

  private resolveWorkspaceRoot(): string {
    const cwd = process.cwd();
    const parent = path.dirname(cwd);
    const grandParent = path.dirname(parent);

    if (path.basename(cwd) === 'api' && path.basename(parent) === 'apps') {
      return grandParent;
    }

    return cwd;
  }

  private get templatePath() {
    return path.join(process.cwd(), '.runtime', 'email-template.json');
  }

  async getTemplate(): Promise<EmailTemplate> {
    try {
      const content = await fs.readFile(this.templatePath, 'utf8');
      return { ...DEFAULT_TEMPLATE, ...(JSON.parse(content) as Partial<EmailTemplate>) };
    } catch {
      return DEFAULT_TEMPLATE;
    }
  }

  async updateTemplate(dto: UpdateTemplateDto): Promise<EmailTemplate> {
    await fs.mkdir(path.dirname(this.templatePath), { recursive: true });
    await fs.writeFile(this.templatePath, JSON.stringify(dto, null, 2), 'utf8');
    return dto;
  }

  async sendIndividual(credorId: string, numeroPgc: string) {
    const credor = await this.prisma.credor.findUnique({ where: { id: credorId } });
    if (!credor) throw new NotFoundException('Credor nao encontrado.');

    const report = await this.sendToCredores([credor.id], numeroPgc);
    return report;
  }

  async sendBatch(dto: SendEmailsDto) {
    const where: { grupoId?: string; id?: { in: string[] } } = {};
    if (dto.grupoId) where.grupoId = dto.grupoId;
    if (dto.escopo === 'credor') {
      if (!dto.credorIds?.length) {
        return {
          sent: 0,
          failed: 0,
          pending: 0,
          details: [],
          lotes: [],
          total_geral: {
            totalCredores: 0,
            sent: 0,
            failed: 0,
            pending: 0,
            quantidadeLotes: 0,
            tamanhoLoteConfigurado: 0,
          },
        };
      }
      where.id = { in: dto.credorIds };
    }

    const credores = await this.prisma.credor.findMany({ where });
    const credorIds = credores.map((item) => item.id);
    const systemSettings = await this.systemSettingsService.getSettings();
    const chunkSize = Math.max(1, Number(systemSettings.envio.loteMaximoCredores ?? 200));
    const batches = chunkArray(credorIds, chunkSize);

    const total: SendReport = {
      sent: 0,
      failed: 0,
      pending: 0,
      details: [],
    };

    const relatorioPorLote: Array<{
      lote: number;
      totalCredores: number;
      sent: number;
      failed: number;
      pending: number;
    }> = [];

    for (let i = 0; i < batches.length; i += 1) {
      const batchNumber = i + 1;
      const ids = batches[i];
      const parcial = await this.sendToCredores(ids, dto.numero_pgc, batchNumber);

      total.sent += parcial.sent;
      total.failed += parcial.failed;
      total.pending += parcial.pending;
      total.details.push(...parcial.details);

      relatorioPorLote.push({
        lote: batchNumber,
        totalCredores: ids.length,
        sent: parcial.sent,
        failed: parcial.failed,
        pending: parcial.pending,
      });
    }

    return {
      ...total,
      lotes: relatorioPorLote,
      total_geral: {
        totalCredores: credorIds.length,
        sent: total.sent,
        failed: total.failed,
        pending: total.pending,
        quantidadeLotes: relatorioPorLote.length,
        tamanhoLoteConfigurado: chunkSize,
      },
    };
  }

  async report(limit = 200) {
    return this.prisma.emailLog.findMany({
      orderBy: { created_at: 'desc' },
      take: limit,
      include: { credor: true },
    });
  }

  private async resolvePgcDir(numeroPgc: string): Promise<string | null> {
    const workspaceRoot = this.resolveWorkspaceRoot();
    const candidates = [
      path.join(workspaceRoot, 'PGC', 'LGM', String(numeroPgc)),
      path.join(workspaceRoot, 'PGC', 'SPORTS', String(numeroPgc)),
      path.join(workspaceRoot, 'LGM', `LGM${numeroPgc}`),
      path.join(process.cwd(), 'artifacts', `pgc-${numeroPgc}`),
      path.join(process.cwd(), '..', '..', 'artifacts', `pgc-${numeroPgc}`),
      path.join(process.cwd(), 'apps', 'api', 'artifacts', `pgc-${numeroPgc}`),
    ];

    for (const candidate of candidates) {
      const exists = await fs
        .stat(candidate)
        .then((st) => st.isDirectory())
        .catch(() => false);
      if (exists) return candidate;
    }

    return null;
  }

  private async loadEmpresaCnpjMap(pgcDir: string): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const candidates = [
      path.join(pgcDir, 'EMPRESAS_NOMECURTO_CNPJ.xlsx'),
      path.join(path.dirname(pgcDir), 'EMPRESAS_NOMECURTO_CNPJ.xlsx'),
      path.join(process.cwd(), 'artifacts', 'EMPRESAS_NOMECURTO_CNPJ.xlsx'),
      path.join(process.cwd(), '..', '..', 'artifacts', 'EMPRESAS_NOMECURTO_CNPJ.xlsx'),
    ];

    let filePath: string | null = null;
    for (const candidate of candidates) {
      const exists = await fs
        .stat(candidate)
        .then((st) => st.isFile())
        .catch(() => false);
      if (exists) {
        filePath = candidate;
        break;
      }
    }

    if (!filePath) return map;

    const wb = XLSX.readFile(filePath);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });

    for (const row of rows) {
      const nomeCurto = textOf(row.nome_curto ?? row.NOME_CURTO ?? row.empresa ?? row.EMPRESA);
      const cnpj = textOf(row.cnpj ?? row.CNPJ);
      if (nomeCurto) {
        map.set(nomeCurto.toUpperCase(), cnpj);
      }
    }

    return map;
  }

  private extractMinimoFromWorksheet(
    ws: XLSX.WorkSheet,
    credorNome: string,
    empresaMap: Map<string, string>,
  ): MinimoInfo {
    const normalizedCredor = normalizeCredorKey(credorNome);
    const normalizedCredorGolden = normalizeGoldenCredorName(credorNome);
    const rowsObj = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
    for (const row of rowsObj) {
      const credor = textOf(row.CREDOR ?? row['CREDOR (AG)'] ?? row.credor);
      const credorNorm = normalizeCredorKey(credor);
      const credorGoldenNorm = normalizeGoldenCredorName(credor);
      if (!credor || (credorNorm !== normalizedCredor && credorGoldenNorm !== normalizedCredorGolden)) continue;

      const valor = textOf(row['MINIMO/FIXO'] ?? row.MINIMO ?? row.minimo);
      const empresa = textOf(row['EMPRESA EMISSAO'] ?? row.EMPRESA ?? row.empresa);
      const cnpjRaw = textOf(row.CNPJ ?? row.cnpj);
      const cnpj = cnpjRaw || empresaMap.get(empresa.toUpperCase()) || '-';

      const valorNum = parseNumberLikeWorker(valor);
      return {
        valor: valorNum > 0 ? formatCurrencyBr(valorNum) : (valor || '-'),
        empresa: empresa || '-',
        cnpj,
      };
    }

    const rowsArray = XLSX.utils.sheet_to_json<Array<unknown>>(ws, {
      header: 1,
      raw: false,
      defval: '',
    });

    // Fallback de layout tabular clássico.
    for (let i = 1; i < rowsArray.length; i += 1) {
      const row = rowsArray[i];
      const credor = textOf(row[32]);
      const credorNorm = normalizeCredorKey(credor);
      const credorGoldenNorm = normalizeGoldenCredorName(credor);
      if (!credor || (credorNorm !== normalizedCredor && credorGoldenNorm !== normalizedCredorGolden)) continue;

      const valor = textOf(row[40]);
      const empresa = textOf(row[41]);
      const cnpj = empresaMap.get(empresa.toUpperCase()) || '-';

      const valorNum = parseNumberLikeWorker(valor);
      return {
        valor: valorNum > 0 ? formatCurrencyBr(valorNum) : (valor || '-'),
        empresa: empresa || '-',
        cnpj,
      };
    }

    // Fallback Golden pivô — regra AA PGC: credor 31, fallback 34; mínimo 39, fallback 40.
    const GOLDEN_START_ROW = 7;
    for (let i = GOLDEN_START_ROW; i < rowsArray.length; i += 1) {
      const row = rowsArray[i] ?? [];
      const credor = textOf(row[31]) || textOf(row[34]);
      if (!credor) continue;

      const credorNorm = normalizeCredorKey(credor);
      const credorGoldenNorm = normalizeGoldenCredorName(credor);
      if (credorNorm !== normalizedCredor && credorGoldenNorm !== normalizedCredorGolden) continue;

      const minimo = parseNumberLikeWorker(row[39]) || parseNumberLikeWorker(row[40]);
      if (minimo <= 0) continue;

      const empresa = textOf(row[40]);
      const cnpjRaw = textOf(row[41]);
      const cnpj = cnpjRaw || empresaMap.get(empresa.toUpperCase()) || '-';

      return {
        valor: formatCurrencyBr(minimo),
        empresa: empresa || '-',
        cnpj,
      };
    }

    return { valor: '-', empresa: '-', cnpj: '-' };
  }

  private async loadMinimoInfo(
    pgcDir: string | null,
    credorNome: string,
    numeroPgc: string,
  ): Promise<MinimoInfo> {
    if (!pgcDir) {
      return { valor: '-', empresa: '-', cnpj: '-' };
    }

    const minimoPath = path.join(pgcDir, 'MINIMO.xlsx');
    const minimoExists = await fs
      .stat(minimoPath)
      .then((st) => st.isFile())
      .catch(() => false);

    const empresaMap = await this.loadEmpresaCnpjMap(pgcDir);

    if (!minimoExists) {
      return { valor: '-', empresa: '-', cnpj: '-' };
    }

    const wb = XLSX.readFile(minimoPath);
    const ws = wb.Sheets[wb.SheetNames[0]];
    return this.extractMinimoFromWorksheet(ws, credorNome, empresaMap);
  }

  private async loadDescontosInfo(
    pgcDir: string | null,
    credorNome: string,
    numeroPgc: string,
    requestId?: string,
  ): Promise<string[]> {
    if (!pgcDir) {
      return [];
    }

    const descontosPath = path.join(pgcDir, 'DESCONTOS.xlsx');
    const exists = await fs
      .stat(descontosPath)
      .then((st) => st.isFile())
      .catch(() => false);
    const normalizedCredor = normalizeCredorKey(credorNome);

    if (exists) {
      const wb = XLSX.readFile(descontosPath);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
      const lines: string[] = [];

      for (const row of rows) {
        const credor = textOf(row.CREDOR ?? row.credor ?? row.NOME ?? row.nome);
        if (!credor || normalizeCredorKey(credor) !== normalizedCredor) continue;

        const descricao = textOf(row.DESCRICAO ?? row.descricao ?? row.TIPO ?? row.tipo);
        const valor = textOf(row.VALOR ?? row.valor ?? row.DESCONTO ?? row.desconto);

        if (descricao && valor) {
          const formattedLine = formatDescontoLine(descricao, valor);
          if (formattedLine) {
            lines.push(formattedLine);
          }
        } else {
          const fallback = Object.values(row)
            .map((v) => textOf(v))
            .filter(Boolean)
            .join(' | ');
          if (fallback) {
            lines.push(`- ${fallback}`);
          }
        }
      }

      return lines;
    }

    // Golden fallback: usa o historico de descontos persistido pelo worker.
    const historyFile = path.join(path.dirname(pgcDir), 'descontos-historico.json');
    const historyExists = await fs
      .stat(historyFile)
      .then((st) => st.isFile())
      .catch(() => false);
    if (!historyExists) {
      return [];
    }

    const raw = await fs.readFile(historyFile, 'utf8').catch(() => '[]');
    let entries: DiscountHistoryEntry[] = [];
    try {
      entries = JSON.parse(raw) as DiscountHistoryEntry[];
    } catch {
      return [];
    }

    const targetNumero = String(numeroPgc ?? '').trim();
    const targetRequest = String(requestId ?? '').trim();

    const scoped = entries.filter((entry) => {
      const byCredor = normalizeCredorKey(entry.credorName ?? '') === normalizedCredor;
      if (!byCredor) return false;

      const byNumero = String(entry.numeroPgc ?? '').trim() === targetNumero;
      if (!byNumero) return false;

      if (targetRequest) {
        return String(entry.requestId ?? '').trim() === targetRequest;
      }

      return true;
    });

    if (scoped.length === 0) {
      return [];
    }

    const lines: string[] = [];
    for (const entry of scoped) {
      const empresa = textOf(entry.empresa);
      const aplicado = Number(entry.aplicadoNoPgc ?? 0);
      const descontoAtual = Number(entry.descontoAtual ?? 0);
      if (!empresa) continue;
      if (aplicado <= 0 && descontoAtual <= 0) continue;

      if (aplicado > 0) {
        const formattedLine = formatDescontoLine(empresa, formatCurrencyBr(aplicado));
        if (formattedLine) {
          lines.push(formattedLine);
        }
      } else {
        const formattedLine = formatDescontoLine(empresa, formatCurrencyBr(descontoAtual));
        if (formattedLine) {
          lines.push(formattedLine);
        }
      }
    }

    return lines;
  }

  private async hasProdutividadeArquivo(pgcDir: string | null): Promise<boolean> {
    if (!pgcDir) return false;

    try {
      const entries = await fs.readdir(pgcDir, { withFileTypes: true });
      return entries.some((entry) => entry.isFile() && /produtividade/i.test(entry.name));
    } catch {
      return false;
    }
  }

  private async listWorkbookFiles(dirPath: string): Promise<string[]> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true }).catch(() => []);
    return entries
      .filter((entry) => entry.isFile() && hasWorkbookExtension(entry.name))
      .map((entry) => path.join(dirPath, entry.name));
  }

  private async findCredorDir(rootDir: string, credorNome: string): Promise<string | null> {
    const entries = await fs.readdir(rootDir, { withFileTypes: true }).catch(() => []);
    const dirs = entries.filter((entry) => entry.isDirectory());
    if (dirs.length === 0) return null;

    const targetKey = normalizeCredorKey(credorNome);

    const exact = dirs.find((dir) => normalizeCredorKey(dir.name) === targetKey);
    if (exact) return path.join(rootDir, exact.name);

    const partial = dirs.find((dir) => {
      const key = normalizeCredorKey(dir.name);
      return key.includes(targetKey) || targetKey.includes(key);
    });
    if (partial) return path.join(rootDir, partial.name);

    return null;
  }

  private async resolveAttachmentsFromRequestsZip(
    requestId: string,
    credorNome: string,
  ): Promise<MailAttachment[]> {
    const workspaceRoot = this.resolveWorkspaceRoot();
    const zipPath = path.join(workspaceRoot, 'requests', requestId, 'outputs.zip');
    const exists = await fs
      .stat(zipPath)
      .then((st) => st.isFile())
      .catch(() => false);
    if (!exists) return [];

    const normalizedCredor = normalizeCredorKey(credorNome);
    const zipBuffer = await fs.readFile(zipPath);
    const zip = await JSZip.loadAsync(zipBuffer);
    const attachments: MailAttachment[] = [];

    for (const [entryName, entry] of Object.entries(zip.files)) {
      if (entry.dir) continue;
      if (!hasWorkbookExtension(entryName)) continue;

      const normalizedEntry = normalizeCredorKey(entryName.replace(/[\\/]+/g, ' '));
      if (!normalizedEntry.includes(normalizedCredor)) continue;

      const content = await entry.async('nodebuffer');
      attachments.push({ filename: path.basename(entryName), content });
    }

    return attachments;
  }

  private async resolveCredorAttachments(
    credorNome: string,
    numeroPgc: string,
    pgcDir: string | null,
    requestId?: string,
  ): Promise<MailAttachment[]> {
    const attachments: MailAttachment[] = [];

    if (pgcDir) {
      const credorDir = await this.findCredorDir(pgcDir, credorNome);
      if (credorDir) {
        const files = await this.listWorkbookFiles(credorDir);
        attachments.push(...files.map((filePath) => ({ filename: path.basename(filePath), path: filePath })));
      }
    }

    if (requestId) {
      const workspaceRoot = this.resolveWorkspaceRoot();
      const requestRoot = path.join(workspaceRoot, 'requests', requestId);

      const extractedRoots = [
        path.join(requestRoot, '_inspect'),
        path.join(requestRoot, 'outputs'),
      ];

      for (const root of extractedRoots) {
        const rootExists = await fs
          .stat(root)
          .then((st) => st.isDirectory())
          .catch(() => false);
        if (!rootExists) continue;

        const credorDir = await this.findCredorDir(root, credorNome);
        if (!credorDir) continue;

        const files = await this.listWorkbookFiles(credorDir);
        attachments.push(...files.map((filePath) => ({ filename: path.basename(filePath), path: filePath })));
      }

      if (attachments.length === 0) {
        const zipAttachments = await this.resolveAttachmentsFromRequestsZip(requestId, credorNome);
        attachments.push(...zipAttachments);
      }
    }

    if (attachments.length === 0) {
      const pgcFallbackDir = await this.resolvePgcDir(numeroPgc);
      if (pgcFallbackDir && (!pgcDir || path.resolve(pgcFallbackDir) !== path.resolve(pgcDir))) {
        const credorDir = await this.findCredorDir(pgcFallbackDir, credorNome);
        if (credorDir) {
          const files = await this.listWorkbookFiles(credorDir);
          attachments.push(...files.map((filePath) => ({ filename: path.basename(filePath), path: filePath })));
        }
      }
    }

    return uniqueAttachments(attachments);
  }

  private async sendToCredores(credorIds: string[], numeroPgc: string, batch?: number): Promise<SendReport> {
    const template = await this.getTemplate();
    const pgcDir = await this.resolvePgcDir(numeroPgc);
    const hasProdutividade = await this.hasProdutividadeArquivo(pgcDir);
    const result: SendReport = {
      sent: 0,
      failed: 0,
      pending: 0,
      details: [],
    };

    const systemSettings = await this.systemSettingsService.getSettings();
    const fromName = systemSettings.email.fromName.trim();
    const fromAddress = systemSettings.email.fromAddress.trim();
    const replyTo = systemSettings.email.replyTo.trim();
    const intervaloEntreEnvios = Math.max(0, Number(systemSettings.envio.intervaloMsEntreEnvios ?? 0));
    const smtpHost = systemSettings.smtp.host.trim();
    const smtpPort = Number(systemSettings.smtp.port);
    const smtpUser = systemSettings.smtp.user.trim();
    const smtpPass = systemSettings.smtp.pass;
    const senderLabel = fromAddress ? `${fromName} <${fromAddress}>` : '';

    if (!fromAddress) {
      throw new BadRequestException(
        'Remetente nao configurado. Defina Email de disparo em Configuracoes > E-mail.',
      );
    }

    if (!smtpHost || !Number.isFinite(smtpPort) || !smtpUser || !smtpPass) {
      throw new BadRequestException(
        'SMTP nao configurado. Defina host, porta, usuario e senha em Configuracoes > SMTP.',
      );
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: Boolean(systemSettings.smtp.secure),
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });

    await transporter.verify();

    for (const credorId of credorIds) {
      const credor = await this.prisma.credor.findUnique({
        where: { id: credorId },
        include: { grupo: { select: { nome: true } } },
      });
      if (!credor) continue;

      const historico = await this.prisma.historicoPGC.findFirst({
        where: {
          credorId,
          numero_pgc: numeroPgc,
        },
        orderBy: { created_at: 'desc' },
      });

        const attachments = await this.resolveCredorAttachments(
          credor.nomeExibivel,
          numeroPgc,
          pgcDir,
          historico?.requestId,
        );

      let log = await this.prisma.emailLog.create({
        data: {
          requestId: `email-${numeroPgc}-${credorId}`,
          credorId,
          toEmail: credor.email ?? '',
          status: ProcessingStatus.PENDING,
        },
      });

      try {
        if (!credor.email) {
          throw new BadRequestException('Credor sem e-mail cadastrado.');
        }

        log = await this.prisma.emailLog.update({
          where: { id: log.id },
          data: {
            status: ProcessingStatus.PROCESSING,
            attempts: { increment: 1 },
            tentativas: { increment: 1 },
            last_attempt_at: new Date(),
          },
        });

        const isSports = String(credor.grupo?.nome ?? '').toUpperCase() === 'SPORTS';
        const minimo = await this.loadMinimoInfo(pgcDir, credor.nomeExibivel, numeroPgc);
        const descontosLines = await this.loadDescontosInfo(
          pgcDir,
          credor.nomeExibivel,
          numeroPgc,
          historico?.requestId,
        );
        const includeMinimo = !isSports && hasMinimoData(minimo);
        const includeDescontos = !isSports && descontosLines.length > 0;

        const infoMinimo = includeMinimo
          ? applyTemplate(template.texto_minimo, {
              'minimo.valor': minimo.valor,
              'minimo.empresa': minimo.empresa,
              'minimo.cnpj': minimo.cnpj,
              valor_formatado: minimo.valor,
              empresa: minimo.empresa,
              cnpj: minimo.cnpj,
              info_minimo: minimo.valor,
            })
          : '';

        const infoDescontos = includeDescontos
          ? applyTemplate(template.texto_descontos, {
              linhas_descontos: descontosLines.join('\n'),
              info_descontos: descontosLines.join('; '),
            })
          : '';

        const mensagemPrincipal = isSports && !hasProdutividade
          ? adaptTemplateWithoutProdutividade(template.mensagem_principal)
          : template.mensagem_principal;

        const bodyRaw = applyTemplate(mensagemPrincipal, {
          'credor.nome': credor.nomeExibivel,
          'historico.numero_pgc': numeroPgc,
          'historico.periodo': historico?.periodo ?? credor.periodo ?? '-',
          'sistema.remetente': senderLabel || '-',
          info_minimo: infoMinimo,
          info_descontos: infoDescontos,
        });

        const body = bodyRaw
          .replace(/[ \t]+\n/g, '\n')
          .replace(/\n{3,}/g, '\n\n')
          .trim();

        if (!body.trim()) {
          throw new BadRequestException('Template gerou corpo de email vazio.');
        }

        const subjectTemplate = systemSettings.email.assuntoPadrao || 'PGC {historico.numero_pgc} - {historico.periodo}';
        const subject = applyTemplate(subjectTemplate, {
          'historico.numero_pgc': numeroPgc,
          'historico.periodo': historico?.periodo ?? credor.periodo ?? '-',
          'credor.nome': credor.nomeExibivel,
        });

        await transporter.sendMail({
          from: senderLabel,
          to: credor.email,
          replyTo: replyTo || undefined,
          subject,
          text: body,
          attachments,
        });

        await this.prisma.emailLog.update({
          where: { id: log.id },
          data: {
            status: ProcessingStatus.SUCCESS,
            sent_at: new Date(),
            error_message: null,
            erroTecnico: null,
          },
        });

        await this.prisma.credor.update({
          where: { id: credorId },
          data: {
            enviado: true,
            data_envio: new Date(),
          },
        });

        result.sent += 1;
        result.details.push({
          credorId,
          status: 'sent',
          attempts: log.attempts + 1,
          fromEmail: senderLabel,
          info_minimo: infoMinimo || undefined,
          info_descontos: infoDescontos || undefined,
          batch,
        });
      } catch (e) {
        const message = (e as Error).message;
        await this.prisma.emailLog.update({
          where: { id: log.id },
          data: {
            status: ProcessingStatus.ERROR,
            error_message: message,
            erroTecnico: message,
            last_attempt_at: new Date(),
            attempts: { increment: 1 },
            tentativas: { increment: 1 },
          },
        });

        result.failed += 1;
        result.details.push({
          credorId,
          status: 'failed',
          attempts: log.attempts + 1,
          fromEmail: senderLabel || undefined,
          error: message,
          batch,
        });
      } finally {
        if (intervaloEntreEnvios > 0) {
          await wait(intervaloEntreEnvios);
        }
      }
    }

    result.pending = Math.max(0, credorIds.length - result.sent - result.failed);
    return result;
  }
}
