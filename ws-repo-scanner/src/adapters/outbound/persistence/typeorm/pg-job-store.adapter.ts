import type { DataSource, Repository } from 'typeorm';
import { JobNotFoundError } from '../../../../core/domain/errors.js';
import type { Job } from '../../../../core/domain/job.js';
import type { JobPatch, JobStorePort } from '../../../../core/ports/job-store.port.js';
import { JobEntity } from './entities/job.entity.js';

function toDomain(e: JobEntity): Job {
  return {
    id: e.id,
    status: e.status,
    source: { kind: e.sourceKind, name: e.sourceName, bytes: Number(e.sourceBytes) },
    progress: e.progress,
    step: e.step,
    result: e.result,
    error: e.error,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
}

export class PgJobStore implements JobStorePort {
  private readonly repo: Repository<JobEntity>;

  constructor(dataSource: DataSource) {
    this.repo = dataSource.getRepository(JobEntity);
  }

  async create(job: Job): Promise<Job> {
    await this.repo.insert(
      this.repo.create({
        id: job.id,
        status: job.status,
        sourceKind: job.source.kind,
        sourceName: job.source.name,
        sourceBytes: String(job.source.bytes),
        progress: job.progress,
        step: job.step,
        error: job.error,
        result: job.result,
      }),
    );
    return job;
  }

  async get(id: string): Promise<Job | undefined> {
    const entity = await this.repo.findOne({ where: { id } });
    return entity ? toDomain(entity) : undefined;
  }

  async update(id: string, patch: JobPatch): Promise<Job> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new JobNotFoundError(id);

    if (patch.status !== undefined) entity.status = patch.status;
    if (patch.progress !== undefined) entity.progress = patch.progress;
    if (patch.step !== undefined) entity.step = patch.step;
    if (patch.error !== undefined) entity.error = patch.error;
    if (patch.result !== undefined) entity.result = patch.result;

    return toDomain(await this.repo.save(entity));
  }
}
