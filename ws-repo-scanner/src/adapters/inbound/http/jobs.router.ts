import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { JobsController, type JobsControllerDeps } from './jobs.controller.js';

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
});

export type JobsRouterDeps = JobsControllerDeps;

export function jobsRouter(deps: JobsRouterDeps): Router {
  const controller = new JobsController(deps);
  const router = Router();

  router.post('/', upload.single('repo'), controller.create);
  router.get('/:id', controller.getById);

  router.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (err instanceof multer.MulterError) {
      res.status(413).json({ error: 'upload_error', code: err.code, message: err.message });
      return;
    }
    next(err);
  });

  return router;
}
