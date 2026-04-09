import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';
import { JobState } from '../domain/job.types';

@Injectable()
export class JobStateStore {
  private readonly states = new Map<string, JobState>();
  private readonly streams = new Map<string, Subject<JobState>>();

  create(state: JobState): void {
    this.states.set(state.requestId, state);
    this.streams.set(state.requestId, new Subject<JobState>());
    this.emit(state.requestId);
  }

  get(requestId: string): JobState | undefined {
    return this.states.get(requestId);
  }

  update(requestId: string, partial: Partial<JobState>): JobState | undefined {
    const current = this.states.get(requestId);
    if (!current) return undefined;

    const next: JobState = {
      ...current,
      ...partial,
      updatedAt: new Date().toISOString(),
    };

    this.states.set(requestId, next);
    this.emit(requestId);
    return next;
  }

  stream(requestId: string): Subject<JobState> {
    const existing = this.streams.get(requestId);
    if (existing) return existing;

    const created = new Subject<JobState>();
    this.streams.set(requestId, created);
    return created;
  }

  private emit(requestId: string): void {
    const state = this.states.get(requestId);
    if (!state) return;
    this.stream(requestId).next(state);
  }
}
