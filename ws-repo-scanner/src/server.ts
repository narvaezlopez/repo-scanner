import 'reflect-metadata';
import { createServer } from 'node:http';
import { createApp } from './app.js';
import { compose } from './composition.js';
import { attachWebSocket } from './ws/hub.js';
import { config } from './config.js';
import { logger } from './logger.js';

const container = await compose();
const app = createApp(container);
const server = createServer(app);
attachWebSocket(server, { bus: container.bus, getJob: container.getJob });

server.listen(config.PORT, () => {
  logger.info(`ws-repo-scanner escuchando en :${config.PORT} (${config.NODE_ENV})`);
});

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    logger.info(`${signal} recibido, cerrando servidor`);
    server.close(async () => {
      await container.shutdown();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
