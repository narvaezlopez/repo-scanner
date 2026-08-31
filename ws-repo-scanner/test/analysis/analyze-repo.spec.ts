import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { scanStructure } from '../../src/core/analysis/scan-structure.js';
import { readManifests } from '../../src/core/analysis/read-manifests.js';
import { parseAnalysisResult } from '../../src/core/analysis/parse-result.js';
import { AnalyzeRepoUseCase } from '../../src/core/usecases/analyze-repo.js';
import type { Job } from '../../src/core/domain/job.js';
import type { JobEvent } from '../../src/core/domain/job-event.js';
import type { JobStorePort } from '../../src/core/ports/job-store.port.js';
import type { LlmPort } from '../../src/core/ports/llm.port.js';
import type { RepoSourcePort } from '../../src/core/ports/repo-source.port.js';

let repoDir: string;

beforeEach(async () => {
  repoDir = await mkdtemp(join(tmpdir(), 'analyze-spec-'));
  await mkdir(join(repoDir, 'src'), { recursive: true });
  await writeFile(
    join(repoDir, 'package.json'),
    JSON.stringify({
      name: 'demo-api',
      dependencies: { express: '^4', pg: '^8' },
      devDependencies: { vitest: '^2' },
      scripts: { start: 'node dist/server.js', test: 'vitest' },
    }),
  );
  await writeFile(join(repoDir, 'README.md'), '# Demo API\nUna API de ejemplo.');
  await writeFile(join(repoDir, 'Dockerfile'), 'FROM node:24-alpine\nEXPOSE 3000');
  await writeFile(join(repoDir, 'src/server.ts'), 'export const x = 1;');
  await writeFile(join(repoDir, 'src/routes.ts'), 'export const r = 2;');
});

afterEach(async () => {
  await rm(repoDir, { recursive: true, force: true });
});

describe('scanStructure', () => {
  it('cuenta ficheros, agrupa por extensión y localiza los ficheros clave', async () => {
    const s = await scanStructure(repoDir);

    expect(s.fileCount).toBe(5);
    expect(s.byExtension.find((e) => e.ext === '.ts')?.count).toBe(2);
    expect(s.keyFiles).toEqual(expect.arrayContaining(['package.json', 'README.md', 'Dockerfile']));
    expect(s.topLevelEntries).toEqual(expect.arrayContaining(['src/', 'package.json']));
    expect(s.directories).toContain('src');
    expect(s.keyFileContents.some((f) => f.path === 'README.md')).toBe(true);
  });

  it('ignora node_modules', async () => {
    await mkdir(join(repoDir, 'node_modules', 'left-pad'), { recursive: true });
    await writeFile(join(repoDir, 'node_modules', 'left-pad', 'index.js'), '//');
    const s = await scanStructure(repoDir);
    expect(s.fileCount).toBe(5);
  });
});

describe('readManifests', () => {
  it('parsea package.json y Dockerfile', async () => {
    const { keyFiles } = await scanStructure(repoDir);
    const manifests = await readManifests(repoDir, keyFiles);

    const npm = manifests.find((m) => m.kind === 'npm');
    expect(npm?.facts).toMatchObject({ name: 'demo-api', dependencies: ['express', 'pg'] });

    const docker = manifests.find((m) => m.kind === 'docker');
    expect(docker?.facts).toMatchObject({ baseImages: ['node:24-alpine'] });
  });
});

