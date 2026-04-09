import { Module } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma.service';
import { JobsModule } from '../jobs/jobs.module';
import { SportsController } from './sports.controller';
import { SportsService } from './sports.service';

@Module({
  imports: [JobsModule],
  controllers: [SportsController],
  providers: [SportsService, PrismaService],
})
export class SportsModule {}
