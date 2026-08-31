import express, { type Request, type Response } from 'express';
import { pinoHttp } from 'pino-http';
import { z } from 'zod';
import { config } from './config.js';
import { logger } from './logger.js';
import { llm } from './llm/index.js';
import { jobsRouter } from './adapters/inbound/http/jobs.router.js';
import type { AnalyzeRepoUseCase } from './core/usecases/analyze-repo.js';
import type { CreateJobUseCase } from './core/usecases/create-job.js';
import type { GetJobUseCase } from './core/usecases/get-job.js';

const completeSchema = z.object({
  prompt: z.string().min(1).max(20_000),
  system: z.string().max(4_000).optional(),
  maxTokens: z.coerce.number().int().positive().max(4_096).optional(),
});

export interface AppDeps {
  createJob: CreateJobUseCase;
  getJob: GetJobUseCase;
  analyzeRepo: AnalyzeRepoUseCase;
}

export function createApp(deps: AppDeps) {
  const app = express();

  app.use(pinoHttp({ logger }));
  app.use(express.json({ limit: '1mb' }));

  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', config.CORS_ORIGIN);
    res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });

  app.post('/api/v1/llm/complete', async (req: Request, res: Response) => {
    const parsed = completeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
      return;
    }
    try {
      const result = await llm.complete(parsed.data);
      res.json(result);
    } catch (err) {
      logger.error({ err }, 'llm complete failed');
      res.status(502).json({ error: 'llm_error', message: (err as Error).message });
    }
  });

  app.use(
    '/api/v1/jobs',
    jobsRouter({
      createJob: deps.createJob,
      getJob: deps.getJob,
      analyzeRepo: deps.analyzeRepo,
    }),
  );

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'not_found' });
  });

  return app;
}
