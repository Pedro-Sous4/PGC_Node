import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../infra/prisma.service';
import { CreateEmpresaPagadoraDto } from '../dto/create-empresa-pagadora.dto';
import { UpdateEmpresaPagadoraDto } from '../dto/update-empresa-pagadora.dto';

@Injectable()
export class EmpresasPagadorasService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.empresaPagadora.findMany({ orderBy: { nome_curto: 'asc' } });
  }

  async create(dto: CreateEmpresaPagadoraDto) {
    const exists = await this.prisma.empresaPagadora.findFirst({
      where: { nome_curto: { equals: dto.nome_curto.trim(), mode: 'insensitive' } },
    });
    if (exists) {
      throw new ConflictException('Empresa pagadora ja existe.');
    }

    return this.prisma.empresaPagadora.create({
      data: {
        nome_curto: dto.nome_curto.trim(),
        nome_completo: dto.nome_completo.trim(),
        nome: dto.nome_completo.trim(),
        cnpj: dto.cnpj?.trim(),
      },
    });
  }

  async update(id: string, dto: UpdateEmpresaPagadoraDto) {
    const found = await this.prisma.empresaPagadora.findUnique({ where: { id } });
    if (!found) {
      throw new NotFoundException('Empresa pagadora nao encontrada.');
    }

    if (dto.nome_curto) {
      const exists = await this.prisma.empresaPagadora.findFirst({
        where: {
          id: { not: id },
          nome_curto: { equals: dto.nome_curto.trim(), mode: 'insensitive' },
        },
      });
      if (exists) {
        throw new ConflictException('Empresa pagadora ja existe.');
      }
    }

    return this.prisma.empresaPagadora.update({
      where: { id },
      data: {
        nome_curto: dto.nome_curto?.trim(),
        nome_completo: dto.nome_completo?.trim(),
        nome: dto.nome_completo?.trim() ?? undefined,
        cnpj: dto.cnpj?.trim(),
      },
    });
  }

  async remove(id: string) {
    const found = await this.prisma.empresaPagadora.findUnique({ where: { id } });
    if (!found) {
      throw new NotFoundException('Empresa pagadora nao encontrada.');
    }

    await this.prisma.empresaPagadora.delete({ where: { id } });
    return { deleted: true };
  }
}
