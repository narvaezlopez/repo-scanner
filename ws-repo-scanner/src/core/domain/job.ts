import type { AnalysisResult } from './analysis-result.js';

export type JobStatus = 'queued' | 'running' | 'done' | 'error';

export type JobSourceKind = 'zip' | 'git';

export type AnalysisStep = 'structure' | 'manifests' | 'llm' | 'done';

export interface JobSource {
  kind: JobSourceKind;
  name: string;
  bytes: number;
}

export interface Job {
  id: string;
  status: JobStatus;
  source: JobSource;
  progress: number;
  step: AnalysisStep | null;
  result: AnalysisResult | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}
