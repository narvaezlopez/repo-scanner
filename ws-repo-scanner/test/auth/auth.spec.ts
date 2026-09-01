import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { AuthenticateUseCase } from '../../src/core/usecases/authenticate.js';
import { requireAuth } from '../../src/adapters/inbound/http/require-auth.js';
import type { User } from '../../src/core/domain/user.js';
import type { NewUser, UserStorePort } from '../../src/core/ports/user-store.port.js';
import type { TokenVerifierPort } from '../../src/core/ports/token-verifier.port.js';
import { mockResponse } from '../helpers.js';

function makeUserStore(seed: User[] = []) {
  const byUid = new Map(seed.map((u) => [u.firebaseUid, u]));
  const store: UserStorePort = {
    findByFirebaseUid: vi.fn(async (uid: string) => byUid.get(uid)),
    create: vi.fn(async (u: NewUser) => {
      const user: User = {
        id: `id-${u.firebaseUid}`,
        firebaseUid: u.firebaseUid,
        email: u.email,
        createdAt: new Date().toISOString(),
      };
      byUid.set(u.firebaseUid, user);
      return user;
    }),
  };
  return { store, byUid };
}

function reqWithAuth(header?: string): Request {
  return { header: (name: string) => (name.toLowerCase() === 'authorization' ? header : undefined) } as unknown as Request;
}

describe('AuthenticateUseCase', () => {
  const tokens: TokenVerifierPort = {
    verify: vi.fn(async (t: string) => ({ uid: `uid-${t}`, email: `${t}@mail.com` })),
  };

  it('crea el usuario la primera vez (JIT) y lo reutiliza después', async () => {
    const { store } = makeUserStore();
    const uc = new AuthenticateUseCase({ tokens, users: store });

    const first = await uc.execute('abc');
    expect(first.firebaseUid).toBe('uid-abc');
    expect(store.create).toHaveBeenCalledTimes(1);

    const second = await uc.execute('abc');
    expect(second.id).toBe(first.id);
    expect(store.create).toHaveBeenCalledTimes(1);
  });

  it('propaga el error si el token no verifica', async () => {
    const failing: TokenVerifierPort = { verify: vi.fn().mockRejectedValue(new Error('bad token')) };
    const { store } = makeUserStore();
    const uc = new AuthenticateUseCase({ tokens: failing, users: store });

    await expect(uc.execute('x')).rejects.toThrow('bad token');
  });
});

describe('requireAuth', () => {
  const tokens: TokenVerifierPort = {
    verify: vi.fn(async () => ({ uid: 'uid-1', email: 'u@mail.com' })),
  };

  function middleware(mode: 'required' | 'optional') {
    const { store } = makeUserStore();
    const uc = new AuthenticateUseCase({ tokens, users: store });
    return requireAuth(uc, mode);
  }

  it('required: 401 sin cabecera Authorization', async () => {
    const { res, state } = mockResponse();
    const next = vi.fn() as NextFunction;

    await middleware('required')(reqWithAuth(), res, next);

    expect(state.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('required: adjunta req.user con un Bearer válido', async () => {
    const { res } = mockResponse();
    const next = vi.fn() as NextFunction;
    const req = reqWithAuth('Bearer good');

    await middleware('required')(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.user?.firebaseUid).toBe('uid-1');
  });

  it('optional: deja pasar sin usuario cuando no hay token', async () => {
    const { res, state } = mockResponse();
    const next = vi.fn() as NextFunction;
    const req = reqWithAuth();

    await middleware('optional')(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(state.statusCode).toBe(0);
    expect(req.user).toBeUndefined();
  });

  it('required: 401 si el token no verifica', async () => {
    const failing: TokenVerifierPort = { verify: vi.fn().mockRejectedValue(new Error('nope')) };
    const { store } = makeUserStore();
    const mw = requireAuth(new AuthenticateUseCase({ tokens: failing, users: store }), 'required');
    const { res, state } = mockResponse();
    const next = vi.fn() as NextFunction;

    await mw(reqWithAuth('Bearer bad'), res, next);

    expect(state.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });
});
