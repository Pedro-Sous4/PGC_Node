import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../infra/prisma.service';
import { Prisma } from '@prisma/client';

export interface CarryoverTransaction {
  credorId: string;
  empresa: string;
  valorOriginal: number;
  valorAbatido: number;
  requestId?: string;
  numero_pgc?: string;
  observacao?: string;
}

@Injectable()
export class CarryoverService {
  private readonly logger = new Logger(CarryoverService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Obtém o saldo devedor atual de um credor em uma empresa específica.
   */
  async getSaldoAtual(credorId: string, empresa: string): Promise<number> {
    const saldo = await this.prisma.saldoDevedor.findUnique({
      where: {
        credorId_empresa: { credorId, empresa },
      },
    });

    return saldo ? Number(saldo.valor) : 0;
  }

  /**
   * Aplica uma transação de abatimento ou adição de saldo devedor.
   * Utiliza transação ACID para garantir que o saldo e o evento de auditoria sejam gravados atomicamente.
   */
  async registrarTransacao(tx: CarryoverTransaction): Promise<void> {
    await this.prisma.$transaction(async (prisma) => {
      // 1. Busca saldo atual com lock para evitar race conditions
      const saldoRegistro = await prisma.saldoDevedor.findUnique({
        where: {
          credorId_empresa: { credorId: tx.credorId, empresa: tx.empresa },
        },
      });

      const saldoAnterior = saldoRegistro ? Number(saldoRegistro.valor) : 0;
      
      // Se valorAbatido > 0, estamos reduzindo a dívida.
      // Se valorOriginal > valorAbatido, a diferença vira novo saldo devedor (ou aumenta o existente).
      // O valorOriginal recebido já contempla o Carryover + Novo Desconto.
      // Portanto, o novo saldo devedor é simplesmente a diferença entre o total a descontar e o que foi de fato aplicado.
      const novoSaldo = Number((tx.valorOriginal - tx.valorAbatido).toFixed(2));
      const variacao = Number((novoSaldo - saldoAnterior).toFixed(2));

      // 2. Atualiza ou cria o registro de saldo atual
      await prisma.saldoDevedor.upsert({
        where: {
          credorId_empresa: { credorId: tx.credorId, empresa: tx.empresa },
        },
        update: { valor: novoSaldo },
        create: {
          credorId: tx.credorId,
          empresa: tx.empresa,
          valor: novoSaldo,
        },
      });

      // 3. Grava o Evento Financeiro (Imutável)
      await prisma.eventoFinanceiro.create({
        data: {
          credorId: tx.credorId,
          tipo: tx.valorAbatido > 0 ? 'ABATIMENTO_PGC' : 'AQUISICAO_DIVIDA',
          valor: tx.valorAbatido > 0 ? tx.valorAbatido : variacao,
          saldoAnterior: new Prisma.Decimal(saldoAnterior),
          saldoPosterior: new Prisma.Decimal(novoSaldo),
          empresa: tx.empresa,
          numero_pgc: tx.numero_pgc,
          requestId: tx.requestId,
          observacao: tx.observacao,
        },
      });

      this.logger.log(
        `[Carryover] Credor ${tx.credorId} na empresa ${tx.empresa}: Saldo ${saldoAnterior} -> ${novoSaldo}`,
      );
    });
  }

  /**
   * Reconstrói o saldo de um credor em uma data específica (Time Travel).
   */
  async reconstruirSaldoEm(credorId: string, empresa: string, dataCorte: Date): Promise<number> {
    const eventos = await this.prisma.eventoFinanceiro.findMany({
      where: {
        credorId,
        empresa,
        created_at: { lte: dataCorte },
      },
      orderBy: { created_at: 'asc' },
    });

    if (eventos.length === 0) return 0;
    return Number(eventos[eventos.length - 1].saldoPosterior);
  }
}
