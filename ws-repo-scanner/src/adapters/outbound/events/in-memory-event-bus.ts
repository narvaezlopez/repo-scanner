import { EventEmitter } from 'node:events';
import type { JobEvent } from '../../../core/domain/job-event.js';
import type { ProgressPort } from '../../../core/ports/progress.port.js';

// pub/sub en proceso; en distribuido esto sería redis o sns/sqs
export class InMemoryEventBus implements ProgressPort {
  private readonly emitter = new EventEmitter();

  emit(event: JobEvent): void {
    this.emitter.emit('job', event);
  }

  // devuelve la función para desuscribirse
  subscribe(listener: (event: JobEvent) => void): () => void {
    this.emitter.on('job', listener);
    return () => this.emitter.off('job', listener);
  }
}
