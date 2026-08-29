import { randomUUID } from 'node:crypto';
import type { Job } from '../domain/job.js';
import type { JobStorePort } from '../ports/job-store.port.js';
import type { RepoSourcePort } from '../ports/repo-source.port.js';

export class CreateJobUseCase {
  constructor(private readonly deps: { store: JobStorePort }) {}

  async execute(source: RepoSourcePort): Promise<{ jobId: string }> {
    const now = new Date().toISOString();
    const job: Job = {
      id: randomUUID(),
      status: 'queued',
      source: { kind: source.kind, name: source.name, bytes: source.bytes },
      progress: 0,
      step: null,
      result: null,
      error: null,
      createdAt: now,
      updatedAt: now,
    };
    await this.deps.store.create(job);
    return { jobId: job.id };
  }
}
