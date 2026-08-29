import 'reflect-metadata';
import { CreateJobUseCase } from './core/usecases/create-job.js';
import { GetJobUseCase } from './core/usecases/get-job.js';
import { DatabaseConnect } from './adapters/outbound/persistence/typeorm/database.connect.js';
import { JobEntity } from './adapters/outbound/persistence/typeorm/entities/job.entity.js';
import { PgJobStore } from './adapters/outbound/persistence/typeorm/pg-job-store.adapter.js';

export interface AppContainer {
  createJob: CreateJobUseCase;
  getJob: GetJobUseCase;
  shutdown: () => Promise<void>;
}

export async function compose(): Promise<AppContainer> {
  const dataSource = await DatabaseConnect.get('repo_scanner', [JobEntity]);
  const store = new PgJobStore(dataSource);

  return {
    createJob: new CreateJobUseCase({ store }),
    getJob: new GetJobUseCase({ store }),
    shutdown: () => DatabaseConnect.closeAll(),
  };
}
