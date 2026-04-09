import { Module } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma.service';
import { HistoricoPgcController } from './historico-pgc.controller';
import { HistoricoPgcService } from './application/historico-pgc.service';

@Module({
  controllers: [HistoricoPgcController],
  providers: [HistoricoPgcService, PrismaService],
})
export class HistoricoPgcModule {}
