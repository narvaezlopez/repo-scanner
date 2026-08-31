import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

export type ManifestKind =
  | 'npm'
  | 'python'
  | 'maven'
  | 'gradle'
  | 'go'
  | 'cargo'
  | 'dotnet'
  | 'docker'
  | 'compose'
  | 'terraform'
  | 'other';

export interface Manifest {
  /** Ruta relativa dentro del repo. */
  path: string;
  kind: ManifestKind;
  /** Hechos extraídos, ya normalizados (deps, scripts, imágenes base…). */
  facts: Record<string, unknown>;
}

/**
 * Lee y parsea los manifiestos de build encontrados por scanStructure.
 * Cada parser saca hechos concretos (nombres de dependencias, scripts, imágenes
 * base, providers de Terraform…) para dar señal fiable al LLM sin gastar tokens
 * en volcar ficheros enteros.
 */
export async function readManifests(dir: string, keyFiles: string[]): Promise<Manifest[]> {
  const out: Manifest[] = [];

  for (const rel of keyFiles) {
    const name = basename(rel).toLowerCase();
    let raw: string;
    try {
      raw = await readFile(join(dir, rel), 'utf8');
    } catch {
      continue;
    }

    if (name === 'package.json') out.push({ path: rel, kind: 'npm', facts: parsePackageJson(raw) });
    else if (name === 'requirements.txt')
      out.push({ path: rel, kind: 'python', facts: { packages: parseRequirements(raw) } });
    else if (name === 'pyproject.toml')
      out.push({ path: rel, kind: 'python', facts: parsePyproject(raw) });
    else if (name === 'pom.xml') out.push({ path: rel, kind: 'maven', facts: parsePomXml(raw) });
    else if (name.startsWith('build.gradle'))
      out.push({ path: rel, kind: 'gradle', facts: { dependencies: parseGradle(raw) } });
    else if (name === 'go.mod') out.push({ path: rel, kind: 'go', facts: parseGoMod(raw) });
    else if (name === 'cargo.toml') out.push({ path: rel, kind: 'cargo', facts: parseCargo(raw) });
    else if (name.endsWith('.csproj'))
      out.push({ path: rel, kind: 'dotnet', facts: { packages: parseCsproj(raw) } });
    else if (name === 'dockerfile')
      out.push({ path: rel, kind: 'docker', facts: parseDockerfile(raw) });
    else if (name === 'docker-compose.yml' || name === 'docker-compose.yaml')
      out.push({ path: rel, kind: 'compose', facts: parseCompose(raw) });
    else if (name.endsWith('.tf'))
      out.push({ path: rel, kind: 'terraform', facts: parseTerraform(raw) });
  }

  return out;
}

function parsePackageJson(raw: string): Record<string, unknown> {
  try {
    const pkg = JSON.parse(raw) as Record<string, unknown>;
    const deps = Object.keys((pkg.dependencies as object) ?? {});
    const devDeps = Object.keys((pkg.devDependencies as object) ?? {});
    return {
      name: pkg.name,
      description: pkg.description,
      type: pkg.type,
      scripts: Object.keys((pkg.scripts as object) ?? {}),
      dependencies: deps,
      devDependencies: devDeps,
      workspaces: pkg.workspaces,
    };
  } catch {
    return { error: 'package.json no es JSON válido' };
  }
}

function parseRequirements(raw: string): string[] {
  return raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split(/[<>=!~ ]/)[0])
    .filter((v): v is string => Boolean(v));
}

function parsePyproject(raw: string): Record<string, unknown> {
  const deps = [...raw.matchAll(/^\s*"?([A-Za-z0-9_.-]+)"?\s*[=:]/gm)]
    .map((m) => m[1])
    .filter((v): v is string => Boolean(v));
  const name = raw.match(/^\s*name\s*=\s*"([^"]+)"/m)?.[1];
  return { name, mentions: [...new Set(deps)].slice(0, 40) };
}

function parsePomXml(raw: string): Record<string, unknown> {
  const artifactId = raw.match(/<artifactId>([^<]+)<\/artifactId>/)?.[1];
  const deps = [...raw.matchAll(/<dependency>[\s\S]*?<artifactId>([^<]+)<\/artifactId>/g)]
    .map((m) => m[1])
    .filter((v): v is string => Boolean(v));
  const springBoot = /spring-boot/.test(raw);
  return { artifactId, dependencies: [...new Set(deps)], springBoot };
}

function parseGradle(raw: string): string[] {
  return [...raw.matchAll(/(?:implementation|api|compile|testImplementation)[\s(]+['"]([^'"]+)['"]/g)]
    .map((m) => m[1])
    .filter((v): v is string => Boolean(v));
}

function parseGoMod(raw: string): Record<string, unknown> {
  const module = raw.match(/^module\s+(\S+)/m)?.[1];
  const goVersion = raw.match(/^go\s+(\S+)/m)?.[1];
  const require = [...raw.matchAll(/^\s+([\w./-]+)\s+v\S+/gm)]
    .map((m) => m[1])
    .filter((v): v is string => Boolean(v));
  return { module, goVersion, require };
}

function parseCargo(raw: string): Record<string, unknown> {
  const name = raw.match(/^\s*name\s*=\s*"([^"]+)"/m)?.[1];
  const inDeps = raw.split(/\[dependencies\]/)[1] ?? '';
  const deps = [...inDeps.matchAll(/^\s*([A-Za-z0-9_-]+)\s*=/gm)]
    .map((m) => m[1])
    .filter((v): v is string => Boolean(v));
  return { name, dependencies: deps };
}

function parseCsproj(raw: string): string[] {
  return [...raw.matchAll(/<PackageReference\s+Include="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((v): v is string => Boolean(v));
}

function parseDockerfile(raw: string): Record<string, unknown> {
  const from = [...raw.matchAll(/^\s*FROM\s+(\S+)/gim)].map((m) => m[1]);
  const expose = [...raw.matchAll(/^\s*EXPOSE\s+(.+)/gim)].map((m) => m[1]?.trim());
  return { baseImages: from, expose };
}

function parseCompose(raw: string): Record<string, unknown> {
  const services = [...raw.matchAll(/^ {2}([a-zA-Z0-9_-]+):\s*$/gm)].map((m) => m[1]);
  const images = [...raw.matchAll(/^\s*image:\s*(\S+)/gm)].map((m) => m[1]);
  return { services, images };
}

function parseTerraform(raw: string): Record<string, unknown> {
  const providers = [...raw.matchAll(/provider\s+"([^"]+)"/g)].map((m) => m[1]);
  const resources = [...new Set([...raw.matchAll(/resource\s+"([^"]+)"/g)].map((m) => m[1]))];
  return { providers: [...new Set(providers)], resources: resources.slice(0, 30) };
}
