import { Module } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma.service';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './application/dashboard.service';

@Module({
  controllers: [DashboardController],
  providers: [DashboardService, PrismaService],
})
export class DashboardModule {}
