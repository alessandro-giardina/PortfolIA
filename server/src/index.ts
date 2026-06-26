import Fastify from 'fastify';
import type { HealthResponse } from '@portfolia/shared';
import { runMigrations } from './db/migrate.js';

const fastify = Fastify({ logger: true });

fastify.get<{ Reply: HealthResponse }>('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

const start = async () => {
  try {
    runMigrations();
    await fastify.listen({ port: 3200, host: '0.0.0.0' });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
