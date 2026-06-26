import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import type { HealthResponse } from '@portfolia/shared';

function buildApp() {
  const app = Fastify();
  app.get<{ Reply: HealthResponse }>('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }));
  return app;
}

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const app = buildApp();
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    const body = response.json<HealthResponse>();
    expect(body.status).toBe('ok');
    expect(typeof body.timestamp).toBe('string');
  });
});
