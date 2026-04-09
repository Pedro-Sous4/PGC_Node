import { Module } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma.service';
import { GruposService } from './application/grupos.service';
import { GruposController } from './grupos.controller';

@Module({
  controllers: [GruposController],
  providers: [GruposService, PrismaService],
  exports: [GruposService],
})
export class GruposModule {}
