import pino from 'pino';
import { startEmailDispatchWorker, startReportGenerationWorker } from './queues/secondary.workers';
import { startProcessingWorker } from './queues/processing.worker';
import { postProgress } from './clients/api.client';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

const processingWorker = startProcessingWorker();
const emailWorker = startEmailDispatchWorker();
const reportWorker = startReportGenerationWorker();

processingWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'pgc-processing completed');
});

processingWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'pgc-processing failed');

  const requestId = String(job?.data?.requestId ?? '');
  const expectedCredores = Array.from(
    new Set(
      ((job?.data?.credores as string[] | undefined) ?? [])
        .map((item) => String(item ?? '').trim())
        .filter(Boolean),
    ),
  );
  if (!requestId) return;

  void postProgress(requestId, {
    stage: 'FINISHED',
    percent: 100,
    status: 'ERROR',
    expectedCredores,
    appendError: {
      code: 'WORKER_UNHANDLED_ERROR',
      message: (err as Error)?.message || 'Falha nao tratada no worker',
    },
  }).catch(() => {
    logger.warn({ requestId }, 'failed to report worker failure progress');
  });
});

logger.info('PGC workers started');

for (const worker of [processingWorker, emailWorker, reportWorker]) {
  worker.on('error', (err) => logger.error({ err }, 'worker error'));
}
