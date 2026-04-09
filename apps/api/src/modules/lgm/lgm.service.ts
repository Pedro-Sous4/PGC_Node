import { Injectable, NotFoundException } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import JSZip from 'jszip';
import { PrismaService } from '../../infra/prisma.service';
import { JobsService } from '../jobs/application/jobs.service';
import { ResolveErrorDto } from './dto/resolve-error.dto';

@Injectable()
export class LgmService {
  constructor(
    private readonly jobsService: JobsService,
    private readonly prisma: PrismaService,
  ) {}

  private extractPgcNumber(fileName: string): string | null {
    const match = fileName.match(/pgc\s*[-_ ]?(\d{1,6})/i);
    return match?.[1] ?? null;
  }

  private resolveWorkspaceRoot(): string {
    const cwd = process.cwd();
    const parent = path.dirname(cwd);
    const grandParent = path.dirname(parent);

    if (path.basename(cwd) === 'api' && path.basename(parent) === 'apps') {
      return grandParent;
    }

    return cwd;
  }

  async startUpload(fileName: string, fileBuffer: Buffer, credores: string[]) {
    const started = await this.jobsService.createUploadJob({
      flow: 'lgm',
      credores: credores.length > 0 ? credores : undefined,
    });

    const legacyDir = path.join(process.cwd(), 'artifacts', 'lgm', started.request_id);
    await fs.mkdir(legacyDir, { recursive: true });
    await fs.writeFile(path.join(legacyDir, fileName), fileBuffer);

    const pgcNumber = this.extractPgcNumber(fileName) ?? started.request_id;
    const workspaceRoot = this.resolveWorkspaceRoot();
    const pgcDir = path.join(workspaceRoot, 'PGC', 'LGM', pgcNumber);
    await fs.mkdir(pgcDir, { recursive: true });
    await fs.writeFile(path.join(pgcDir, fileName), fileBuffer);

    return { request_id: started.request_id, flow: 'lgm' };
  }

  async listArquivos(numeroPgc: string, empresa?: string) {
    const pgc = String(numeroPgc ?? '').trim();
    if (!pgc) {
      throw new NotFoundException('Informe o numero_pgc para listar arquivos.');
    }

    const workspaceRoot = this.resolveWorkspaceRoot();
    const roots = [
      path.join(workspaceRoot, 'PGC', 'LGM', pgc),
      // Legacy fallback from previous path convention.
      path.join(workspaceRoot, 'LGM', `LGM${pgc}`),
      // Safety fallback in case files were accidentally generated in Sports.
      path.join(workspaceRoot, 'PGC', 'SPORTS', pgc),
      path.join(process.cwd(), 'artifacts', `pgc-${pgc}`),
      path.join(process.cwd(), 'artifacts', 'lgm'),
    ];

    const companyFilter = String(empresa ?? '').trim().toLowerCase();
    const files: Array<{
      name: string;
      relativePath: string;
      root: string;
      size: number;
      updatedAt: string;
    }> = [];

    async function scan(baseDir: string, currentDir: string, rootLabel: string): Promise<void> {
      const entries = await fs.readdir(currentDir, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          await scan(baseDir, fullPath, rootLabel);
          continue;
        }

        const normalized = entry.name.toLowerCase();
        if (companyFilter && !normalized.includes(companyFilter)) continue;

        const stat = await fs.stat(fullPath).catch(() => null);
        if (!stat?.isFile()) continue;

        files.push({
          name: entry.name,
          relativePath: path.relative(baseDir, fullPath).replace(/\\/g, '/'),
          root: rootLabel,
          size: stat.size,
          updatedAt: stat.mtime.toISOString(),
        });
      }
    }

    for (const root of roots) {
      const stat = await fs.stat(root).catch(() => null);
      if (!stat?.isDirectory()) continue;
      await scan(root, root, path.relative(workspaceRoot, root).replace(/\\/g, '/'));
    }

