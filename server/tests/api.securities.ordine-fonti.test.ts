/**
 * US-030 — Ordine dei tentativi guidato dalla fonte registrata.
 *
 * Prima di questa spec l'ordine era fisso: Borsa Italiana e poi MorningStar,
 * sempre. Un titolo che solo il backup conosce pagava quindi il fallimento della
 * fonte primaria a ogni aggiornamento. Qui si verifica che l'ordine parta dalla
 * fonte già registrata per l'ISIN, che la `data_source` scritta sia quella della
 * fonte che ha *effettivamente* risposto, e che sul ramo d'errore l'archivio
 * resti intatto — nessun valore inventato al posto di quello che non è arrivato.
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

type DbDiProva = ReturnType<typeof drizzle<typeof schema>>;

let testDbPath: string;
let conn: InstanceType<typeof Database>;

const ISIN = 'IE00B4L5Y983';

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

const DA_MORNINGSTAR: SecurityInfo = { ...DA_BORSA_ITALIANA, price: 95.1, segment: null };

/** Lunedì e mercoledì: due sessioni di borsa distinte, quindi guardia inattiva. */
const LUNEDI = new Date('2026-06-29T10:00:00+02:00');
const MERCOLEDI = new Date('2026-07-01T10:00:00+02:00');

interface OpzioniApp {
  db?: DbDiProva;
  /** Esito dell'adapter Borsa Italiana (fonte primaria). */
  borsaItaliana?: AdapterResult;
  /** Esito dell'adapter MorningStar (fonte di backup). */
  morningStar?: AdapterResult;
  now?: Date;
}

