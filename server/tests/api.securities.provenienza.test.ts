/**
 * US-018 — Persistenza della provenienza del dato (FR-021).
 *
 * Prima di questa spec la fonte viveva solo nella risposta di un recupero
 * fresco: per un titolo già in archivio era informazione perduta. Qui si
 * verifica che `securities.data_source` la conservi e che una riga senza
 * provenienza registrata resti tale, senza essere attribuita d'ufficio a
 * Borsa Italiana.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { existsSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
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

/** Il db di prova porta con sé lo schema: senza il generico, `securities` non esiste per il tipo. */
type DbDiProva = ReturnType<typeof drizzle<typeof schema>>;

let testDbPath: string;
let conn: InstanceType<typeof Database>;

const ISIN = 'IE00BMVB5S82';

const DA_BORSA_ITALIANA: SecurityInfo = {
  isin: ISIN,
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

const DA_MORNINGSTAR: SecurityInfo = {
  ...DA_BORSA_ITALIANA,
  price: 95.10,
  segment: null,
};

interface OpzioniApp {
  db?: DbDiProva;
  result?: AdapterResult;
  fallbackResult?: AdapterResult;
  now?: Date;
}

/** Crea un'app sul db indicato (o su uno nuovo) con adapter deterministici. */
async function buildApp(opts: OpzioniApp = {}) {
  let db = opts.db;
  if (!db) {
    testDbPath = join(tmpdir(), `test-provenienza-${Date.now()}-${Math.round(performance.now())}.db`);
    conn = new Database(testDbPath);
    db = drizzle(conn, { schema });
    migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  }

  const fetchSecurity = vi.fn(async () => opts.result ?? ({ status: 'found', security: DA_BORSA_ITALIANA } as AdapterResult));
  const fetchSecurityFallback = vi.fn(async () => opts.fallbackResult ?? ({ status: 'not-found' } as AdapterResult));
  const now = opts.now ?? new Date('2026-06-30T10:00:00+02:00');

  const fastify = Fastify();
  await fastify.register(securitiesRoutes({ db, fetchSecurity, fetchSecurityFallback, now: () => now }));
  await fastify.ready();
  return { fastify, fetchSecurity, fetchSecurityFallback, db };
}

/** Legge la colonna `data_source` direttamente dall'archivio. */
function fonteInArchivio(db: DbDiProva, isin: string): string | null | undefined {
  const riga = db.select().from(schema.securities).where(eq(schema.securities.isin, isin)).get();
  return riga?.data_source;
}

afterEach(() => {
  conn?.close();
  if (testDbPath && existsSync(testDbPath)) unlinkSync(testDbPath);
});

describe('US-018 — persistenza di securities.data_source', () => {
  it('inserimento da Borsa Italiana → data_source = borsaitaliana in archivio', async () => {
    const { fastify, db } = await buildApp();

    const res = await fastify.inject({ method: 'GET', url: `/api/securities/${ISIN}` });

    expect(res.statusCode).toBe(200);
    expect(res.json<SecurityLookupResponse>().dataSource).toBe('borsaitaliana');
    expect(fonteInArchivio(db, ISIN)).toBe('borsaitaliana');
  });

  it('inserimento dal backup MorningStar → data_source = morningstar in archivio', async () => {
    const { fastify, db } = await buildApp({
      result: { status: 'not-found' },
      fallbackResult: { status: 'found', security: DA_MORNINGSTAR },
    });

    const res = await fastify.inject({ method: 'GET', url: `/api/securities/${ISIN}` });

    expect(res.statusCode).toBe(200);
    expect(res.json<SecurityLookupResponse>().dataSource).toBe('morningstar');
    expect(fonteInArchivio(db, ISIN)).toBe('morningstar');
  });

  it('aggiornamento su riga esistente → data_source riflette il recupero più recente', async () => {
    // Primo recupero (lunedì): Borsa Italiana trova il titolo.
    const { fastify, db } = await buildApp({ now: new Date('2026-06-29T10:00:00+02:00') });
    await fastify.inject({ method: 'GET', url: `/api/securities/${ISIN}` });
    expect(fonteInArchivio(db, ISIN)).toBe('borsaitaliana');

    // Secondo recupero (mercoledì, sessione trascorsa): Borsa Italiana non lo
    // trova più e risponde il backup. L'anagrafica in archivio è ora quella di
    // MorningStar, e la provenienza deve seguirla.
    const { fastify: app2 } = await buildApp({
      db,
      result: { status: 'not-found' },
      fallbackResult: { status: 'found', security: DA_MORNINGSTAR },
      now: new Date('2026-07-01T10:00:00+02:00'),
    });
    const res = await app2.inject({ method: 'GET', url: `/api/securities/${ISIN}` });

    expect(res.statusCode).toBe(200);
    expect(res.json<SecurityLookupResponse>().dataSource).toBe('morningstar');
    expect(fonteInArchivio(db, ISIN)).toBe('morningstar');
  });

  it('risposta da cache → riporta la dataSource persistita senza contattare la fonte', async () => {
    // Primo recupero alle 10:00 (sessione aperta) dal backup MorningStar.
    const { fastify, db } = await buildApp({
      result: { status: 'not-found' },
      fallbackResult: { status: 'found', security: DA_MORNINGSTAR },
      now: new Date('2026-06-30T10:00:00+02:00'),
    });
    await fastify.inject({ method: 'GET', url: `/api/securities/${ISIN}` });

    // Seconda richiesta alle 11:00, stessa sessione: la guardia risponde dalla
    // cache. Prima di US-018 il campo era assente e il client concludeva
    // "Borsa Italiana" per un titolo trovato da MorningStar.
    const { fastify: app2, fetchSecurity, fetchSecurityFallback } = await buildApp({
      db,
      now: new Date('2026-06-30T11:00:00+02:00'),
    });
    const res = await app2.inject({ method: 'GET', url: `/api/securities/${ISIN}` });

    expect(res.statusCode).toBe(200);
    const body = res.json<SecurityLookupResponse>();
    expect(body.fromCache).toBe(true);
    expect(body.dataSource).toBe('morningstar');
    expect(fetchSecurity).not.toHaveBeenCalled();
    expect(fetchSecurityFallback).not.toHaveBeenCalled();
  });

  it('riga preesistente senza provenienza → resta null e non è dichiarata Borsa Italiana', async () => {
    const { db } = await buildApp();

    // Riga scritta come lo erano quelle anteriori alla colonna: nessuna fonte.
    db.insert(schema.securities)
      .values({
        isin: ISIN,
        name: 'iShares Core MSCI World UCITS ETF',
        price: 94.55,
        fetched_at: Math.floor(new Date('2026-06-30T09:00:00+02:00').getTime() / 1000),
      })
      .run();

    const { fastify, fetchSecurity } = await buildApp({
      db,
      now: new Date('2026-06-30T11:00:00+02:00'),
    });
    const res = await fastify.inject({ method: 'GET', url: `/api/securities/${ISIN}` });

    expect(res.statusCode).toBe(200);
    const body = res.json<SecurityLookupResponse>();
    expect(body.fromCache).toBe(true);
    // Assente, non 'borsaitaliana': l'archivio non sa da dove venga il dato.
    expect(body.dataSource).toBeUndefined();
    expect(fonteInArchivio(db, ISIN)).toBeNull();
    expect(fetchSecurity).not.toHaveBeenCalled();
  });
});
