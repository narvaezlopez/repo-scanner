import { EventEmitter } from 'node:events';
import type { JobEvent } from '../../../core/domain/job-event.js';
import type { ProgressPort } from '../../../core/ports/progress.port.js';

/**
 * Implementación del ProgressPort con un EventEmitter en proceso.
 * El AnalyzeRepoUseCase publica con `emit`; el canal WebSocket escucha con
 * `subscribe`. En una versión distribuida esto sería SNS/SQS o Redis pub/sub.
 */
export class InMemoryEventBus implements ProgressPort {
  private readonly emitter = new EventEmitter();

  emit(event: JobEvent): void {
    this.emitter.emit('job', event);
  }

  /** Devuelve una función para cancelar la suscripción. */
  subscribe(listener: (event: JobEvent) => void): () => void {
    this.emitter.on('job', listener);
    return () => this.emitter.off('job', listener);
  }
}
