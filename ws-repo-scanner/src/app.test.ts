import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';

describe('app', () => {
  it('responde /health con status ok', async () => {
    const app = createApp();
    const server = app.listen(0);
    const { port } = server.address() as { port: number };
    try {
      const res = await fetch(`http://localhost:${port}/health`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('ok');
    } finally {
      server.close();
    }
  });
});
