import type { Request, Response } from 'express';

// GET /api/v1/auth/me — devuelve el usuario resuelto por el middleware
export function meHandler(req: Request, res: Response): void {
  if (!req.user) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  res.json({ user: req.user });
}
