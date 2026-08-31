import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import AdmZip from 'adm-zip';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InvalidRepoArchiveError } from '../../src/core/domain/errors.js';
import { GitSourceAdapter } from '../../src/adapters/outbound/repo-source/git-source.adapter.js';

// zip como el que sirve GitHub: todo dentro de "repo-main/"
function githubZip(): Buffer {
  const zip = new AdmZip();
  zip.addFile('cors-main/package.json', Buffer.from('{"name":"cors"}'));
  zip.addFile('cors-main/src/index.js', Buffer.from('module.exports = 1'));
  return zip.toBuffer();
}

const realFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = vi.fn(async () =>
    new Response(githubZip(), { status: 200, headers: { 'content-length': '200' } }),
  ) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('GitSourceAdapter', () => {
  it('extrae los datos de la URL de GitHub', () => {
    const a = new GitSourceAdapter('https://github.com/expressjs/cors');
    expect(a.kind).toBe('git');
    expect(a.name).toBe('expressjs/cors');
    expect(a.bytes).toBe(0);
  });

  it('acepta variantes de URL', () => {
    expect(new GitSourceAdapter('https://github.com/a/b.git').name).toBe('a/b');
    expect(new GitSourceAdapter('git@github.com:a/b.git').name).toBe('a/b');
    expect(new GitSourceAdapter('https://github.com/a/b/tree/dev').name).toBe('a/b');
  });

  it('rechaza URLs que no son de GitHub', () => {
    expect(() => new GitSourceAdapter('https://gitlab.com/a/b')).toThrow(InvalidRepoArchiveError);
  });

  it('descarga el zip y quita la carpeta raíz de GitHub', async () => {
    const { dir, cleanup } = await new GitSourceAdapter('https://github.com/expressjs/cors').materialize();
    try {
      // package.json queda en la raíz, no bajo "cors-main/"
      expect((await readFile(join(dir, 'package.json'))).toString()).toContain('cors');
      expect((await stat(join(dir, 'src/index.js'))).isFile()).toBe(true);
    } finally {
      await cleanup();
    }
  });

  it('lanza si GitHub devuelve 404', async () => {
    globalThis.fetch = vi.fn(async () => new Response('', { status: 404 })) as typeof fetch;
    await expect(
      new GitSourceAdapter('https://github.com/x/y').materialize(),
    ).rejects.toBeInstanceOf(InvalidRepoArchiveError);
  });
});