/** Crea un db vuoto e migrato, riusabile fra due app della stessa prova. */
function nuovoDb(): DbDiProva {
  testDbPath = join(tmpdir(), `test-ordine-fonti-${Date.now()}-${Math.round(performance.now())}.db`);
  conn = new Database(testDbPath);
  const db = drizzle(conn, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  return db;
}

/**
 * App con adapter spiati: sono `vi.fn` distinti, così l'asserzione può parlare
 * dell'*ordine* dei tentativi e non solo del loro esito.
 */
async function buildApp(opts: OpzioniApp = {}) {
  const db = opts.db ?? nuovoDb();

  const ordineChiamate: string[] = [];
  const fetchSecurity = vi.fn(async () => {
    ordineChiamate.push('borsaitaliana');
    return opts.borsaItaliana ?? ({ status: 'found', security: DA_BORSA_ITALIANA } as AdapterResult);
  });
  const fetchSecurityFallback = vi.fn(async () => {
    ordineChiamate.push('morningstar');
    return opts.morningStar ?? ({ status: 'not-found' } as AdapterResult);
  });
  const now = opts.now ?? MERCOLEDI;

  const fastify = Fastify();
  await fastify.register(securitiesRoutes({ db, fetchSecurity, fetchSecurityFallback, now: () => now }));
  await fastify.ready();
  return { fastify, fetchSecurity, fetchSecurityFallback, ordineChiamate, db };
}

/** Semina una riga in archivio con fonte e istante di rilevazione espliciti. */
function seminaInArchivio(
  db: DbDiProva,
  campi: { price: number; dataSource: 'borsaitaliana' | 'morningstar' | null; rilevatoIl: Date },
): void {
  db.insert(schema.securities)
    .values({
      isin: ISIN,
      name: 'iShares Core MSCI World UCITS ETF',
      price: campi.price,
      data_source: campi.dataSource,
      fetched_at: Math.floor(campi.rilevatoIl.getTime() / 1000),
    })
    .run();
}

/** Riga di archivio, o `undefined` se l'ISIN non è in cache. */
function rigaInArchivio(db: DbDiProva) {
  return db.select().from(schema.securities).where(eq(schema.securities.isin, ISIN)).get();
}

afterEach(() => {
  conn?.close();
  if (testDbPath && existsSync(testDbPath)) unlinkSync(testDbPath);
});

describe('US-030 — ordine dei tentativi e invarianti d’archivio', () => {
  it('fonte registrata MorningStar → parte da MorningStar e non interroga Borsa Italiana', async () => {
    const db = nuovoDb();
    seminaInArchivio(db, { price: 90.0, dataSource: 'morningstar', rilevatoIl: LUNEDI });

    const { fastify, fetchSecurity, fetchSecurityFallback } = await buildApp({
      db,
      morningStar: { status: 'found', security: DA_MORNINGSTAR },
      now: MERCOLEDI,
    });

    const res = await fastify.inject({ method: 'GET', url: `/api/securities/${ISIN}` });

    expect(res.statusCode).toBe(200);
    expect(res.json<SecurityLookupResponse>().dataSource).toBe('morningstar');
    expect(fetchSecurityFallback).toHaveBeenCalledTimes(1);
    // La fonte primaria non viene contattata affatto: il titolo è già suo.
    expect(fetchSecurity).not.toHaveBeenCalled();
  });

  it('fonte registrata MorningStar che non trova più il titolo → ripiega su Borsa Italiana e riscrive la fonte', async () => {
    const db = nuovoDb();
    seminaInArchivio(db, { price: 90.0, dataSource: 'morningstar', rilevatoIl: LUNEDI });

    const { fastify, ordineChiamate, db: archivio } = await buildApp({
      db,
      morningStar: { status: 'not-found' },
      borsaItaliana: { status: 'found', security: DA_BORSA_ITALIANA },
      now: MERCOLEDI,
    });

    const res = await fastify.inject({ method: 'GET', url: `/api/securities/${ISIN}` });

    expect(res.statusCode).toBe(200);
    expect(ordineChiamate).toEqual(['morningstar', 'borsaitaliana']);
    // La fonte dichiarata è quella che ha risposto, non quella tentata per prima.
    expect(res.json<SecurityLookupResponse>().dataSource).toBe('borsaitaliana');
    expect(rigaInArchivio(archivio)?.data_source).toBe('borsaitaliana');
    expect(rigaInArchivio(archivio)?.price).toBe(94.55);
  });

  it('fonte non registrata in archivio → ordine predefinito Borsa Italiana poi MorningStar', async () => {
    const db = nuovoDb();
    // Riga anteriore alla colonna `data_source`: la provenienza è ignota.
    seminaInArchivio(db, { price: 90.0, dataSource: null, rilevatoIl: LUNEDI });

    const { fastify, ordineChiamate } = await buildApp({
      db,
      borsaItaliana: { status: 'not-found' },
      morningStar: { status: 'found', security: DA_MORNINGSTAR },
      now: MERCOLEDI,
    });

    const res = await fastify.inject({ method: 'GET', url: `/api/securities/${ISIN}` });

    expect(res.statusCode).toBe(200);
    expect(ordineChiamate).toEqual(['borsaitaliana', 'morningstar']);
    expect(res.json<SecurityLookupResponse>().dataSource).toBe('morningstar');
  });

  it('ISIN mai recuperato (cache miss) → ordine predefinito Borsa Italiana poi MorningStar', async () => {
    const { fastify, ordineChiamate } = await buildApp({
      borsaItaliana: { status: 'not-found' },
      morningStar: { status: 'found', security: DA_MORNINGSTAR },
    });

    const res = await fastify.inject({ method: 'GET', url: `/api/securities/${ISIN}` });

    expect(res.statusCode).toBe(200);
    expect(ordineChiamate).toEqual(['borsaitaliana', 'morningstar']);
  });

  it('nessuna fonte risponde → 502 e la riga in archivio resta identica', async () => {
    const db = nuovoDb();
    const rilevatoIl = LUNEDI;
    seminaInArchivio(db, { price: 90.0, dataSource: 'borsaitaliana', rilevatoIl });

    const { fastify, db: archivio } = await buildApp({
      db,
      borsaItaliana: { status: 'error', reason: 'timeout' },
      morningStar: { status: 'error', reason: 'challenge anti-bot' },
      now: MERCOLEDI,
    });

    const res = await fastify.inject({ method: 'GET', url: `/api/securities/${ISIN}` });

    expect(res.statusCode).toBe(502);
    const riga = rigaInArchivio(archivio);
    expect(riga?.price).toBe(90.0);
    expect(riga?.data_source).toBe('borsaitaliana');
    expect(riga?.fetched_at).toBe(Math.floor(rilevatoIl.getTime() / 1000));
  });

  it('guardia di buona cittadinanza attiva → nessuna fonte viene contattata', async () => {
    const db = nuovoDb();
    seminaInArchivio(db, {
      price: 90.0,
      dataSource: 'morningstar',
      rilevatoIl: new Date('2026-07-01T09:30:00+02:00'),
    });

    const { fastify, fetchSecurity, fetchSecurityFallback } = await buildApp({
      db,
      now: new Date('2026-07-01T10:00:00+02:00'), // stessa sessione di mercato
    });

    const res = await fastify.inject({ method: 'GET', url: `/api/securities/${ISIN}` });

    expect(res.statusCode).toBe(200);
    const body = res.json<SecurityLookupResponse>();
    expect(body.confirmation).toBeDefined();
    expect(body.dataSource).toBe('morningstar');
    expect(fetchSecurity).not.toHaveBeenCalled();
    expect(fetchSecurityFallback).not.toHaveBeenCalled();
  });

  it('?force=true → la fonte è interrogata e l’istante avanza, così la richiesta successiva torna a chiedere conferma', async () => {
    const db = nuovoDb();
    const rilevazioneVecchia = new Date('2026-07-01T09:30:00+02:00');
    seminaInArchivio(db, { price: 90.0, dataSource: 'morningstar', rilevatoIl: rilevazioneVecchia });

    const adesso = new Date('2026-07-01T10:00:00+02:00');
    const { fastify, fetchSecurityFallback, db: archivio } = await buildApp({
      db,
      morningStar: { status: 'found', security: DA_MORNINGSTAR },
      now: adesso,
    });

    const forzata = await fastify.inject({ method: 'GET', url: `/api/securities/${ISIN}?force=true` });

    expect(forzata.statusCode).toBe(200);
    expect(forzata.json<SecurityLookupResponse>().confirmation).toBeUndefined();
    expect(fetchSecurityFallback).toHaveBeenCalledTimes(1);
    expect(rigaInArchivio(archivio)?.fetched_at).toBe(Math.floor(adesso.getTime() / 1000));

    // Subito dopo, senza `force`: la guardia legge l'istante appena scritto e
    // richiede di nuovo conferma. È l'invariante condivisa con la Ricerca titoli.
    const { fastify: app2, fetchSecurityFallback: spia2 } = await buildApp({
      db: archivio,
      now: new Date('2026-07-01T10:05:00+02:00'),
    });
    const successiva = await app2.inject({ method: 'GET', url: `/api/securities/${ISIN}` });

    const body = successiva.json<SecurityLookupResponse>();
    expect(body.confirmation).toBeDefined();
    expect(body.confirmation?.lastFetchedAt).toBe(Math.floor(adesso.getTime() / 1000));
    expect(spia2).not.toHaveBeenCalled();
  });
});
