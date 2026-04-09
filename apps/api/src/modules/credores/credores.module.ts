import { Module } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma.service';
import { CredoresController } from './credores.controller';
import { CredoresService } from './application/credores.service';

@Module({
  controllers: [CredoresController],
  providers: [CredoresService, PrismaService],
  exports: [CredoresService],
})
export class CredoresModule {}