    return {
      numero_pgc: pgc,
      empresa: empresa ?? '',
      total: files.length,
      files: files.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    };
  }

  private async getJob(requestId: string) {
    const job = await this.prisma.processingJob.findUnique({
      where: { requestId },
      select: { id: true, requestId: true },
    });
    if (!job) {
      throw new NotFoundException('request_id nao encontrado');
    }
    return job;
  }

  async errors(requestId: string) {
    const job = await this.getJob(requestId);
    return this.prisma.processingError.findMany({
      where: {
        processingJobId: job.id,
        code: { not: 'STALE_PROCESSING_RECONCILED' },
      },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        credorSlug: true,
        code: true,
        message: true,
        technicalDetail: true,
        created_at: true,
        resolutionAction: true,
        resolutionNote: true,
        resolvedAt: true,
        ignoredAt: true,
      },
    });
  }

  async credores(requestId: string) {
    const job = await this.getJob(requestId);
    const [statuses, errors] = await this.prisma.$transaction([
      this.prisma.credorProcessingStatus.findMany({
        where: { processingJobId: job.id },
        include: { credor: true },
      }),
      this.prisma.processingError.findMany({
        where: { processingJobId: job.id },
        select: {
          id: true,
          credorSlug: true,
          code: true,
          message: true,
          resolutionAction: true,
          resolvedAt: true,
          ignoredAt: true,
        },
      }),
    ]);

    return statuses.map((status) => {
      const credorErrors = errors.filter((err) => err.credorSlug === status.credor.slug);
      return {
        credorSlug: status.credor.slug,
        nome: status.credor.nomeExibivel,
        stage: status.stage,
        status: status.status,
        message: status.errorMessage ?? status.warning ?? null,
        errors: credorErrors,
      };
    });
  }

  async logs(requestId: string) {
    const job = await this.getJob(requestId);

    const [steps, errors] = await this.prisma.$transaction([
      this.prisma.processingStep.findMany({
        where: { processingJobId: job.id },
        orderBy: { created_at: 'asc' },
      }),
      this.prisma.processingError.findMany({
        where: { processingJobId: job.id },
        orderBy: { created_at: 'asc' },
      }),
    ]);

    return {
      request_id: requestId,
      steps,
      errors,
    };
  }

  async resolveError(requestId: string, errorId: string, dto: ResolveErrorDto) {
    const job = await this.getJob(requestId);

    const found = await this.prisma.processingError.findFirst({
      where: {
        id: errorId,
        processingJobId: job.id,
      },
      select: { id: true },
    });

    if (!found) {
      throw new NotFoundException('Erro nao encontrado para este request_id.');
    }

    return this.prisma.processingError.update({
      where: { id: errorId },
      data: {
        resolutionAction: dto.action,
        resolutionNote: dto.note,
        resolvedAt: dto.action === 'resolve' ? new Date() : null,
        ignoredAt: dto.action === 'ignore' ? new Date() : null,
      },
    });
  }

  async download(requestId: string) {
    const job = await this.getJob(requestId);
    const [errors, credores, logs, status] = await Promise.all([
      this.errors(requestId),
      this.credores(requestId),
      this.logs(requestId),
      this.prisma.processingJob.findUnique({
        where: { id: job.id },
        select: {
          requestId: true,
          status: true,
          stage: true,
          percent: true,
          created_at: true,
          updated_at: true,
        },
      }),
    ]);

    const successCount = credores.filter((item) => item.status === 'SUCCESS').length;
    const errorCount = credores.filter((item) => item.status === 'ERROR').length;
    const statusPayload = status
      ? {
          ...status,
          successCount,
          errorCount,
        }
      : {
          requestId,
          successCount,
          errorCount,
        };

    const zip = new JSZip();
    zip.file('status.json', JSON.stringify(statusPayload, null, 2));
    zip.file('errors.json', JSON.stringify(errors, null, 2));
    zip.file('credores.json', JSON.stringify(credores, null, 2));
    zip.file('logs.json', JSON.stringify(logs, null, 2));

    const zipBuffer = await zip.generateAsync({ type: 'base64', compression: 'DEFLATE' });
    return {
      request_id: requestId,
      file_name: `lgm-${requestId}.zip.base64`,
      content_base64: zipBuffer,
    };
  }
}
