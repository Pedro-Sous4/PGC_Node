import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infra/prisma.service';
import * as XLSX from 'xlsx';

type UploadRow = {
  nome?: string;
  email?: string;
  grupo?: string;
};

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

@Injectable()
export class UploadsService {
  constructor(private readonly prisma: PrismaService) {}

  async processCredoresEmailUpload(buffer: Buffer, allowProtectedUpdate = false) {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const firstSheet = workbook.SheetNames[0];
    if (!firstSheet) {
      throw new BadRequestException('Arquivo sem aba valida.');
    }

    const rows = XLSX.utils.sheet_to_json<UploadRow>(workbook.Sheets[firstSheet], { raw: false, defval: '' });
    if (rows.length === 0) {
      throw new BadRequestException('Arquivo sem dados.');
    }

    const result = {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [] as string[],
    };

    for (const [idx, raw] of rows.entries()) {
      const nome = String(raw.nome ?? '').trim();
      const email = String(raw.email ?? '').trim();
      const grupoNome = String(raw.grupo ?? '').trim();

      if (!nome || !email || !grupoNome) {
        result.errors.push(`Linha ${idx + 2}: colunas obrigatorias nome, email e grupo.`);
        result.skipped += 1;
        continue;
      }

      const grupo = await this.prisma.grupo.findFirst({
        where: { nome: { equals: grupoNome, mode: 'insensitive' } },
      });
      if (!grupo) {
        result.errors.push(`Linha ${idx + 2}: grupo inexistente (${grupoNome}).`);
        result.skipped += 1;
        continue;
      }

      const nomeExibivel = toTitleCaseName(nome);
      const nomeCanonico = toCanonical(nomeExibivel);
      const existing = await this.prisma.credor.findFirst({ where: { nomeCanonico } });

      if (!existing) {
        let slug = toSlug(nomeExibivel);
        if (!slug) {
          result.errors.push(`Linha ${idx + 2}: nome invalido para slug.`);
          result.skipped += 1;
          continue;
        }

        const slugExists = await this.prisma.credor.findUnique({ where: { slug } });
        if (slugExists) {
          slug = `${slug}-${Math.floor(Math.random() * 10000)}`;
        }

        await this.prisma.credor.create({
          data: {
            slug,
            nomeExibivel,
            nomeCanonico,
            email,
            grupoId: grupo.id,
          },
        });
        result.created += 1;
        continue;
      }

      if (existing.protegidoEmail && !allowProtectedUpdate) {
        result.skipped += 1;
        continue;
      }

      await this.prisma.credor.update({
        where: { id: existing.id },
        data: {
          email,
          grupoId: grupo.id,
        },
      });
      result.updated += 1;
    }

    return result;
  }
}
