import { Module } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma.service';
import { RendimentosController } from './rendimentos.controller';
import { RendimentosService } from './application/rendimentos.service';

@Module({
  controllers: [RendimentosController],
  providers: [RendimentosService, PrismaService],
})
export class RendimentosModule {}