describe('parseAnalysisResult', () => {
  const good = JSON.stringify({
    functionalSummary: 'API de ejemplo',
    technologies: [{ name: 'Express', category: 'framework', evidence: 'package.json' }],
    architecture: { pattern: 'n-capas', confidence: 0.7, rationale: 'capas', evidence: ['src/'] },
    findings: { components: [], recommendations: [], risks: [] },
  });

  it('acepta JSON envuelto en ```json', () => {
    const r = parseAnalysisResult('```json\n' + good + '\n```', 'claude-sonnet-5');
    expect(r.architecture.pattern).toBe('n-capas');
    expect(r.model).toBe('claude-sonnet-5');
    expect(r.generatedAt).toMatch(/^\d{4}-/);
  });

  it('normaliza enums desconocidos a un valor por defecto', () => {
    const messy = JSON.stringify({
      functionalSummary: 'x',
      technologies: [{ name: 'X', category: 'inventada', evidence: '' }],
      architecture: { pattern: 'raro', confidence: 2, rationale: '', evidence: [] },
      findings: { components: [], recommendations: [], risks: [] },
    });
    const r = parseAnalysisResult(messy, 'm');
    expect(r.technologies[0]?.category).toBe('library');
    expect(r.architecture.pattern).toBe('desconocida');
    expect(r.architecture.confidence).toBe(0.5);
  });

  it('lanza si no hay JSON', () => {
    expect(() => parseAnalysisResult('lo siento, no puedo', 'm')).toThrow();
  });

  it('recupera un JSON cortado por el límite de tokens', () => {
    const truncated = `{
      "functionalSummary": "API de ejemplo",
      "technologies": [
        { "name": "Express", "category": "framework", "evidence": "package.json" },
        { "name": "pg", "category": "database", "evidence": "package`;
    const r = parseAnalysisResult(truncated, 'claude-sonnet-5');
    expect(r.functionalSummary).toBe('API de ejemplo');
    expect(r.technologies[0]?.name).toBe('Express');
    expect(r.technologies.every((t) => t.name)).toBe(true); // nada roto
    expect(r.architecture.pattern).toBe('desconocida'); // faltaba: valor por defecto
    expect(r.findings.components).toEqual([]); // faltaba: valor por defecto
  });
});

describe('AnalyzeRepoUseCase', () => {
  function makeStore() {
    const updates: Array<Partial<Job>> = [];
    const store: JobStorePort = {
      create: async (j) => j,
      get: async () => undefined,
      update: async (_id, patch) => {
        updates.push(patch);
        return { id: _id, ...patch } as Job;
      },
    };
    return { store, updates };
  }

  const source: RepoSourcePort = {
    kind: 'zip',
    name: 'demo.zip',
    bytes: 10,
    materialize: async () => ({ dir: repoDir, cleanup: vi.fn().mockResolvedValue(undefined) }),
  };

  it('completa el job con el resultado del LLM y emite progreso', async () => {
    const { store, updates } = makeStore();
    const events: JobEvent[] = [];
    const llm: LlmPort = {
      complete: vi.fn().mockResolvedValue({
        text: JSON.stringify({
          functionalSummary: 'API',
          technologies: [{ name: 'Express', category: 'framework', evidence: 'package.json' }],
          architecture: { pattern: 'n-capas', confidence: 0.6, rationale: '', evidence: [] },
          findings: { components: [], recommendations: [], risks: [] },
        }),
        model: 'claude-sonnet-5',
      }),
    };

    const uc = new AnalyzeRepoUseCase({ store, llm, progress: { emit: (e) => events.push(e) } });
    await uc.execute({ jobId: 'job-1', source });

    const last = updates.at(-1);
    expect(last?.status).toBe('done');
    expect((last?.result as { architecture: { pattern: string } }).architecture.pattern).toBe('n-capas');
    expect(events.at(-1)?.type).toBe('done');
    expect(events.slice(0, -1).every((e) => e.type === 'progress')).toBe(true);
    expect(events.filter((e) => e.type === 'progress').length).toBeGreaterThanOrEqual(3);
  });

  it('marca el job como error si el LLM devuelve basura', async () => {
    const { store, updates } = makeStore();
    const events: JobEvent[] = [];
    const llm: LlmPort = { complete: vi.fn().mockResolvedValue({ text: 'nope', model: 'm' }) };

    const uc = new AnalyzeRepoUseCase({ store, llm, progress: { emit: (e) => events.push(e) } });
    await uc.execute({ jobId: 'job-2', source });

    expect(updates.at(-1)?.status).toBe('error');
    expect(events.at(-1)?.type).toBe('error');
  });
});
