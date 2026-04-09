import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../infra/prisma.service';
import { UpdateHistoricoPgcDto } from '../dto/update-historico-pgc.dto';

@Injectable()
export class HistoricoPgcService {
  constructor(private readonly prisma: PrismaService) {}

  list(credorId: string) {
    return this.prisma.historicoPGC.findMany({
      where: { credorId },
      orderBy: [{ periodo: 'desc' }, { created_at: 'desc' }],
    });
  }

  async getById(id: string) {
    const found = await this.prisma.historicoPGC.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('Historico nao encontrado.');
    return found;
  }

  async update(id: string, dto: UpdateHistoricoPgcDto) {
    const found = await this.prisma.historicoPGC.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('Historico nao encontrado.');

    return this.prisma.historicoPGC.update({
      where: { id },
      data: {
        numero_pgc: dto.numero_pgc,
        periodo: dto.periodo,
        evento: dto.evento,
      },
    });
  }

  async remove(id: string) {
    const found = await this.prisma.historicoPGC.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('Historico nao encontrado.');

    await this.prisma.historicoPGC.delete({ where: { id } });
    return { deleted: true };
  }
}
