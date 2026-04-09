import { Injectable, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, ProcessingStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { InternalProgressDto } from '../dto/internal-progress.dto';
import { ReprocessJobDto } from '../dto/reprocess-job.dto';
import { UploadJobDto } from '../dto/upload-job.dto';
import { JobState } from '../domain/job.types';
import { QueueService } from '../infra/queue.service';
import { JobStateStore } from './job-state.store';
import { PrismaService } from '../../../infra/prisma.service';
import { RedisLockService } from '../../../infra/redis-lock.service';

@Injectable()
export class JobsService implements OnModuleInit, OnModuleDestroy {
  private staleReconcileTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly store: JobStateStore,
    private readonly queueService: QueueService,
    private readonly prisma: PrismaService,
    private readonly lockService: RedisLockService,
  ) {}

  onModuleInit(): void {
    const enabled = String(process.env.STALE_RECONCILE_ENABLED ?? 'true').toLowerCase() !== 'false';
    if (!enabled) return;

    const intervalMs = Math.max(15_000, Number(process.env.STALE_RECONCILE_INTERVAL_MS ?? 60_000));
    this.staleReconcileTimer = setInterval(() => {
      void this.reconcileStaleProcessingJobs({ source: 'scheduler' });
    }, intervalMs);
  }

  onModuleDestroy(): void {
    if (!this.staleReconcileTimer) return;
    clearInterval(this.staleReconcileTimer);
    this.staleReconcileTimer = null;
  }

  async reconcileStaleProcessingJobs(options?: {
    staleMs?: number;
    source?: 'manual' | 'scheduler';
  }): Promise<{ scanned: number; reconciled: number; skippedActive: number; staleMs: number }> {
    const staleMs = Math.max(30_000, Number(options?.staleMs ?? process.env.STALE_PROCESSING_MS ?? 120_000));
    const cutoff = new Date(Date.now() - staleMs);

    const [candidates, inFlight] = await Promise.all([
      this.prisma.processingJob.findMany({
        where: {
          status: ProcessingStatus.PROCESSING,
          updated_at: { lt: cutoff },
        },
        select: {
          id: true,
          requestId: true,
          stage: true,
          percent: true,
        },
      }),
      this.queueService.getInFlightRequestIds(),
    ]);

    let reconciled = 0;
    let skippedActive = 0;

    for (const candidate of candidates) {
      if (inFlight.has(candidate.requestId)) {
        skippedActive += 1;
        continue;
      }

      await this.lockService.withRequestLock(candidate.requestId, async () => {
        const current = await this.prisma.processingJob.findUnique({
          where: { requestId: candidate.requestId },
          select: { status: true, updated_at: true },
        });

        if (!current || current.status !== ProcessingStatus.PROCESSING || current.updated_at >= cutoff) {
          return;
        }

        const summary = await this.prisma.credorProcessingStatus.groupBy({
          by: ['status'],
          where: { processingJobId: candidate.id },
          _count: { _all: true },
        });

        const hasCredorError = summary.some((item) => item.status === ProcessingStatus.ERROR && item._count._all > 0);
        const hasCredorSuccess = summary.some((item) => item.status === ProcessingStatus.SUCCESS && item._count._all > 0);
        const reconciledStatus = !hasCredorError && hasCredorSuccess ? ProcessingStatus.SUCCESS : ProcessingStatus.ERROR;

        await this.prisma.credorProcessingStatus.updateMany({
          where: {
            processingJobId: candidate.id,
            status: {
              in: [ProcessingStatus.PENDING, ProcessingStatus.PROCESSING],
            },
          },
          data: {
            status: reconciledStatus,
            warning:
              reconciledStatus === ProcessingStatus.SUCCESS
                ? 'Status conciliado por stale no fechamento do job.'
                : null,
            errorMessage:
              reconciledStatus === ProcessingStatus.ERROR
                ? 'Credor finalizado sem retorno individual antes da conciliacao por stale.'
                : null,
          },
        });

        await this.prisma.$transaction([
          this.prisma.processingJob.update({
            where: { requestId: candidate.requestId },
            data: {
              status: reconciledStatus,
              stage: 'FINISHED',
              percent: 100,
            },
          }),
          this.prisma.processingStep.create({
            data: {
              processingJobId: candidate.id,
              name: 'FINISHED',
              status: reconciledStatus,
              startedAt: new Date(),
              finishedAt: new Date(),
            },
          }),
          this.prisma.processingError.create({
            data: {
              processingJobId: candidate.id,
              code: 'STALE_PROCESSING_RECONCILED',
              message:
                options?.source === 'scheduler'
                  ? 'Job reconciliado automaticamente por stale em PROCESSING sem execucao ativa.'
                  : 'Job reconciliado manualmente por stale em PROCESSING sem execucao ativa.',
            },
          }),
        ]);

        reconciled += 1;
      });

      const state = await this.hydrateState(candidate.requestId);
      this.store.update(candidate.requestId, state);
    }

    return {
      scanned: candidates.length,
      reconciled,
      skippedActive,
      staleMs,
    };
  }

  async createUploadJob(dto: UploadJobDto): Promise<{ request_id: string }> {
    const requestId = randomUUID();

    await this.prisma.processingJob.create({
      data: {
        requestId,
        status: ProcessingStatus.PENDING,
        stage: 'UPLOAD_RECEIVED',
        percent: 1,
        source: dto.flow,
      },
    });

    const processingJob = await this.getProcessingJobEntity(requestId);
    for (const credorSlug of dto.credores ?? []) {
      const credor = await this.ensureCredor(credorSlug, dto.flow);
      await this.prisma.credorProcessingStatus.upsert({
        where: {
          processingJobId_credorId_stage: {
            processingJobId: processingJob.id,
            credorId: credor.id,
            stage: 'CREDOR_LOOP',
          },
        },
        create: {
          processingJobId: processingJob.id,
          credorId: credor.id,
          stage: 'CREDOR_LOOP',
          status: ProcessingStatus.PENDING,
        },
        update: {},
      });
    }

    await this.queueService.enqueueProcessing({
      requestId,
      flow: dto.flow,
      credores: dto.credores ?? [],
    });

    const state = await this.hydrateState(requestId);
    this.store.create(state);

    return { request_id: requestId };
  }

  async getStatus(requestId: string): Promise<JobState> {
    const state = await this.hydrateState(requestId);

    if (!this.store.get(requestId)) {
      this.store.create(state);
    } else {
      this.store.update(requestId, state);
    }

    return state;
  }

  async getErrors(requestId: string): Promise<JobState['errors']> {
    const processingJob = await this.getProcessingJobEntity(requestId);
    const errors = await this.prisma.processingError.findMany({
      where: {
        processingJobId: processingJob.id,
        // This marker is informational (auto-reconcile), not an actionable business error.
        code: { not: 'STALE_PROCESSING_RECONCILED' },
      },
      orderBy: { created_at: 'desc' },
      select: {
        credorSlug: true,
        code: true,
        message: true,
      },
    });

    return errors.map((item) => ({
      credorSlug: item.credorSlug ?? undefined,
      code: item.code,
      message: item.message,
    }));
  }

  async getCredores(requestId: string): Promise<JobState['credores']> {
    const processingJob = await this.getProcessingJobEntity(requestId);
    const statuses = await this.prisma.credorProcessingStatus.findMany({
      where: { processingJobId: processingJob.id },
      include: { credor: true },
      orderBy: { updated_at: 'desc' },
    });

    return sortCredoresByDisplayName(statuses.map((item) => ({
      credorSlug: item.credor.slug,
      credorName: sanitizeCredorDisplayName(item.credor.nomeExibivel),
      state: this.mapCredorState(item.status),
      message: item.errorMessage ?? item.warning ?? undefined,
    })));
  }

  async reprocess(requestId: string, dto: ReprocessJobDto): Promise<{ accepted: true }> {
    await this.lockService.withRequestLock(requestId, async () => {
      const processingJob = await this.getProcessingJobEntity(requestId);
      const reprocessJob = await this.prisma.reprocessJob.create({
        data: {
          requestId,
          status: ProcessingStatus.PROCESSING,
        },
      });

      for (const credorSlug of dto.credores) {
        const credor = await this.ensureCredor(credorSlug);

        await this.prisma.reprocessItem.upsert({
          where: {
            reprocessJobId_credorSlug: {
              reprocessJobId: reprocessJob.id,
              credorSlug,
            },
          },
          create: {
            reprocessJobId: reprocessJob.id,
            credorSlug,
            status: ProcessingStatus.PENDING,
          },
          update: {
            status: ProcessingStatus.PENDING,
          },
        });

        await this.prisma.credorProcessingStatus.upsert({
          where: {
            processingJobId_credorId_stage: {
              processingJobId: processingJob.id,
              credorId: credor.id,
              stage: 'CREDOR_LOOP',
            },
          },
          create: {
            processingJobId: processingJob.id,
            credorId: credor.id,
            stage: 'CREDOR_LOOP',
            status: ProcessingStatus.PENDING,
          },
          update: {
            status: ProcessingStatus.PENDING,
            warning: null,
            errorMessage: null,
          },
        });
      }

      await this.prisma.processingJob.update({
        where: { requestId },
        data: {
          status: ProcessingStatus.PROCESSING,
          stage: 'CREDOR_LOOP',
        },
      });

      await this.queueService.enqueueProcessing({
        requestId,
        flow: 'reprocess',
        credores: dto.credores,
      });
    });

    const state = await this.hydrateState(requestId);
    this.store.update(requestId, state);

    return { accepted: true };
  }

  async cancel(requestId: string): Promise<{ canceled: true }> {
    await this.lockService.withRequestLock(requestId, async () => {
      await this.getProcessingJobEntity(requestId);
      await this.prisma.processingJob.update({
        where: { requestId },
        data: { status: ProcessingStatus.CANCELED },
      });
    });

    const state = await this.hydrateState(requestId);
    this.store.update(requestId, state);

    return { canceled: true };
  }

  async getArtifacts(requestId: string): Promise<JobState['artifacts']> {
    return (await this.hydrateState(requestId)).artifacts;
  }

  async pushInternalProgress(requestId: string, dto: InternalProgressDto): Promise<{ accepted: true }> {
    await this.lockService.withRequestLock(requestId, async () => {
      const processingJob = await this.getProcessingJobEntity(requestId);

      const current = await this.prisma.processingJob.findUnique({
        where: { requestId },
        select: { status: true, source: true },
      });

      if (current?.status === ProcessingStatus.CANCELED) {
        return;
      }

      await this.prisma.processingJob.update({
        where: { requestId },
        data: {
          status: dto.status ?? undefined,
          stage: dto.stage,
          percent: Math.round(dto.percent),
        },
      });

      await this.prisma.processingStep.create({
        data: {
          processingJobId: processingJob.id,
          name: dto.stage,
          status: dto.status ?? ProcessingStatus.PROCESSING,
          startedAt: new Date(),
          finishedAt:
            dto.status === ProcessingStatus.SUCCESS || dto.status === ProcessingStatus.ERROR
              ? new Date()
              : null,
        },
      });

      if (dto.credorUpdate) {
        const flowForGrouping = dto.credorUpdate.flow ?? current?.source ?? undefined;
        const credor = await this.ensureCredor(dto.credorUpdate.credorSlug, flowForGrouping);
        const grupoId = await this.resolveGroupIdForFlow(flowForGrouping);
        const credorWarning = dto.credorUpdate.warning?.trim() || null;

        if (dto.credorUpdate.state === ProcessingStatus.SUCCESS) {
          const credorName = dto.credorUpdate.credorName?.trim();
          const periodo = dto.credorUpdate.periodo?.trim();
          const numeroPgc = dto.credorUpdate.numeroPgc?.trim();
          const valorTotal = dto.credorUpdate.valorTotal;

          if (credorName || periodo || grupoId) {
            const nomeCanonico = credorName
              ? credorName
                  .normalize('NFD')
                  .replace(/[\u0300-\u036f]/g, '')
                  .toLowerCase()
                  .trim()
              : undefined;

            await this.prisma.credor.update({
              where: { id: credor.id },
              data: {
                nomeExibivel: credorName || undefined,
                nomeCanonico: nomeCanonico || undefined,
                periodo: periodo || undefined,
                grupoId: grupoId ?? undefined,
              },
            });
          }

          if (numeroPgc && periodo && typeof valorTotal === 'number' && Number.isFinite(valorTotal) && valorTotal > 0) {
            const existing = await this.prisma.rendimento.findFirst({
              where: {
                credorId: credor.id,
                numero_pgc: numeroPgc,
                referencia: periodo,
              },
              select: { id: true },
              orderBy: { created_at: 'desc' },
            });

            if (existing) {
              await this.prisma.rendimento.update({
                where: { id: existing.id },
                data: { valor: new Prisma.Decimal(valorTotal) },
              });
            } else {
              await this.prisma.rendimento.create({
                data: {
                  credorId: credor.id,
                  numero_pgc: numeroPgc,
                  referencia: periodo,
                  valor: new Prisma.Decimal(valorTotal),
                },
              });
            }

            await this.prisma.historicoPGC.create({
              data: {
                requestId,
                credorId: credor.id,
                numero_pgc: numeroPgc,
                periodo,
                valorTotal: new Prisma.Decimal(valorTotal),
                evento: 'PROCESSAMENTO_JOB',
                payload: {
                  origem: 'jobs.internal-progress',
                },
              },
            });
          }
        }

        await this.prisma.credorProcessingStatus.upsert({
          where: {
            processingJobId_credorId_stage: {
              processingJobId: processingJob.id,
              credorId: credor.id,
              stage: dto.stage,
            },
          },
          create: {
            processingJobId: processingJob.id,
            credorId: credor.id,
            stage: dto.stage,
            status: dto.credorUpdate.state,
            warning:
              dto.credorUpdate.state === ProcessingStatus.ERROR
                ? null
                : credorWarning,
            errorMessage:
              dto.credorUpdate.state === ProcessingStatus.ERROR
                ? 'Erro de processamento do credor'
                : null,
          },
          update: {
            status: dto.credorUpdate.state,
            warning:
              dto.credorUpdate.state === ProcessingStatus.ERROR
                ? null
                : credorWarning,
            errorMessage:
              dto.credorUpdate.state === ProcessingStatus.ERROR
                ? 'Erro de processamento do credor'
                : null,
          },
        });
      }

      if (dto.appendError) {
        await this.prisma.processingError.create({
          data: {
            processingJobId: processingJob.id,
            credorSlug: dto.appendError.credorSlug,
            code: dto.appendError.code,
            message: dto.appendError.message,
          },
        });
      }

      if (dto.appendArtifact) {
        const lastArtifact = await this.prisma.processingArtifact.findFirst({
          where: { requestId, type: dto.appendArtifact.type },
          orderBy: { version: 'desc' },
          select: { version: true },
        });

        await this.prisma.processingArtifact.create({
          data: {
            requestId,
            type: dto.appendArtifact.type,
            path: dto.appendArtifact.path,
            version: (lastArtifact?.version ?? 0) + 1,
          },
        });
      }

      // Final reconciliation: avoid leaving credores stuck in PROCESSING/PENDING
      // when the job has already moved to FINISHED.
      if (
        dto.stage === 'FINISHED' &&
        (dto.status === ProcessingStatus.SUCCESS || dto.status === ProcessingStatus.ERROR)
      ) {
        const targetStatus =
          dto.status === ProcessingStatus.SUCCESS ? ProcessingStatus.SUCCESS : ProcessingStatus.ERROR;

        const expectedCredores = Array.from(
          new Set(
            (dto.expectedCredores ?? [])
              .map((item) => item.trim())
              .filter(Boolean),
          ),
        );

        if (expectedCredores.length > 0) {
          const existingCredorStatuses = await this.prisma.credorProcessingStatus.findMany({
            where: {
              processingJobId: processingJob.id,
              stage: 'CREDOR_LOOP',
            },
            select: {
              credor: {
                select: {
                  slug: true,
                },
              },
            },
          });

          const existingSlugs = new Set(
            existingCredorStatuses
              .map((item) => item.credor.slug)
              .filter(Boolean),
          );
          const flowForGrouping = current?.source ?? undefined;

          for (const credorSlug of expectedCredores) {
            if (existingSlugs.has(credorSlug)) continue;

            const credor = await this.ensureCredor(credorSlug, flowForGrouping);
            await this.prisma.credorProcessingStatus.upsert({
              where: {
                processingJobId_credorId_stage: {
                  processingJobId: processingJob.id,
                  credorId: credor.id,
                  stage: 'CREDOR_LOOP',
                },
              },
              create: {
                processingJobId: processingJob.id,
                credorId: credor.id,
                stage: 'CREDOR_LOOP',
                status: targetStatus,
                warning:
                  targetStatus === ProcessingStatus.SUCCESS
                    ? 'Credor conciliado no fechamento do job sem eventos individuais completos.'
                    : null,
                errorMessage:
                  targetStatus === ProcessingStatus.ERROR
                    ? 'Credor finalizado sem retorno individual antes do encerramento global.'
                    : null,
              },
              update: {
                status: targetStatus,
                warning:
                  targetStatus === ProcessingStatus.SUCCESS
                    ? 'Credor conciliado no fechamento do job sem eventos individuais completos.'
                    : null,
                errorMessage:
                  targetStatus === ProcessingStatus.ERROR
                    ? 'Credor finalizado sem retorno individual antes do encerramento global.'
                    : null,
              },
            });
          }
        }

        await this.prisma.credorProcessingStatus.updateMany({
          where: {
            processingJobId: processingJob.id,
            status: {
              in: [ProcessingStatus.PENDING, ProcessingStatus.PROCESSING],
            },
          },
          data: {
            status: targetStatus,
            warning:
              targetStatus === ProcessingStatus.SUCCESS
                ? 'Status conciliado no fechamento do job.'
                : null,
            errorMessage:
              targetStatus === ProcessingStatus.ERROR
                ? 'Credor finalizado sem retorno individual antes do encerramento global.'
                : null,
          },
        });

        if (targetStatus === ProcessingStatus.SUCCESS) {
          const totalCredoresLoop = await this.prisma.credorProcessingStatus.count({
            where: {
              processingJobId: processingJob.id,
              stage: 'CREDOR_LOOP',
            },
          });

          if (totalCredoresLoop === 0) {
            await this.prisma.processingJob.update({
              where: { requestId },
              data: {
                status: ProcessingStatus.ERROR,
                stage: 'FINISHED',
                percent: 100,
              },
            });

            await this.prisma.processingError.create({
              data: {
                processingJobId: processingJob.id,
                code: 'FINISHED_WITHOUT_CREDORES',
                message:
                  'Job marcou SUCCESS sem nenhum credor persistido; status ajustado para ERROR para evitar inconsistencia.',
              },
            });
          }
        }
      }
    });

    const state = await this.hydrateState(requestId);
    this.store.update(requestId, state);

    return { accepted: true };
  }

  private async hydrateState(requestId: string): Promise<JobState> {
    const processingJob = await this.prisma.processingJob.findUnique({
      where: { requestId },
      include: {
        errors: {
          orderBy: { created_at: 'desc' },
          select: {
            credorSlug: true,
            code: true,
            message: true,
          },
        },
        credores: {
          include: { credor: true },
          orderBy: { updated_at: 'desc' },
        },
      },
    });

    if (!processingJob) {
      throw new NotFoundException('request_id nao encontrado');
    }

    const artifacts = await this.prisma.processingArtifact.findMany({
      where: { requestId },
      orderBy: [{ type: 'asc' }, { version: 'desc' }],
      distinct: ['type'],
      select: {
        type: true,
        path: true,
      },
    });

    const successCount = processingJob.credores.filter(
      (item) => item.status === ProcessingStatus.SUCCESS,
    ).length;
    const errorCount = processingJob.credores.filter(
      (item) => item.status === ProcessingStatus.ERROR,
    ).length;

    return {
      requestId,
      status: processingJob.status,
      stage: processingJob.stage as JobState['stage'],
      percent: processingJob.percent,
      currentCredor: undefined,
      successCount,
      errorCount,
      createdAt: processingJob.created_at.toISOString(),
      updatedAt: processingJob.updated_at.toISOString(),
      errors: processingJob.errors.map((item) => ({
        credorSlug: item.credorSlug ?? undefined,
        code: item.code,
        message: item.message,
      })),
      credores: sortCredoresByDisplayName(processingJob.credores.map((item) => ({
        credorSlug: item.credor.slug,
        credorName: sanitizeCredorDisplayName(item.credor.nomeExibivel),
        state: this.mapCredorState(item.status),
        message: item.errorMessage ?? item.warning ?? undefined,
      }))),
      artifacts: artifacts.map((item) => ({
        type: item.type as 'CSV' | 'XLSX' | 'ZIP' | 'PDF',
        path: item.path,
      })),
    };
  }

  private async getProcessingJobEntity(
    requestId: string,
  ): Promise<{ id: string; requestId: string }> {
    const processingJob = await this.prisma.processingJob.findUnique({
      where: { requestId },
      select: { id: true, requestId: true },
    });

    if (!processingJob) {
      throw new NotFoundException('request_id nao encontrado');
    }

    return processingJob;
  }

  private async ensureCredor(credorSlug: string, flow?: string): Promise<{ id: string; slug: string }> {
    const grupoId = await this.resolveGroupIdForFlow(flow);

    const found = await this.prisma.credor.findUnique({
      where: { slug: credorSlug },
      select: { id: true, slug: true, grupoId: true },
    });

    if (found) {
      if (grupoId && found.grupoId !== grupoId) {
        await this.prisma.credor.update({
          where: { id: found.id },
          data: { grupoId },
        });
      }
      return { id: found.id, slug: found.slug };
    }

    const nomeBase = sanitizeCredorDisplayName(credorSlug.replace(/-/g, ' ').replace(/\s+/g, ' ').trim());
    const nomeCanonico = (nomeBase || credorSlug)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

    const foundByCanonical = await this.prisma.credor.findFirst({
      where: { nomeCanonico },
      select: { id: true, slug: true, grupoId: true },
    });

    if (foundByCanonical) {
      if (grupoId && foundByCanonical.grupoId !== grupoId) {
        await this.prisma.credor.update({
          where: { id: foundByCanonical.id },
          data: { grupoId },
        });
      }
      return { id: foundByCanonical.id, slug: foundByCanonical.slug };
    }

    return this.prisma.credor.create({
      data: {
        slug: credorSlug,
        nomeExibivel: nomeBase || credorSlug,
        nomeCanonico,
        grupoId,
      },
      select: { id: true, slug: true },
    });
  }

  private flowToGroupName(flow?: string): 'SPORTS' | 'LGM' | null {
    if (flow === 'laghetto-sports') return 'SPORTS';
    if (flow === 'lgm') return 'LGM';
    return null;
  }

  private async resolveGroupIdForFlow(flow?: string): Promise<string | undefined> {
    const groupName = this.flowToGroupName(flow);
    if (!groupName) return undefined;

    const existing = await this.prisma.grupo.findFirst({
      where: { nome: { equals: groupName, mode: 'insensitive' } },
      select: { id: true },
    });
    if (existing) return existing.id;

    try {
      const created = await this.prisma.grupo.create({
        data: { nome: groupName },
        select: { id: true },
      });
      return created.id;
    } catch {
      const foundAfterConflict = await this.prisma.grupo.findFirst({
        where: { nome: { equals: groupName, mode: 'insensitive' } },
        select: { id: true },
      });
      return foundAfterConflict?.id;
    }
  }

  private mapCredorState(status: ProcessingStatus): 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'ERROR' {
    if (status === ProcessingStatus.CANCELED) {
      return 'ERROR';
    }

    return status;
  }
}

function sanitizeCredorDisplayName(value: string): string {
  const raw = String(value ?? '').replace(/\s+/g, ' ').trim();
  const withoutCode = raw
    .replace(/^\d+\s*[-–—.:)_]*\s*/u, '')
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const base = withoutCode || raw;
  if (!base) return '';

  return base
    .toLowerCase()
    .split(' ')
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(' ')
    .trim();
}

function sortCredoresByDisplayName<T extends { credorSlug: string; credorName?: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const nameA = (a.credorName ?? a.credorSlug ?? '').trim();
    const nameB = (b.credorName ?? b.credorSlug ?? '').trim();

    const byName = nameA.localeCompare(nameB, 'pt-BR', { sensitivity: 'base' });
    if (byName !== 0) return byName;

    return (a.credorSlug ?? '').localeCompare(b.credorSlug ?? '', 'pt-BR', {
      sensitivity: 'base',
    });
  });
}
