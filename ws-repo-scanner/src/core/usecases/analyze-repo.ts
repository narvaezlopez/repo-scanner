import { logger } from '../../logger.js';
import { parseAnalysisResult } from '../analysis/parse-result.js';
import { buildUserPrompt, SYSTEM_PROMPT } from '../analysis/prompt.js';
import { readManifests } from '../analysis/read-manifests.js';
import { scanStructure } from '../analysis/scan-structure.js';
import type { AnalysisStep } from '../domain/job.js';
import type { LlmPort } from '../ports/llm.port.js';
import type { JobStorePort } from '../ports/job-store.port.js';
import type { ProgressPort } from '../ports/progress.port.js';
import type { RepoSourcePort } from '../ports/repo-source.port.js';

export interface AnalyzeRepoInput {
  jobId: string;
  source: RepoSourcePort;
}

/**
 * El motor. Orquesta el análisis de un repo ya encolado:
 *   materialize (descomprimir) -> escanear estructura -> leer manifiestos
 *   -> pedir al LLM propósito+arquitectura -> validar -> guardar el resultado.
 * Emite progreso en cada fase y siempre limpia la carpeta temporal.
 * No lanza: los fallos se guardan en el job (status 'error').
 */
export class AnalyzeRepoUseCase {
  constructor(
    private readonly deps: {
      store: JobStorePort;
      llm: LlmPort;
      progress: ProgressPort;
    },
  ) {}

  async execute({ jobId, source }: AnalyzeRepoInput): Promise<void> {
    let cleanup: () => Promise<void> = async () => {};

    try {
      await this.report(jobId, 'structure', 10, 'Extrayendo el repositorio');
      const repo = await source.materialize(); // descomprime el archivo zip y prepara la carpeta temporal
      cleanup = repo.cleanup;

      const structure = await scanStructure(repo.dir);
      await this.report(
        jobId,
        'structure',
        35,
        `${structure.fileCount} ficheros, ${structure.byExtension.length} tipos`,
      );

      const manifests = await readManifests(repo.dir, structure.keyFiles);
      await this.report(jobId, 'manifests', 60, `${manifests.length} manifiestos detectados`);

      await this.report(jobId, 'llm', 80, 'Infiriendo propósito y arquitectura');
      const { text, model } = await this.deps.llm.complete({
        system: SYSTEM_PROMPT,
        prompt: buildUserPrompt(structure, manifests),
        maxTokens: 8192,
      });
      const result = parseAnalysisResult(text, model);

      await this.deps.store.update(jobId, {
        status: 'done',
        step: 'done',
        progress: 100,
        result,
        error: null,
      });
      this.deps.progress.emit({ type: 'done', jobId, result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ err, jobId }, 'análisis falló');
      await this.deps.store
        .update(jobId, { status: 'error', error: message })
        .catch((e) => logger.error({ e, jobId }, 'no se pudo marcar el job como error'));
      this.deps.progress.emit({ type: 'error', jobId, message });
    } finally {
      await cleanup().catch(() => {
        /* la carpeta temporal ya no existe */
      });
    }
  }

  /** Actualiza el job y emite un evento de progreso en una sola operación. */
  private async report(
    jobId: string,
    step: AnalysisStep,
    progress: number,
    message: string,
  ): Promise<void> {
    await this.deps.store.update(jobId, { status: 'running', step, progress });
    this.deps.progress.emit({ type: 'progress', jobId, step, progress, message });
  }
}
