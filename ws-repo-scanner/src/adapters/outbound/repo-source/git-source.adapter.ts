import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { InvalidRepoArchiveError } from '../../../core/domain/errors.js';
import type { MaterializedRepo, RepoSourcePort } from '../../../core/ports/repo-source.port.js';
import { ZipSourceAdapter } from './zip-source.adapter.js';

const MAX_DOWNLOAD_BYTES = 80 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 30_000;

// acepta https://github.com/o/r , .../r.git , git@github.com:o/r.git , .../r/tree/rama
const GITHUB_RE =
  /github\.com[/:]([^/\s]+)\/([^/\s#?]+?)(?:\.git)?(?:\/tree\/([^/\s#?]+))?\/?$/i;

// obtiene un repo de GitHub bajando su zip y reutilizando la extracción de ZipSourceAdapter
export class GitSourceAdapter implements RepoSourcePort {
  readonly kind = 'git' as const;
  readonly name: string;
  private readonly owner: string;
  private readonly repo: string;
  private readonly ref: string;

  constructor(url: string) {
    const m = url.trim().match(GITHUB_RE);
    if (!m) throw new InvalidRepoArchiveError('URL de GitHub no válida');
    this.owner = m[1]!;
    this.repo = m[2]!;
    this.ref = m[3] ?? 'HEAD';
    this.name = `${this.owner}/${this.repo}`;
  }

  get bytes(): number {
    return 0; // desconocido hasta descargar
  }

  async materialize(): Promise<MaterializedRepo> {
    const url = `https://codeload.github.com/${this.owner}/${this.repo}/zip/${this.ref}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, { signal: controller.signal });
    } catch {
      throw new InvalidRepoArchiveError('No se pudo descargar el repositorio de GitHub');
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 404) {
      throw new InvalidRepoArchiveError('Repositorio no encontrado (o es privado)');
    }
    if (!res.ok) {
      throw new InvalidRepoArchiveError(`GitHub respondió ${res.status}`);
    }

    const declared = Number(res.headers.get('content-length') ?? 0);
    if (declared > MAX_DOWNLOAD_BYTES) {
      throw new InvalidRepoArchiveError('El repositorio es demasiado grande');
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength > MAX_DOWNLOAD_BYTES) {
      throw new InvalidRepoArchiveError('El repositorio es demasiado grande');
    }

    const extracted = await new ZipSourceAdapter(buffer, this.name).materialize();
    return stripTopFolder(extracted);
  }
}

// el zip de GitHub envuelve todo en una carpeta "owner-repo-<sha>/"; la quitamos
async function stripTopFolder(repo: MaterializedRepo): Promise<MaterializedRepo> {
  const entries = await readdir(repo.dir, { withFileTypes: true });
  if (entries.length === 1 && entries[0]!.isDirectory()) {
    return {
      dir: join(repo.dir, entries[0]!.name),
      cleanup: () => rm(repo.dir, { recursive: true, force: true }),
    };
  }
  return repo;
}
