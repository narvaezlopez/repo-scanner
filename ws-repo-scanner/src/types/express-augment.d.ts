import type { User } from '../core/domain/user.js';

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export {};
