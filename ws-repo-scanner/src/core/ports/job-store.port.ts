import type { Job } from '../domain/job.js';

export type JobPatch = Partial<Pick<Job, 'status' | 'progress' | 'step' | 'error' | 'result'>>;

export interface JobStorePort {
  create(job: Job): Promise<Job>;
  get(id: string): Promise<Job | undefined>;
  update(id: string, patch: JobPatch): Promise<Job>;
}
