import { describe, it, expect, afterEach, vi } from 'vitest';
import { existsSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import Fastify from 'fastify';
import type { SecurityInfo, SecurityLookupResponse } from '@portfolia/shared';
import * as schema from '../src/db/schema.js';
import { securitiesRoutes } from '../src/api/securities.js';
import type { AdapterResult } from '../src/market/borsaItalianaAdapter.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '..', 'src', 'db', 'migrations');

let testDbPath: string;
let conn: InstanceType<typeof Database>;

const FOUND: SecurityInfo = {
  isin: 'IE00BMVB5S82',
  name: 'iShares Core MSCI World UCITS ETF',
  price: 94.55,
  ticker: 'SWDA',
  instrumentType: 'ETF azionario',
  totalAnnualFees: '0,20% (TER)',
  currency: 'EUR',
  issuer: 'iShares (BlackRock)',
  segment: 'ETFplus',
  dividendPolicy: 'ad accumulazione',
};

interface BuildOpts {
  result?: AdapterResult;
  fallbackResult?: AdapterResult;
  now?: Date;
}

async function buildApp(opts: BuildOpts = {}) {
  testDbPath = join(tmpdir(), `test-api-securities-${Date.now()}-${Math.round(performance.now())}.db`);
  conn = new Database(testDbPath);
  const db = drizzle(conn, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });

  const fetchSecurity = vi.fn(async () => opts.result ?? ({ status: 'found', security: FOUND } as AdapterResult));
  const fetchSecurityFallback = vi.fn(async () => opts.fallbackResult ?? ({ status: 'not-found' } as AdapterResult));
  const now = opts.now ?? new Date('2026-06-30T10:00:00+02:00');

  const fastify = Fastify();
  await fastify.register(securitiesRoutes({ db, fetchSecurity, fetchSecurityFallback, now: () => now }));
  await fastify.ready();
  return { fastify, fetchSecurity, fetchSecurityFallback, db };
}

afterEach(() => {
  conn?.close();
  if (testDbPath && existsSync(testDbPath)) unlinkSync(testDbPath);
});

