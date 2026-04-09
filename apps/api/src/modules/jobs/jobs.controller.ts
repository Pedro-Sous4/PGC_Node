import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Sse,
  MessageEvent,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Observable, map } from 'rxjs';
import { ReprocessJobDto } from './dto/reprocess-job.dto';
import { UploadJobDto } from './dto/upload-job.dto';
import { InternalProgressDto } from './dto/internal-progress.dto';
import { JobsService } from './application/jobs.service';
import { JobStateStore } from './application/job-state.store';

@ApiTags('jobs')
@Controller('jobs')
export class JobsController {
  constructor(
    private readonly jobsService: JobsService,
    private readonly store: JobStateStore,
  ) {}

  @Post('pgc/upload')
  upload(@Body() dto: UploadJobDto): Promise<{ request_id: string }> {
    return this.jobsService.createUploadJob(dto);
  }

  @Get(':requestId/status')
  status(@Param('requestId') requestId: string) {
    return this.jobsService.getStatus(requestId);
  }

  @Get(':requestId/errors')
  errors(@Param('requestId') requestId: string) {
    return this.jobsService.getErrors(requestId);
  }

  @Get(':requestId/credores')
  credores(@Param('requestId') requestId: string) {
    return this.jobsService.getCredores(requestId);
  }

  @Post(':requestId/reprocess')
  reprocess(@Param('requestId') requestId: string, @Body() dto: ReprocessJobDto) {
    return this.jobsService.reprocess(requestId, dto);
  }

  @Post(':requestId/cancel')
  cancel(@Param('requestId') requestId: string) {
    return this.jobsService.cancel(requestId);
  }

  @Post('reconcile-stale')
  reconcileStale() {
    return this.jobsService.reconcileStaleProcessingJobs({ source: 'manual' });
  }

  @Get(':requestId/artifacts')
  artifacts(@Param('requestId') requestId: string) {
    return this.jobsService.getArtifacts(requestId);
  }

  @Post(':requestId/internal-progress')
  internalProgress(
    @Param('requestId') requestId: string,
    @Body() dto: InternalProgressDto,
  ) {
    return this.jobsService.pushInternalProgress(requestId, dto);
  }

  @Sse(':requestId/stream')
  stream(@Param('requestId') requestId: string): Observable<MessageEvent> {
    return this.store.stream(requestId).pipe(map((data) => ({ data })));
  }
}
