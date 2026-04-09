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

    const byPgc = new Map<string, number>();
    const enviadosList: Array<{ id: string; nome: string; grupo?: string; numero_pgc?: string | null }> = [];
    const naoEnviadosList: Array<{ id: string; nome: string; grupo?: string; numero_pgc?: string | null }> = [];

    for (const credor of credores) {
      const numeroPgc = credor.historicos[0]?.numero_pgc ?? null;
      if (numeroPgc) {
        byPgc.set(numeroPgc, (byPgc.get(numeroPgc) ?? 0) + 1);
      }

      const item = {
        id: credor.id,
        nome: credor.nomeExibivel,
        grupo: credor.grupo?.nome,
        numero_pgc: numeroPgc,
      };

      if (credor.enviado) {
        enviadosList.push(item);
      } else {
        naoEnviadosList.push(item);
      }
    }

    return {
      totais: {
        enviados,
        nao_enviados: naoEnviados,
      },
      por_pgc: Array.from(byPgc.entries())
        .map(([numero_pgc, total]) => ({ numero_pgc, total }))
        .sort((a, b) => a.numero_pgc.localeCompare(b.numero_pgc)),
      enviados: enviadosList,
      nao_enviados: naoEnviadosList,
    };
  }
}
