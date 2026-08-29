import type { Request, Response } from 'express';

export interface CapturedResponse {
  res: Response;
  state: { statusCode: number; body: unknown };
}

export function mockResponse(): CapturedResponse {
  const state = { statusCode: 0, body: null as unknown };
  const res = {
    status(code: number) {
      state.statusCode = code;
      return res;
    },
    json(data: unknown) {
      if (!state.statusCode) state.statusCode = 200;
      state.body = data;
      return res;
    },
  } as unknown as Response;
  return { res, state };
}

export function mockRequest(opts: {
  file?: Partial<Express.Multer.File>;
  params?: Record<string, string>;
  body?: unknown;
}): Request {
  return {
    file: opts.file,
    params: opts.params ?? {},
    body: opts.body ?? {},
    headers: {},
  } as unknown as Request;
}
