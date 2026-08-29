import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import AdmZip from 'adm-zip';
import { InvalidRepoArchiveError } from '../../../core/domain/errors.js';
import type { MaterializedRepo, RepoSourcePort } from '../../../core/ports/repo-source.port.js';

// limite de contenido descomprimido
const MAX_ENTRIES = 20_000;
const MAX_TOTAL_BYTES = 512 * 1024 * 1024;
const MAX_FILE_BYTES = 25 * 1024 * 1024;

export class ZipSourceAdapter implements RepoSourcePort {
  readonly kind = 'zip' as const;

  constructor(
    private readonly archive: Buffer,
    readonly name: string,
  ) {}

  get bytes(): number {
    return this.archive.byteLength;
  }

  async materialize(): Promise<MaterializedRepo> {
    let zip: AdmZip;
    try {
      zip = new AdmZip(this.archive);
    } catch {
      throw new InvalidRepoArchiveError('El archivo no es un ZIP válido');
    }

    const entries = zip.getEntries();
    if (entries.length === 0) {
      throw new InvalidRepoArchiveError('El ZIP está vacío');
    }
    if (entries.length > MAX_ENTRIES) {
      throw new InvalidRepoArchiveError(`El ZIP supera el máximo de ${MAX_ENTRIES} entradas`);
    }

    const dir = await mkdtemp(join(tmpdir(), 'repo-scan-')); // crea directorio temporal para descomprimir el ZIP
    let total = 0;

    try {
      for (const entry of entries) {
        if (entry.isDirectory) continue;

        const target = join(dir, entry.entryName);
        const rel = relative(dir, target);
        if (rel === '' || rel.startsWith('..') || isAbsolute(rel) || rel.split(sep).includes('..')) {
          throw new InvalidRepoArchiveError(`Ruta insegura en el ZIP: ${entry.entryName}`);
        }

        const size = entry.header.size;
        if (size > MAX_FILE_BYTES) {
          throw new InvalidRepoArchiveError(`Fichero demasiado grande en el ZIP: ${entry.entryName}`);
        }
        total += size;
        if (total > MAX_TOTAL_BYTES) {
          throw new InvalidRepoArchiveError('El contenido descomprimido supera el límite permitido');
        }

        await mkdir(dirname(target), { recursive: true }); // crea los directorios necesarios para el fichero
        await writeFile(target, entry.getData()); // escribe el fichero descomprimido
      }
    } catch (err) {
      await rm(dir, { recursive: true, force: true }); // elimina el directorio temporal en caso de error
      throw err;
    }

    return {
      dir,
      cleanup: () => rm(dir, { recursive: true, force: true }), // elimina el directorio temporal cuando ya no se necesita
    };
  }
}
