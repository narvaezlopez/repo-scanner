import { logger } from '../../logger.js';
import { buildOverview } from '../analysis/overview.js';
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

// orquesta el análisis: descomprime -> escanea -> lee manifiestos -> LLM -> guarda.
// emite progreso en cada fase, limpia el temporal en finally y nunca lanza
// (los fallos se guardan en el job como 'error').
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
      await this.report(jobId, 'structure', 5, 'Extrayendo el repositorio');
      const repo = await source.materialize(); // descomprime el archivo zip y prepara la carpeta temporal
      cleanup = repo.cleanup;

      const structure = await scanStructure(repo.dir);
      await this.report(
        jobId,
        'structure',
        15,
        `${structure.fileCount} ficheros, ${structure.byExtension.length} tipos`,
      );

      const manifests = await readManifests(repo.dir, structure.keyFiles);
      await this.report(jobId, 'manifests', 25, `${manifests.length} manifiestos detectados`);

      const overview = buildOverview(structure, manifests, source.name);

      // el LLM es, con diferencia, la fase más lenta: le dejamos casi todo el rango
      // restante (30-95%) y lo vamos llenando con el progreso real del streaming
      const LLM_START = 30;
      const LLM_END = 95;
      await this.report(jobId, 'llm', LLM_START, 'Infiriendo propósito y arquitectura');

      let lastLlmPct = LLM_START;
      let pendingReport: Promise<void> = Promise.resolve();
      const { text, model } = await this.deps.llm.complete({
        system: SYSTEM_PROMPT,
        prompt: buildUserPrompt(structure, manifests),
        maxTokens: 8192,
        onProgress: (ratio) => {
          const pct = Math.round(LLM_START + ratio * (LLM_END - LLM_START));
          if (pct > lastLlmPct) {
            lastLlmPct = pct;
            pendingReport = this.report(jobId, 'llm', pct, 'Generando el análisis…').catch(
              () => undefined,
            );
          }
        },
      });
      // evita que un reporte de progreso tardío pise el estado 'done' que viene abajo
      await pendingReport;
      const result = parseAnalysisResult(text, model, overview);

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
      await cleanup().catch(() => undefined);
    }
  }

  // actualiza el job + emite el evento de progreso
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
