import type { Request, Response } from 'express';
import { InvalidRepoArchiveError } from '../../../core/domain/errors.js';
import type { AnalyzeRepoUseCase } from '../../../core/usecases/analyze-repo.js';
import type { CreateJobUseCase } from '../../../core/usecases/create-job.js';
import type { GetJobUseCase } from '../../../core/usecases/get-job.js';
import { ZipSourceAdapter } from '../../outbound/repo-source/zip-source.adapter.js';
import { logger } from '../../../logger.js';

export interface JobsControllerDeps {
  createJob: CreateJobUseCase;
  getJob: GetJobUseCase;
  analyzeRepo: AnalyzeRepoUseCase;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function looksLikeZip(file: Express.Multer.File): boolean {
  return (
    file.mimetype === 'application/zip' ||
    file.mimetype === 'application/x-zip-compressed' ||
    file.mimetype === 'application/octet-stream' ||
    file.originalname.toLowerCase().endsWith('.zip')
  );
}

export class JobsController {
  constructor(private readonly deps: JobsControllerDeps) {}

  create = async (req: Request, res: Response): Promise<void> => {
    const file = req.file;
    if (!file) {
      res.status(400).json({
        error: 'missing_file',
        message: 'Adjunta el repo como campo "repo" (multipart/form-data)',
      });
      return;
    }
    if (!looksLikeZip(file)) {
      res.status(415).json({ error: 'unsupported_media_type', message: 'Solo se acepta un archivo .zip' });
      return;
    }

    try {
      const source = new ZipSourceAdapter(file.buffer, file.originalname);
      const { jobId } = await this.deps.createJob.execute(source); // crear en la db
      // El análisis corre en segundo plano; el cliente sigue el progreso por
      // GET /api/v1/jobs/:id o por el canal WebSocket.
      void this.deps.analyzeRepo.execute({ jobId, source });
      res.status(202).json({ jobId });
    } catch (err) {
      if (err instanceof InvalidRepoArchiveError) {
        res.status(422).json({ error: err.code, message: err.message });
        return;
      }
      logger.error({ err }, 'crear job falló');
      res.status(500).json({ error: 'internal_error' });
    }
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id ?? '';
    if (!UUID_RE.test(id)) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    try {
      const job = await this.deps.getJob.execute(id);
      if (!job) {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      res.json(job);
    } catch (err) {
      logger.error({ err }, 'obtener job falló');
      res.status(500).json({ error: 'internal_error' });
    }
  };
}
