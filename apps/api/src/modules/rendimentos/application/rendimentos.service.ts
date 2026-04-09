import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infra/prisma.service';
import { CreateRendimentoDto } from '../dto/create-rendimento.dto';
import { UpdateRendimentoDto } from '../dto/update-rendimento.dto';

function parseMoneyBR(input: string): Prisma.Decimal {
  const sanitized = input.replace(/\s/g, '').replace('R$', '').replace(/\./g, '').replace(',', '.');
  const n = Number(sanitized);
  if (!Number.isFinite(n) || n <= 0) {
    throw new BadRequestException('Valor monetario invalido. Use formato BR ex: R$ 1.234,56');
  }
  return new Prisma.Decimal(n);
}

@Injectable()
export class RendimentosService {
  constructor(private readonly prisma: PrismaService) {}

  list(credorId: string) {
    return this.prisma.rendimento.findMany({
      where: { credorId },
      orderBy: [{ referencia: 'desc' }, { created_at: 'desc' }],
    });
  }

  async getById(id: string) {
    const found = await this.prisma.rendimento.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('Rendimento nao encontrado.');
    return found;
  }

  async create(dto: CreateRendimentoDto) {
    await this.ensureCredor(dto.credorId);

    const created = await this.prisma.rendimento.create({
      data: {
        credorId: dto.credorId,
        numero_pgc: dto.numero_pgc,
        referencia: dto.referencia,
        valor: parseMoneyBR(dto.valor),
      },
    });

    await this.syncHistorico(dto.credorId);
    return created;
  }

  async update(id: string, dto: UpdateRendimentoDto) {
    const current = await this.prisma.rendimento.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Rendimento nao encontrado.');

    const updated = await this.prisma.rendimento.update({
      where: { id },
      data: {
        numero_pgc: dto.numero_pgc ?? undefined,
        referencia: dto.referencia ?? undefined,
        valor: dto.valor ? parseMoneyBR(dto.valor) : undefined,
      },
    });

    await this.syncHistorico(current.credorId);
    return updated;
  }

  async remove(id: string) {
    const current = await this.prisma.rendimento.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Rendimento nao encontrado.');

    await this.prisma.rendimento.delete({ where: { id } });
    await this.syncHistorico(current.credorId);
    return { deleted: true };
  }

  private async ensureCredor(credorId: string) {
    const credor = await this.prisma.credor.findUnique({ where: { id: credorId } });
    if (!credor) throw new BadRequestException('Credor nao encontrado.');
    return credor;
  }

  private async syncHistorico(credorId: string) {
    const rendimentos = await this.prisma.rendimento.findMany({ where: { credorId } });

    await this.prisma.historicoPGC.deleteMany({
      where: {
        credorId,
        evento: 'SYNC_RENDIMENTOS',
      },
    });

    const grouped = new Map<string, { numero_pgc: string; periodo: string; total: number }>();
    for (const item of rendimentos) {
      const numero = item.numero_pgc ?? 'SEM_PGC';
      const periodo = item.referencia;
      const key = `${numero}::${periodo}`;
      const prev = grouped.get(key) ?? { numero_pgc: numero, periodo, total: 0 };
      prev.total += Number(item.valor);
      grouped.set(key, prev);
    }

    const entries = Array.from(grouped.values());
    for (const item of entries) {
      await this.prisma.historicoPGC.create({
        data: {
          requestId: `manual-${credorId}`,
          credorId,
          numero_pgc: item.numero_pgc,
          periodo: item.periodo,
          valorTotal: new Prisma.Decimal(item.total),
          evento: 'SYNC_RENDIMENTOS',
          payload: {
            origem: 'rendimentos',
            total: item.total,
          },
        },
      });
    }
  }
}
