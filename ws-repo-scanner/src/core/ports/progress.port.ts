import type { JobEvent } from '../domain/job-event.js';

/** Puerto de salida: publica un evento de progreso. Lo implementa InMemoryEventBus. */
export interface ProgressPort {
  emit(event: JobEvent): void;
}
