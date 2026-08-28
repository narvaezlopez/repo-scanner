import { createServer } from 'node:http';
import { createApp } from './app.js';
import { attachWebSocket } from './ws/hub.js';
import { config } from './config.js';
import { logger } from './logger.js';

const app = createApp();
const server = createServer(app);
attachWebSocket(server);

server.listen(config.PORT, () => {
  logger.info(`ws-repo-scanner escuchando en :${config.PORT} (${config.NODE_ENV})`);
});

// Apagado ordenado: el ALB deja de enrutar tras fallar el health check.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    logger.info(`${signal} recibido, cerrando servidor`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
