import type { AnalysisOverview } from '../domain/analysis-result.js';
import type { Manifest } from './read-manifests.js';
import type { RepoStructure } from './scan-structure.js';

// extensión -> lenguaje (para el "lenguaje principal")
const LANG_BY_EXT: Record<string, string> = {
  '.ts': 'TypeScript',
  '.tsx': 'TypeScript',
  '.js': 'JavaScript',
  '.jsx': 'JavaScript',
  '.mjs': 'JavaScript',
  '.cjs': 'JavaScript',
  '.py': 'Python',
  '.go': 'Go',
  '.java': 'Java',
  '.kt': 'Kotlin',
  '.rb': 'Ruby',
  '.php': 'PHP',
  '.cs': 'C#',
  '.rs': 'Rust',
  '.swift': 'Swift',
  '.scala': 'Scala',
  '.c': 'C',
  '.h': 'C',
  '.cpp': 'C++',
  '.cc': 'C++',
  '.ex': 'Elixir',
  '.exs': 'Elixir',
  '.dart': 'Dart',
};

// nombre de dependencia -> framework (para el "framework principal")
const FRAMEWORK_BY_DEP: Array<[RegExp, string]> = [
  [/^@nestjs\/core$/, 'NestJS'],
  [/^next$/, 'Next.js'],
  [/^@angular\/core$/, 'Angular'],
  [/^react$/, 'React'],
  [/^vue$/, 'Vue'],
  [/^svelte$/, 'Svelte'],
  [/^express$/, 'Express'],
  [/^fastify$/, 'Fastify'],
  [/^koa$/, 'Koa'],
  [/^@hapi\/hapi$/, 'hapi'],
  [/^django$/i, 'Django'],
  [/^flask$/i, 'Flask'],
  [/^fastapi$/i, 'FastAPI'],
  [/^rails$/i, 'Ruby on Rails'],
  [/^laravel\/framework$/, 'Laravel'],
  [/gin-gonic\/gin/, 'Gin'],
  [/gorilla\/mux/, 'Gorilla'],
  [/^actix-web$/, 'Actix'],
  [/^axum$/, 'Axum'],
];

// datos deterministas que no dependen del LLM
export function buildOverview(
  structure: RepoStructure,
  manifests: Manifest[],
  fallbackName: string,
): AnalysisOverview {
  return {
    projectName: projectName(manifests) ?? fallbackName,
    mainLanguage: mainLanguage(structure),
    mainFramework: mainFramework(manifests),
    fileCount: structure.fileCount,
  };
}

function projectName(manifests: Manifest[]): string | null {
  for (const m of manifests) {
    const f = m.facts;
    if (m.kind === 'npm' && typeof f.name === 'string') return f.name;
    if (m.kind === 'maven' && typeof f.artifactId === 'string') return f.artifactId;
    if (m.kind === 'cargo' && typeof f.name === 'string') return f.name;
    if (m.kind === 'python' && typeof f.name === 'string') return f.name;
    if (m.kind === 'go' && typeof f.module === 'string') {
      return f.module.split('/').pop() ?? f.module;
    }
  }
  return null;
}

function mainLanguage(structure: RepoStructure): string {
  for (const { ext } of structure.byExtension) {
    const lang = LANG_BY_EXT[ext];
    if (lang) return lang;
  }
  return 'Desconocido';
}

function mainFramework(manifests: Manifest[]): string | null {
  const deps = manifests.flatMap((m) => {
    const f = m.facts;
    return [
      ...toArray(f.dependencies),
      ...toArray(f.devDependencies),
      ...toArray(f.packages),
      ...toArray(f.require),
      ...toArray(f.mentions),
    ];
  });
  if (manifests.some((m) => m.kind === 'maven' && m.facts.springBoot)) return 'Spring Boot';
  for (const dep of deps) {
    for (const [re, name] of FRAMEWORK_BY_DEP) {
      if (re.test(dep)) return name;
    }
  }
  return null;
}

function toArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}
