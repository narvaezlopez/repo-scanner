import { beforeEach, describe, expect, it, vi } from 'vitest';

// Repositorio TypeORM falso: la conexión real a la DB queda fuera del test.
interface Row {
  id: string;
  status: string;
  sourceKind: string;
  sourceName: string;
  sourceBytes: string;
  progress: number;
  step: string | null;
  error: string | null;
  result: unknown;
  createdAt: Date;
  updatedAt: Date;
}

const rows = new Map<string, Row>();

const repo = {
  create: (data: Partial<Row>) => ({ ...data }) as Row,
  insert: vi.fn(async (entity: Row) => {
    rows.set(entity.id, { ...entity, createdAt: new Date(), updatedAt: new Date() });
  }),
  findOne: vi.fn(async ({ where: { id } }: { where: { id: string } }) => rows.get(id) ?? null),
  save: vi.fn(async (entity: Row) => {
    rows.set(entity.id, entity);
    return entity;
  }),
};

vi.mock('../../src/adapters/outbound/persistence/typeorm/database.connect.js', () => ({
  DatabaseConnect: {
    get: vi.fn().mockResolvedValue({ getRepository: () => repo }),
    closeAll: vi.fn(),
  },
}));

import type { DataSource } from 'typeorm';
import { DatabaseConnect } from '../../src/adapters/outbound/persistence/typeorm/database.connect.js';
import { PgJobStore } from '../../src/adapters/outbound/persistence/typeorm/pg-job-store.adapter.js';
import { JobsController } from '../../src/adapters/inbound/http/jobs.controller.js';
import { CreateJobUseCase } from '../../src/core/usecases/create-job.js';
import { GetJobUseCase } from '../../src/core/usecases/get-job.js';
import type { AnalyzeRepoUseCase } from '../../src/core/usecases/analyze-repo.js';
import { mockRequest, mockResponse } from '../helpers.js';

// El análisis corre en background; para el controller basta un doble que no hace nada.
const analyzeRepo = { execute: vi.fn().mockResolvedValue(undefined) } as unknown as AnalyzeRepoUseCase;

const zipFile = {
  buffer: Buffer.from('PK fake zip'),
  originalname: 'demo.zip',
  mimetype: 'application/zip',
};

describe('JobsController', () => {
  let controller: JobsController;

  beforeEach(async () => {
    rows.clear();
    const dataSource = (await DatabaseConnect.get('repo_scanner', [])) as DataSource;
    const store = new PgJobStore(dataSource);
    controller = new JobsController({
      createJob: new CreateJobUseCase({ store }),
      getJob: new GetJobUseCase({ store }),
      analyzeRepo,
    });
  });

  describe('create', () => {
    it('devuelve 202 y { jobId } con un .zip válido', async () => {
      const { res, state } = mockResponse();

      await controller.create(mockRequest({ file: zipFile }), res);

      expect(state.statusCode).toBe(202);
      expect(state.body).toEqual({ jobId: expect.any(String) });
      expect(repo.insert).toHaveBeenCalledTimes(1);
      expect(repo.insert).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'queued', sourceKind: 'zip', sourceName: 'demo.zip' }),
      );
    });

    it('devuelve 400 si no se adjunta archivo', async () => {
      const { res, state } = mockResponse();

      await controller.create(mockRequest({}), res);

      expect(state.statusCode).toBe(400);
      expect(state.body).toMatchObject({ error: 'missing_file' });
      expect(repo.insert).not.toHaveBeenCalled();
    });

    it('devuelve 415 si el archivo no es .zip', async () => {
      const { res, state } = mockResponse();

      await controller.create(
        mockRequest({ file: { buffer: Buffer.from('hola'), originalname: 'notas.txt', mimetype: 'text/plain' } }),
        res,
      );

      expect(state.statusCode).toBe(415);
      expect(state.body).toMatchObject({ error: 'unsupported_media_type' });
    });
  });

  describe('getById', () => {
    it('devuelve 200 con el job existente', async () => {
      const created = mockResponse();
      await controller.create(mockRequest({ file: zipFile }), created.res);
      const { jobId } = created.state.body as { jobId: string };

      const { res, state } = mockResponse();
      await controller.getById(mockRequest({ params: { id: jobId } }), res);

      expect(state.statusCode).toBe(200);
      expect(state.body).toMatchObject({
        id: jobId,
        status: 'queued',
        source: { kind: 'zip', name: 'demo.zip' },
      });
    });

    it('devuelve 404 si el job no existe', async () => {
      const { res, state } = mockResponse();

      await controller.getById(
        mockRequest({ params: { id: '11111111-1111-1111-1111-111111111111' } }),
        res,
      );

      expect(state.statusCode).toBe(404);
      expect(state.body).toMatchObject({ error: 'not_found' });
      expect(repo.findOne).toHaveBeenCalledTimes(1);
    });

    it('devuelve 404 si el id no tiene formato uuid (sin tocar la BD)', async () => {
      const { res, state } = mockResponse();

      await controller.getById(mockRequest({ params: { id: 'no-existe' } }), res);

      expect(state.statusCode).toBe(404);
      expect(state.body).toMatchObject({ error: 'not_found' });
      expect(repo.findOne).not.toHaveBeenCalled();
    });
  });
});
