import { Injectable, NotFoundException } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import JSZip from 'jszip';
import { PrismaService } from '../../infra/prisma.service';
import { JobsService } from '../jobs/application/jobs.service';

@Injectable()
export class SportsService {
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
      flow: 'laghetto-sports',
      credores: credores.length > 0 ? credores : undefined,
    });

    // Keep legacy path for backward compatibility with existing local checks.
    const legacyDir = path.join(process.cwd(), 'artifacts', 'sports', started.request_id);
    await fs.mkdir(legacyDir, { recursive: true });
    await fs.writeFile(path.join(legacyDir, fileName), fileBuffer);

    // Preferred structure requested by business flow: ./PGC/SPORTS/[NUMERO_PGC]
    const pgcNumber = this.extractPgcNumber(fileName) ?? started.request_id;
    const workspaceRoot = this.resolveWorkspaceRoot();
    const pgcDir = path.join(workspaceRoot, 'PGC', 'SPORTS', pgcNumber);
    await fs.mkdir(pgcDir, { recursive: true });
    await fs.writeFile(path.join(pgcDir, fileName), fileBuffer);

    return { request_id: started.request_id, flow: 'laghetto-sports' };
  }

  status(requestId: string) {
    return this.jobsService.getStatus(requestId);
  }

  async logs(requestId: string) {
    const processingJob = await this.prisma.processingJob.findUnique({
      where: { requestId },
      select: { id: true },
    });
    if (!processingJob) {
      throw new NotFoundException('request_id nao encontrado');
    }

    const [steps, errors] = await this.prisma.$transaction([
      this.prisma.processingStep.findMany({
        where: { processingJobId: processingJob.id },
        orderBy: { created_at: 'asc' },
      }),
      this.prisma.processingError.findMany({
        where: { processingJobId: processingJob.id },
        orderBy: { created_at: 'asc' },
      }),
    ]);

    return {
      request_id: requestId,
      logs: [
        ...steps.map((step) => ({
          ts: step.created_at.toISOString(),
          level: step.status === 'ERROR' ? 'error' : 'info',
          message: `stage=${step.name} status=${step.status}`,
        })),
        ...errors.map((err) => ({
          ts: err.created_at.toISOString(),
          level: 'error',
          message: `${err.credorSlug ?? 'global'} ${err.code}: ${err.message}`,
        })),
      ],
    };
  }

  async download(requestId: string) {
    const state = await this.jobsService.getStatus(requestId);
    const zip = new JSZip();
    zip.file('status.json', JSON.stringify(state, null, 2));
    zip.file('errors.json', JSON.stringify(state.errors ?? [], null, 2));
    zip.file('credores.json', JSON.stringify(state.credores ?? [], null, 2));

    const zipBuffer = await zip.generateAsync({ type: 'base64', compression: 'DEFLATE' });
    return {
      request_id: requestId,
      file_name: `laghetto-sports-${requestId}.zip.base64`,
      content_base64: zipBuffer,
    };
  }
}
