import { Module } from '@nestjs/common';
import { JobsController } from './jobs.controller';
import { JobsService } from './application/jobs.service';
import { JobStateStore } from './application/job-state.store';
import { QueueService } from './infra/queue.service';
import { PrismaService } from '../../infra/prisma.service';
import { RedisLockService } from '../../infra/redis-lock.service';

@Module({
  controllers: [JobsController],
  providers: [JobsService, JobStateStore, QueueService, PrismaService, RedisLockService],
  exports: [JobStateStore, JobsService],
})
export class JobsModule {}
