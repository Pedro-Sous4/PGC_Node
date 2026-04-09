import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';

@Injectable()
export class QueueService {
  private readonly processingQueue: Queue;

  constructor() {
    this.processingQueue = new Queue('pgc-processing', {
      connection: {
        host: process.env.REDIS_HOST ?? 'localhost',
        port: Number(process.env.REDIS_PORT ?? 6379),
      },
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2_000 },
        removeOnComplete: 1000,
        removeOnFail: 1000,
      },
    });
  }

  async enqueueProcessing(payload: Record<string, unknown>): Promise<void> {
    const requestId = String(payload.requestId);
    const flow = String(payload.flow ?? 'default');
    await this.processingQueue.add('process-pgc', payload, {
      jobId: `${requestId}:${flow}:${Date.now()}`,
    });
  }

  async getInFlightRequestIds(): Promise<Set<string>> {
    const jobs = await this.processingQueue.getJobs(['active', 'waiting', 'delayed']);
    const ids = new Set<string>();

    for (const job of jobs) {
      const fromData = String((job.data as { requestId?: string } | undefined)?.requestId ?? '').trim();
      if (fromData) {
        ids.add(fromData);
        continue;
      }

      const fromJobId = String(job.id ?? '').split(':')[0]?.trim();
      if (fromJobId) {
        ids.add(fromJobId);
      }
    }

    return ids;
  }
}
