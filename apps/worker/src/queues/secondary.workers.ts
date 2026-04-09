import { Worker } from 'bullmq';

export function startEmailDispatchWorker(): Worker {
  return new Worker(
    'email-dispatch',
    async () => {
      return { ok: true };
    },
    {
      connection: {
        host: process.env.REDIS_HOST ?? 'localhost',
        port: Number(process.env.REDIS_PORT ?? 6379),
      },
      concurrency: Number(process.env.EMAIL_WORKER_CONCURRENCY ?? 10),
    },
  );
}

export function startReportGenerationWorker(): Worker {
  return new Worker(
    'report-generation',
    async () => {
      return { ok: true };
    },
    {
      connection: {
        host: process.env.REDIS_HOST ?? 'localhost',
        port: Number(process.env.REDIS_PORT ?? 6379),
      },
      concurrency: Number(process.env.REPORT_WORKER_CONCURRENCY ?? 2),
    },
  );
}
