import type { Job } from '../domain/job.js';
import type { JobStorePort } from '../ports/job-store.port.js';

export class GetJobUseCase {
  constructor(private readonly deps: { store: JobStorePort }) {}

  execute(id: string): Promise<Job | undefined> {
    return this.deps.store.get(id);
  }
}