describe('GET /api/securities/:isin', () => {
  it('ISIN valido (cache miss) → 200 con anagrafica e fromCache=false', async () => {
    const { fastify, fetchSecurity } = await buildApp();
    const res = await fastify.inject({ method: 'GET', url: '/api/securities/IE00BMVB5S82' });
    expect(res.statusCode).toBe(200);
    const body = res.json<SecurityLookupResponse>();
    expect(body.fromCache).toBe(false);
    expect(body.security.name).toBe('iShares Core MSCI World UCITS ETF');
    expect(body.security.price).toBe(94.55);
    expect(body.confirmation).toBeUndefined();
    expect(fetchSecurity).toHaveBeenCalledTimes(1);
  });

  it('ISIN malformato → 400 senza contattare la fonte', async () => {
    const { fastify, fetchSecurity } = await buildApp();
    const res = await fastify.inject({ method: 'GET', url: '/api/securities/NONVALIDO' });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: string }>().error).toMatch(/ISIN/i);
    expect(fetchSecurity).not.toHaveBeenCalled();
  });

  it('ISIN non trovato alla fonte → 404', async () => {
    const { fastify } = await buildApp({ result: { status: 'not-found' } });
    const res = await fastify.inject({ method: 'GET', url: '/api/securities/US0378331005' });
    expect(res.statusCode).toBe(404);
    expect(res.json<{ error: string }>().error).toMatch(/nessuna corrispondenza/i);
  });

  it('errore di entrambe le fonti → 502', async () => {
    const { fastify } = await buildApp({
      result: { status: 'error', reason: 'timeout' },
      fallbackResult: { status: 'error', reason: 'timeout' },
    });
    const res = await fastify.inject({ method: 'GET', url: '/api/securities/IE00BMVB5S82' });
    expect(res.statusCode).toBe(502);
  });

  it('cache hit dopo prima ricerca: la fonte non viene richiamata (intra-session)', async () => {
    // Prima ricerca alle 10:00 (sessione aperta) → fetch reale.
    const { fastify, fetchSecurity, db } = await buildApp({ now: new Date('2026-06-30T10:00:00+02:00') });
    const first = await fastify.inject({ method: 'GET', url: '/api/securities/IE00BMVB5S82' });
    expect(first.statusCode).toBe(200);
    expect(first.json<SecurityLookupResponse>().fromCache).toBe(false);
    expect(fetchSecurity).toHaveBeenCalledTimes(1);

    // Seconda ricerca alle 11:00 stessa sessione → advisory soft, nessuna chiamata.
    const fetchSecurity2 = vi.fn(async () => ({ status: 'found', security: FOUND }) as AdapterResult);
    const app2 = Fastify();
    await app2.register(
      securitiesRoutes({ db, fetchSecurity: fetchSecurity2, now: () => new Date('2026-06-30T11:00:00+02:00') })
    );
    await app2.ready();

    const second = await app2.inject({ method: 'GET', url: '/api/securities/IE00BMVB5S82' });
    expect(second.statusCode).toBe(200);
    const body = second.json<SecurityLookupResponse>();
    expect(body.fromCache).toBe(true);
    expect(body.confirmation?.kind).toBe('intra-session');
    expect(body.confirmation?.message).toContain('procedere comunque');
    // La fonte NON è stata richiamata.
    expect(fetchSecurity2).not.toHaveBeenCalled();
  });

  it('guardia no-session: cache di lun sera, ricerca di mar notte → advisory forte senza chiamata', async () => {
    // Primo recupero lunedì 19:00 (mercato chiuso → fetch reale, fromCache=false).
    const { fastify, fetchSecurity, db } = await buildApp({ now: new Date('2026-06-29T19:00:00+02:00') });
    await fastify.inject({ method: 'GET', url: '/api/securities/IE00BMVB5S82' });
    expect(fetchSecurity).toHaveBeenCalledTimes(1);

    // Costruisco una seconda app sullo stesso db con now = martedì 03:00.
    const fetchSecurity2 = vi.fn(async () => ({ status: 'found', security: FOUND }) as AdapterResult);
    const app2 = Fastify();
    await app2.register(
      securitiesRoutes({ db, fetchSecurity: fetchSecurity2, now: () => new Date('2026-06-30T03:00:00+02:00') })
    );
    await app2.ready();

    const res = await app2.inject({ method: 'GET', url: '/api/securities/IE00BMVB5S82' });
    expect(res.statusCode).toBe(200);
    const body = res.json<SecurityLookupResponse>();
    expect(body.fromCache).toBe(true);
    expect(body.confirmation?.kind).toBe('no-session');
    expect(body.confirmation?.message).toContain('Non possono esserci modifiche di prezzo');
    expect(fetchSecurity2).not.toHaveBeenCalled();
  });

  it('force=true bypassa la guardia e ricontatta la fonte', async () => {
    // Cache iniziale (lunedì 19:00).
    const { fastify, fetchSecurity, db } = await buildApp({ now: new Date('2026-06-29T19:00:00+02:00') });
    await fastify.inject({ method: 'GET', url: '/api/securities/IE00BMVB5S82' });
    expect(fetchSecurity).toHaveBeenCalledTimes(1);

    const fetchSecurity2 = vi.fn(async () => ({ status: 'found', security: FOUND }) as AdapterResult);
    const app2 = Fastify();
    await app2.register(
      securitiesRoutes({ db, fetchSecurity: fetchSecurity2, now: () => new Date('2026-06-30T03:00:00+02:00') })
    );
    await app2.ready();

    const res = await app2.inject({ method: 'GET', url: '/api/securities/IE00BMVB5S82?force=true' });
    expect(res.statusCode).toBe(200);
    const body = res.json<SecurityLookupResponse>();
    expect(body.fromCache).toBe(false);
    expect(body.confirmation).toBeUndefined();
    expect(fetchSecurity2).toHaveBeenCalledTimes(1);
  });

  it('sessione trascorsa (mar → mer) → recupero fresco senza conferma', async () => {
    // Cache iniziale martedì 10:00.
    const { fetchSecurity, db } = await buildApp({ now: new Date('2026-06-30T10:00:00+02:00') });
    // riuso solo il db
    const fetchSecurity2 = vi.fn(async () => ({ status: 'found', security: FOUND }) as AdapterResult);
    const app2 = Fastify();
    await app2.register(
      securitiesRoutes({ db, fetchSecurity: fetchSecurity2, now: () => new Date('2026-07-01T10:00:00+02:00') })
    );
    await app2.ready();

    // popolo la cache con la prima app
    const app1 = Fastify();
    await app1.register(
      securitiesRoutes({ db, fetchSecurity, now: () => new Date('2026-06-30T10:00:00+02:00') })
    );
    await app1.ready();
    await app1.inject({ method: 'GET', url: '/api/securities/IE00BMVB5S82' });

    const res = await app2.inject({ method: 'GET', url: '/api/securities/IE00BMVB5S82' });
    expect(res.statusCode).toBe(200);
    const body = res.json<SecurityLookupResponse>();
    expect(body.fromCache).toBe(false);
    expect(body.confirmation).toBeUndefined();
    expect(fetchSecurity2).toHaveBeenCalledTimes(1);
  });
});

