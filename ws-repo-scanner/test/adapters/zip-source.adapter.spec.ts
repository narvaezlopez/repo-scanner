import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import AdmZip from 'adm-zip';
import { afterEach, describe, expect, it } from 'vitest';
import { InvalidRepoArchiveError } from '../../src/core/domain/errors.js';
import { ZipSourceAdapter } from '../../src/adapters/outbound/repo-source/zip-source.adapter.js';

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((fn) => fn()));
});

describe('ZipSourceAdapter', () => {
  it('extrae el contenido a una carpeta temporal', async () => {
    const zip = new AdmZip();
    zip.addFile('package.json', Buffer.from('{"name":"x"}'));
    zip.addFile('src/index.js', Buffer.from('console.log(1)'));

    const source = new ZipSourceAdapter(zip.toBuffer(), 'x.zip');
    const { dir, cleanup } = await source.materialize();
    cleanups.push(cleanup);

    expect((await readFile(join(dir, 'package.json'))).toString()).toContain('"name":"x"');
    expect((await stat(join(dir, 'src/index.js'))).isFile()).toBe(true);
  });

  it('rechaza rutas con path traversal (zip-slip)', async () => {
    // zip con la entrada "../escape.txt", hecho con python (adm-zip normaliza los nombres al escribir)
    const ZIP_SLIP_B64 =
      'UEsDBBQAAAAIABpnHV1+UwTZBwAAAAUAAAANAAAALi4vZXNjYXBlLnR4dCsoz0tNAQBQSwMEFAAAAAgAGmcdXZJUqb4GAAAABAAAAAYAAABvay50eHRLy8xLBQBQSwECFAMUAAAACAAaZx1dflME2QcAAAAFAAAADQAAAAAAAAAAAAAAgAEAAAAALi4vZXNjYXBlLnR4dFBLAQIUAxQAAAAIABpnHV2SVKm+BgAAAAQAAAAGAAAAAAAAAAAAAACAATIAAABvay50eHRQSwUGAAAAAAIAAgBvAAAAXAAAAAAA';

    const source = new ZipSourceAdapter(Buffer.from(ZIP_SLIP_B64, 'base64'), 'evil.zip');
    await expect(source.materialize()).rejects.toBeInstanceOf(InvalidRepoArchiveError);
  });

  it('rechaza un buffer que no es un ZIP', async () => {
    const source = new ZipSourceAdapter(Buffer.from('not a zip at all'), 'bad.zip');
    await expect(source.materialize()).rejects.toBeInstanceOf(InvalidRepoArchiveError);
  });

  it('cleanup borra la carpeta temporal', async () => {
    const zip = new AdmZip();
    zip.addFile('a.txt', Buffer.from('a'));
    const source = new ZipSourceAdapter(zip.toBuffer(), 'x.zip');
    const { dir, cleanup } = await source.materialize();
    await cleanup();
    await expect(stat(dir)).rejects.toThrow();
  });
});
