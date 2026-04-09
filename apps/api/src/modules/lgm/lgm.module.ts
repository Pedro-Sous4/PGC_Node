import { Module } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma.service';
import { JobsModule } from '../jobs/jobs.module';
import { LgmController } from './lgm.controller';
import { LgmService } from './lgm.service';

@Module({
  imports: [JobsModule],
  controllers: [LgmController],
  providers: [LgmService, PrismaService],
})
export class LgmModule {}
