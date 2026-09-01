import type { NextFunction, Request, Response } from 'express';
import type { AuthenticateUseCase } from '../../../core/usecases/authenticate.js';
import { logger } from '../../../logger.js';

function bearer(req: Request): string | null {
  const header = req.header('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1]!.trim() : null;
}

// 'required'  -> 401 si no hay token válido
// 'optional'  -> deja pasar sin usuario, pero lo adjunta si el token es válido
export function requireAuth(
  authenticate: AuthenticateUseCase,
  mode: 'required' | 'optional' = 'required',
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const token = bearer(req);

    if (!token) {
      if (mode === 'optional') {
        next();
        return;
      }
      res.status(401).json({ error: 'unauthorized', message: 'Falta el token de sesión' });
      return;
    }

    try {
      req.user = await authenticate.execute(token);
      next();
    } catch (err) {
      logger.warn({ err }, 'token de sesión rechazado');
      res
        .status(401)
        .json({ error: 'unauthorized', message: 'Token de sesión inválido o expirado' });
    }
  };
}