const FOUND_MS: SecurityInfo = {
  isin: 'IE00BJRHVJ28',
  name: 'iShares MSCI EM IMI ESG Screened UCITS ETF',
  price: 5.42,
  ticker: 'EMIM',
  instrumentType: 'ETF azionario',
  totalAnnualFees: '0,18% (TER)',
  currency: 'EUR',
  issuer: 'iShares (BlackRock)',
  segment: null,
  dividendPolicy: 'ad accumulazione',
};

describe('Fallback MorningStar', () => {
  it('BI found → MorningStar non viene chiamato, dataSource=borsaitaliana', async () => {
    const { fastify, fetchSecurity, fetchSecurityFallback } = await buildApp({
      result: { status: 'found', security: FOUND },
    });
    const res = await fastify.inject({ method: 'GET', url: '/api/securities/IE00BMVB5S82' });
    expect(res.statusCode).toBe(200);
    const body = res.json<SecurityLookupResponse>();
    expect(body.dataSource).toBe('borsaitaliana');
    expect(body.security.isin).toBe('IE00BMVB5S82');
    expect(fetchSecurity).toHaveBeenCalledTimes(1);
    expect(fetchSecurityFallback).not.toHaveBeenCalled();
  });

  it('BI not-found → MorningStar found, dataSource=morningstar', async () => {
    const { fastify, fetchSecurity, fetchSecurityFallback } = await buildApp({
      result: { status: 'not-found' },
      fallbackResult: { status: 'found', security: FOUND_MS },
    });
    const res = await fastify.inject({ method: 'GET', url: '/api/securities/IE00BJRHVJ28' });
    expect(res.statusCode).toBe(200);
    const body = res.json<SecurityLookupResponse>();
    expect(body.dataSource).toBe('morningstar');
    expect(body.security.isin).toBe('IE00BJRHVJ28');
    expect(fetchSecurity).toHaveBeenCalledTimes(1);
    expect(fetchSecurityFallback).toHaveBeenCalledTimes(1);
  });

  it('BI error → MorningStar found, dataSource=morningstar', async () => {
    const { fastify, fetchSecurity, fetchSecurityFallback } = await buildApp({
      result: { status: 'error', reason: 'timeout' },
      fallbackResult: { status: 'found', security: FOUND_MS },
    });
    const res = await fastify.inject({ method: 'GET', url: '/api/securities/IE00BJRHVJ28' });
    expect(res.statusCode).toBe(200);
    const body = res.json<SecurityLookupResponse>();
    expect(body.dataSource).toBe('morningstar');
    expect(fetchSecurity).toHaveBeenCalledTimes(1);
    expect(fetchSecurityFallback).toHaveBeenCalledTimes(1);
  });

  it('entrambi not-found → 404 senza valori inventati', async () => {
    const { fastify, fetchSecurity, fetchSecurityFallback } = await buildApp({
      result: { status: 'not-found' },
      fallbackResult: { status: 'not-found' },
    });
    const res = await fastify.inject({ method: 'GET', url: '/api/securities/IE00BJRHVJ28' });
    expect(res.statusCode).toBe(404);
    expect(fetchSecurity).toHaveBeenCalledTimes(1);
    expect(fetchSecurityFallback).toHaveBeenCalledTimes(1);
  });

  it('BI error + MS not-found → 404', async () => {
    const { fastify, fetchSecurity, fetchSecurityFallback } = await buildApp({
      result: { status: 'error', reason: 'network' },
      fallbackResult: { status: 'not-found' },
    });
    const res = await fastify.inject({ method: 'GET', url: '/api/securities/IE00BJRHVJ28' });
    expect(res.statusCode).toBe(404);
    expect(fetchSecurity).toHaveBeenCalledTimes(1);
    expect(fetchSecurityFallback).toHaveBeenCalledTimes(1);
  });

  it('entrambi error → 502', async () => {
    const { fastify, fetchSecurity, fetchSecurityFallback } = await buildApp({
      result: { status: 'error', reason: 'timeout BI' },
      fallbackResult: { status: 'error', reason: 'timeout MS' },
    });
    const res = await fastify.inject({ method: 'GET', url: '/api/securities/IE00BJRHVJ28' });
    expect(res.statusCode).toBe(502);
    expect(fetchSecurity).toHaveBeenCalledTimes(1);
    expect(fetchSecurityFallback).toHaveBeenCalledTimes(1);
  });
});
