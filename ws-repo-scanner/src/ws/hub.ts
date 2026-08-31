import type { Server } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { logger } from '../logger.js';
import type { InMemoryEventBus } from '../adapters/outbound/events/in-memory-event-bus.js';
import type { GetJobUseCase } from '../core/usecases/get-job.js';

export interface WsDeps {
  bus: InMemoryEventBus;
  getJob: GetJobUseCase;
}

// /ws — solo transporta eventos, no sabe qué es un análisis.
// cliente: { type:'subscribe', jobId }  ->  servidor: snapshot + progress/done/error
export function attachWebSocket(server: Server, deps: WsDeps): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/ws' });

  // jobId -> sockets suscritos
  const subscribers = new Map<string, Set<WebSocket>>();

  // una sola escucha del bus; reparte cada evento a los sockets de su jobId
  deps.bus.subscribe((event) => {
    const sockets = subscribers.get(event.jobId);
    if (!sockets?.size) return;
    const payload = JSON.stringify(event);
    for (const socket of sockets) {
      if (socket.readyState === socket.OPEN) socket.send(payload);
    }
  });

  wss.on('connection', (socket: WebSocket) => {
    const joined = new Set<string>();

    socket.on('message', async (raw) => {
      let msg: { type?: string; jobId?: string };
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        socket.send(JSON.stringify({ type: 'error', message: 'invalid_json' }));
        return;
      }

      if (msg.type === 'subscribe' && msg.jobId) {
        const jobId = msg.jobId;
        let set = subscribers.get(jobId);
        if (!set) {
          set = new Set();
          subscribers.set(jobId, set);
        }
        set.add(socket);
        joined.add(jobId);

        const job = await deps.getJob.execute(jobId).catch(() => undefined);
        socket.send(JSON.stringify({ type: 'snapshot', jobId, job: job ?? null }));
      }
    });

    socket.on('close', () => {
      for (const jobId of joined) {
        const set = subscribers.get(jobId);
        set?.delete(socket);
        if (set && set.size === 0) subscribers.delete(jobId);
      }
    });
  });

  logger.info('WebSocket montado en /ws');
  return wss;
}
