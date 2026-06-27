import Fastify from 'fastify';
import type { HealthResponse } from '@portfolia/shared';
import { runMigrations } from './db/migrate.js';
import { portfoliosRoutes } from './api/portfolios.js';

runMigrations();

const fastify = Fastify({ logger: true });

fastify.get<{ Reply: HealthResponse }>('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

await fastify.register(portfoliosRoutes);

const start = async () => {
  try {
    await fastify.listen({ port: 3200, host: '0.0.0.0' });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
