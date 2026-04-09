import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../infra/prisma.service';
import { CreateGrupoDto } from '../dto/create-grupo.dto';
import { UpdateGrupoDto } from '../dto/update-grupo.dto';

const ALLOWED_GROUP_NAMES = ['LGM', 'SPORTS'] as const;

@Injectable()
export class GruposService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    // Keep group options constrained to the operational flows.
    for (const nome of ALLOWED_GROUP_NAMES) {
      const exists = await this.prisma.grupo.findFirst({
        where: { nome: { equals: nome, mode: 'insensitive' } },
        select: { id: true },
      });

      if (!exists) {
        await this.prisma.grupo.create({ data: { nome } });
      }
    }

    const grupos = await this.prisma.grupo.findMany({
      where: {
        OR: ALLOWED_GROUP_NAMES.map((nome) => ({ nome: { equals: nome, mode: 'insensitive' } })),
      },
    });

    const orderMap = new Map<string, number>(ALLOWED_GROUP_NAMES.map((nome, idx) => [nome, idx]));
    return grupos.sort((a, b) => {
      const aOrder = orderMap.get(a.nome.toUpperCase()) ?? Number.MAX_SAFE_INTEGER;
      const bOrder = orderMap.get(b.nome.toUpperCase()) ?? Number.MAX_SAFE_INTEGER;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' });
    });
  }

  async create(dto: CreateGrupoDto) {
    const nome = dto.nome.trim();
    const exists = await this.prisma.grupo.findFirst({ where: { nome: { equals: nome, mode: 'insensitive' } } });
    if (exists) {
      throw new ConflictException('Grupo ja existe.');
    }

    return this.prisma.grupo.create({ data: { nome } });
  }

  async update(id: string, dto: UpdateGrupoDto) {
    const found = await this.prisma.grupo.findUnique({ where: { id } });
    if (!found) {
      throw new NotFoundException('Grupo nao encontrado.');
    }

    if (dto.nome) {
      const nome = dto.nome.trim();
      const exists = await this.prisma.grupo.findFirst({
        where: {
          id: { not: id },
          nome: { equals: nome, mode: 'insensitive' },
        },
      });
      if (exists) {
        throw new ConflictException('Grupo ja existe.');
      }
    }

    return this.prisma.grupo.update({
      where: { id },
      data: { nome: dto.nome?.trim() },
    });
  }

  async remove(id: string) {
    const found = await this.prisma.grupo.findUnique({ where: { id } });
    if (!found) {
      throw new NotFoundException('Grupo nao encontrado.');
    }

    await this.prisma.grupo.delete({ where: { id } });
    return { deleted: true };
  }
}
