import type { JobEvent } from '../domain/job-event.js';

export interface ProgressPort {
  emit(event: JobEvent): void;
}
