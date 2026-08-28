import type { Server } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { logger } from '../logger.js';

export function attachWebSocket(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (socket: WebSocket) => {
    logger.info('ws client connected');
    socket.send(JSON.stringify({ type: 'welcome', ts: Date.now() }));

    socket.on('message', (raw) => {
      let msg: unknown;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        socket.send(JSON.stringify({ type: 'error', error: 'invalid_json' }));
        return;
      }
      if ((msg as { type?: string }).type === 'ping') {
        socket.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
      }
    });

    socket.on('close', () => logger.info('ws client disconnected'));
  });

  return wss;
}
