import type { AnalysisResult } from './analysis-result.js';
import type { AnalysisStep } from './job.js';

/** Eventos que emite el análisis mientras avanza. Los consume el canal WebSocket. */
export type JobEvent =
  | { type: 'progress'; jobId: string; step: AnalysisStep; progress: number; message: string }
  | { type: 'done'; jobId: string; result: AnalysisResult }
  | { type: 'error'; jobId: string; message: string };
