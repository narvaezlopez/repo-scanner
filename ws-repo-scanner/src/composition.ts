import 'reflect-metadata';
import { llm } from './llm/index.js';
import { CreateJobUseCase } from './core/usecases/create-job.js';
import { GetJobUseCase } from './core/usecases/get-job.js';
import { AnalyzeRepoUseCase } from './core/usecases/analyze-repo.js';
import { DatabaseConnect } from './adapters/outbound/persistence/typeorm/database.connect.js';
import { JobEntity } from './adapters/outbound/persistence/typeorm/entities/job.entity.js';
import { PgJobStore } from './adapters/outbound/persistence/typeorm/pg-job-store.adapter.js';
import { InMemoryEventBus } from './adapters/outbound/events/in-memory-event-bus.js';

export interface AppContainer {
  createJob: CreateJobUseCase;
  getJob: GetJobUseCase;
  analyzeRepo: AnalyzeRepoUseCase;
  bus: InMemoryEventBus;
  shutdown: () => Promise<void>;
}

export async function compose(): Promise<AppContainer> {
  const dataSource = await DatabaseConnect.get('repo_scanner', [JobEntity]);
  const store = new PgJobStore(dataSource);
  const bus = new InMemoryEventBus();

  return {
    createJob: new CreateJobUseCase({ store }),
    getJob: new GetJobUseCase({ store }),
    analyzeRepo: new AnalyzeRepoUseCase({ store, llm, progress: bus }),
    bus,
    shutdown: () => DatabaseConnect.closeAll(),
  };
}
