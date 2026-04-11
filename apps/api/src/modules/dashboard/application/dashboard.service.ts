import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infra/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async envio(grupoId?: string) {
    const where = { grupoId: grupoId ?? undefined };

    const [enviados, naoEnviados, credores] = await this.prisma.$transaction([
      this.prisma.credor.count({ where: { ...where, enviado: true } }),
      this.prisma.credor.count({ where: { ...where, enviado: false } }),
      this.prisma.credor.findMany({
        where,
        select: {
          id: true,
          nomeExibivel: true,
          enviado: true,
          grupo: { select: { nome: true } },
          historicos: {
            where: { numero_pgc: { not: null } },
            orderBy: { created_at: 'desc' },
            take: 1,
            select: { numero_pgc: true },
          },
        },
      }),
    ]);

    const uniqueRendimentos = await this.prisma.rendimento.findMany({
      where: {
        credor: { grupoId: grupoId ?? undefined },
        numero_pgc: { not: null },
      },
      select: {
        numero_pgc: true,
        credorId: true,
      },
      distinct: ['numero_pgc', 'credorId'],
    });

    const byPgcMap = new Map<string, number>();
    for (const r of uniqueRendimentos) {
      if (r.numero_pgc) {
        byPgcMap.set(r.numero_pgc, (byPgcMap.get(r.numero_pgc) ?? 0) + 1);
      }
    }

    const por_pgc = Array.from(byPgcMap.entries())
      .map(([numero_pgc, total]) => ({ numero_pgc, total }))
      .sort((a, b) => {
        const pa = Number.parseInt(a.numero_pgc.replace(/\D/g, ''), 10);
        const pb = Number.parseInt(b.numero_pgc.replace(/\D/g, ''), 10);
        return pb - pa;
      });

    return {
      totais: {
        enviados,
        nao_enviados: naoEnviados,
      },
      por_pgc,
      enviados: [], // Antigos campos mantidos vazios para compatibilidade se nao usados
      nao_enviados: [],
    };
  }
}
