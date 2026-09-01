import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { llm } from './llm/index.js';
import { config } from './config.js';
import { logger } from './logger.js';
import { CreateJobUseCase } from './core/usecases/create-job.js';
import { GetJobUseCase } from './core/usecases/get-job.js';
import { AnalyzeRepoUseCase } from './core/usecases/analyze-repo.js';
import { AuthenticateUseCase } from './core/usecases/authenticate.js';
import { DatabaseConnect } from './adapters/outbound/persistence/typeorm/database.connect.js';
import { JobEntity } from './adapters/outbound/persistence/typeorm/entities/job.entity.js';
import { UserEntity } from './adapters/outbound/persistence/typeorm/entities/user.entity.js';
import { PgJobStore } from './adapters/outbound/persistence/typeorm/pg-job-store.adapter.js';
import { PgUserStore } from './adapters/outbound/persistence/typeorm/pg-user-store.adapter.js';
import { FirebaseTokenVerifier } from './adapters/outbound/auth/firebase-token-verifier.adapter.js';
import { InMemoryEventBus } from './adapters/outbound/events/in-memory-event-bus.js';

export interface AppContainer {
  createJob: CreateJobUseCase;
  getJob: GetJobUseCase;
  analyzeRepo: AnalyzeRepoUseCase;
  authenticate?: AuthenticateUseCase;
  bus: InMemoryEventBus;
  shutdown: () => Promise<void>;
}

export async function compose(): Promise<AppContainer> {
  const dataSource = await DatabaseConnect.get('repo_scanner', [JobEntity, UserEntity]);
  const store = new PgJobStore(dataSource);
  const userStore = new PgUserStore(dataSource);
  const bus = new InMemoryEventBus();

  // en AWS llega como variable (Secrets Manager); en local, como ruta a un fichero
  const serviceAccount = config.FIREBASE_SERVICE_ACCOUNT
    ? config.FIREBASE_SERVICE_ACCOUNT
    : config.FIREBASE_SERVICE_ACCOUNT_FILE
      ? readFileSync(config.FIREBASE_SERVICE_ACCOUNT_FILE, 'utf8')
      : undefined;

  let authenticate: AuthenticateUseCase | undefined;
  if (serviceAccount) {
    const tokens = new FirebaseTokenVerifier(serviceAccount);
    authenticate = new AuthenticateUseCase({ tokens, users: userStore });
  } else if (config.AUTH_ENABLED) {
    throw new Error('AUTH_ENABLED=true pero falta FIREBASE_SERVICE_ACCOUNT(_FILE)');
  } else {
    logger.warn('Firebase sin configurar: la autenticación queda deshabilitada');
  }

  return {
    createJob: new CreateJobUseCase({ store }),
    getJob: new GetJobUseCase({ store }),
    analyzeRepo: new AnalyzeRepoUseCase({ store, llm, progress: bus }),
    authenticate,
    bus,
    shutdown: () => DatabaseConnect.closeAll(),
  };
}
