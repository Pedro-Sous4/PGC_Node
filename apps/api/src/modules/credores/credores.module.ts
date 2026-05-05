import { Module } from '@nestjs/common';
import { CredoresController } from './credores.controller';
import { CredoresService } from './application/credores.service';
import { CarryoverService } from './application/carryover.service';
import { PrismaService } from '../../infra/prisma.service';

@Module({
  controllers: [CredoresController],
  providers: [CredoresService, CarryoverService, PrismaService],
  exports: [CredoresService, CarryoverService],
})
export class CredoresModule {}
