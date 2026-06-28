import Fastify from 'fastify';
import type { HealthResponse } from '@portfolia/shared';
import { runMigrations } from './db/migrate.js';
import { portfoliosRoutes } from './api/portfolios.js';
import { securitiesRoutes } from './api/securities.js';
import { positionsRoutes } from './api/positions.js';
import { closeMorningStarBrowser } from './market/morningStarBrowser.js';

runMigrations();

const fastify = Fastify({ logger: true });

// Chiude il browser headless della fonte di backup allo shutdown (US-024).
fastify.addHook('onClose', async () => {
  await closeMorningStarBrowser();
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void fastify.close().then(() => process.exit(0));
  });
}

fastify.get<{ Reply: HealthResponse }>('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

await fastify.register(portfoliosRoutes);
await fastify.register(securitiesRoutes());
await fastify.register(positionsRoutes);

const start = async () => {
  try {
    await fastify.listen({ port: 3200, host: '0.0.0.0' });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
