import type { Server } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { logger } from '../logger.js';

export function attachWebSocket(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (socket: WebSocket) => {
    logger.info('ws client connected');

    socket.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as { type?: string };
        if (msg.type === 'ping') {
          socket.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
        }
      } catch {
        socket.send(JSON.stringify({ type: 'error', error: 'invalid_json' }));
      }
    });

    socket.on('close', () => logger.info('ws client disconnected'));
  });

  return wss;
}
