import type { JobSourceKind } from '../domain/job.js';

export interface MaterializedRepo {
  dir: string;
  cleanup: () => Promise<void>;
}

export interface RepoSourcePort {
  readonly kind: JobSourceKind;
  readonly name: string;
  readonly bytes: number;
  materialize(): Promise<MaterializedRepo>;
}
