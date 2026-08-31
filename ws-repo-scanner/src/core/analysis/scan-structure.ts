import { readFile, readdir, stat } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  '.angular',
  'coverage',
  'vendor',
  'target',
  '__pycache__',
  '.venv',
  'venv',
  '.terraform',
]);

/** Ficheros que revelan stack o propósito; se listan y algunos se leen para el LLM. */
const KEY_FILE_RE =
  /^(readme[^/]*|license[^/]*|dockerfile[^/]*|docker-compose\.ya?ml|makefile|procfile|\.env\.example|package\.json|tsconfig[^/]*\.json|angular\.json|nx\.json|next\.config\.[jt]s|vite\.config\.[jt]s|nest-cli\.json|requirements\.txt|pyproject\.toml|setup\.py|pipfile|pom\.xml|build\.gradle[^/]*|settings\.gradle[^/]*|go\.mod|cargo\.toml|[^/]*\.csproj|[^/]*\.sln|composer\.json|gemfile|[^/]*\.tf|serverless\.ya?ml|openapi\.ya?ml|swagger\.ya?ml)$/i;

const READABLE_EXT = new Set([
  '.md',
  '.json',
  '.txt',
  '.toml',
  '.yaml',
  '.yml',
  '.tf',
  '.xml',
  '.gradle',
  '.mod',
  '',
]);

const MAX_FILES = 8000;
const MAX_DEPTH = 8;
const MAX_READ_BYTES = 8_000;

export interface RepoStructure {
  fileCount: number;
  totalBytes: number;
  /** Extensiones más frecuentes (top 15), ordenadas por número de ficheros. */
  byExtension: Array<{ ext: string; count: number }>;
  /** Entradas de la raíz del repo (carpetas y ficheros). */
  topLevelEntries: string[];
  /** Árbol de carpetas (rutas relativas, hasta profundidad 4). Señal clave para la arquitectura. */
  directories: string[];
  /** Rutas relativas de los ficheros "clave" encontrados. */
  keyFiles: string[];
  /** Contenido (truncado) de los ficheros clave legibles. */
  keyFileContents: Array<{ path: string; content: string }>;
}

const MAX_DIRS = 250;
const DIR_TREE_DEPTH = 4;

/**
 * Recorre el repo extraído y saca un resumen determinista: cuántos ficheros,
 * de qué tipo, qué hay en la raíz y el contenido de los ficheros clave.
 * No interpreta nada — eso es trabajo del LLM.
 */
export async function scanStructure(dir: string): Promise<RepoStructure> {
  const extCount = new Map<string, number>();
  const keyFiles: string[] = [];
  const directories: string[] = [];
  let fileCount = 0;
  let totalBytes = 0;

  async function walk(current: string, depth: number): Promise<void> {
    if (depth > MAX_DEPTH || fileCount >= MAX_FILES) return;

    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (fileCount >= MAX_FILES) return;
      const full = join(current, entry.name);

      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name) && !entry.name.startsWith('.git')) {
          if (depth < DIR_TREE_DEPTH && directories.length < MAX_DIRS) {
            directories.push(relative(dir, full));
          }
          await walk(full, depth + 1);
        }
        continue;
      }
      if (!entry.isFile()) continue;

      fileCount += 1;
      const ext = extname(entry.name).toLowerCase() || '(sin extensión)';
      extCount.set(ext, (extCount.get(ext) ?? 0) + 1);

      try {
        totalBytes += (await stat(full)).size;
      } catch {
        /* ignora ficheros ilegibles */
      }

      if (KEY_FILE_RE.test(entry.name)) {
        keyFiles.push(relative(dir, full));
      }
    }
  }

  await walk(dir, 0);

  const byExtension = [...extCount.entries()]
    .map(([ext, count]) => ({ ext, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  let topLevelEntries: string[] = [];
  try {
    topLevelEntries = (await readdir(dir, { withFileTypes: true }))
      .filter((e) => !IGNORED_DIRS.has(e.name))
      .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
      .sort();
  } catch {
    /* dir vacío */
  }

  const keyFileContents = await readKeyFiles(dir, keyFiles.slice(0, 12));

  return {
    fileCount,
    totalBytes,
    byExtension,
    topLevelEntries,
    directories: directories.sort(),
    keyFiles,
    keyFileContents,
  };
}

async function readKeyFiles(
  dir: string,
  rels: string[],
): Promise<Array<{ path: string; content: string }>> {
  const out: Array<{ path: string; content: string }> = [];
  for (const rel of rels) {
    if (!READABLE_EXT.has(extname(rel).toLowerCase())) continue;
    try {
      const raw = await readFile(join(dir, rel), 'utf8');
      out.push({ path: rel, content: raw.slice(0, MAX_READ_BYTES) });
    } catch {
      /* binario o ilegible */
    }
  }
  return out;
}
