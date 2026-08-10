/**
 * US-009 — quali rami di `GET /api/securities/:isin` registrano un'osservazione.
 *
 * È il criterio più facile da rompere per distrazione: lo storico deve crescere
 * *solo* dove una fonte ha effettivamente risposto. Registrare anche sul ramo
 * della guardia — quello che risponde dalla cache con `confirmation` — vorrebbe
 * dire iscrivere nello storico un prezzo che nessuno ha appena rilevato, e
 * moltiplicare le righe a ogni visita di scheda. Registrare sul 404 o sul 502
 * vorrebbe dire iscriverne uno che non esiste.
 *
 * Nessuna rete: gli adapter sono finti e l'orologio è iniettato, che è anche il
 * modo per provare la separazione fra due giorni civili distinti senza attendere
 * la mezzanotte.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { existsSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { asc, eq } from 'drizzle-orm';
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

const DA_MORNINGSTAR: SecurityInfo = { ...DA_BORSA_ITALIANA, price: 95.1, segment: null };

/** Un db di prova nuovo, migrato: lo storico parte vuoto. */
function nuovoDb(): DbDiProva {
  testDbPath = join(tmpdir(), `test-securities-storico-${Date.now()}-${Math.round(performance.now())}.db`);
  conn = new Database(testDbPath);
  const db = drizzle(conn, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  return db;
}

interface OpzioniApp {
  db: DbDiProva;
  result?: AdapterResult;
  fallbackResult?: AdapterResult;
  now?: Date;
}

async function buildApp(opts: OpzioniApp) {
  const fetchSecurity = vi.fn(
    async () => opts.result ?? ({ status: 'found', security: DA_BORSA_ITALIANA } as AdapterResult),
  );
  const fetchSecurityFallback = vi.fn(
    async () => opts.fallbackResult ?? ({ status: 'not-found' } as AdapterResult),
  );
  const now = opts.now ?? new Date('2026-06-30T10:00:00+02:00');

  const fastify = Fastify();
  await fastify.register(
    securitiesRoutes({ db: opts.db, fetchSecurity, fetchSecurityFallback, now: () => now }),
  );
  await fastify.ready();
  return { fastify, fetchSecurity, fetchSecurityFallback };
}

/** Le osservazioni registrate per l'ISIN di prova, in ordine di registrazione. */
function osservazioni(db: DbDiProva) {
  return db
    .select()
    .from(schema.priceObservations)
    .where(eq(schema.priceObservations.isin, ISIN))
    .orderBy(asc(schema.priceObservations.id))
    .all();
}

afterEach(() => {
  conn?.close();
  if (testDbPath && existsSync(testDbPath)) unlinkSync(testDbPath);
});

describe('US-009 — registrazione lungo GET /api/securities/:isin', () => {
  it('recupero fresco → una osservazione con prezzo, istante e fonte del recupero', async () => {
    const db = nuovoDb();
    const adesso = new Date('2026-06-30T10:00:00+02:00');
    const { fastify } = await buildApp({ db, now: adesso });

    const res = await fastify.inject({ method: 'GET', url: `/api/securities/${ISIN}` });
    expect(res.statusCode).toBe(200);

    const righe = osservazioni(db);
    expect(righe).toHaveLength(1);
    expect(righe[0].price).toBeCloseTo(94.55, 4);
    expect(righe[0].observed_at).toBe(Math.floor(adesso.getTime() / 1000));
    expect(righe[0].observed_day).toBe('2026-06-30');
    expect(righe[0].data_source).toBe('borsaitaliana');
  });

  it('recupero servito dalla fonte di backup → l’osservazione porta «morningstar»', async () => {
    const db = nuovoDb();
    const { fastify } = await buildApp({
      db,
      result: { status: 'not-found' },
      fallbackResult: { status: 'found', security: DA_MORNINGSTAR },
    });

    const res = await fastify.inject({ method: 'GET', url: `/api/securities/${ISIN}` });
    expect(res.statusCode).toBe(200);

    const righe = osservazioni(db);
    expect(righe).toHaveLength(1);
    expect(righe[0].price).toBeCloseTo(95.1, 4);
    expect(righe[0].data_source).toBe('morningstar');
  });

  it('la guardia risponde dalla cache con confirmation → nessuna osservazione in più', async () => {
    const db = nuovoDb();
    const adesso = new Date('2026-06-30T10:00:00+02:00');

    // Primo recupero: registra la sua osservazione.
    const primo = await buildApp({ db, now: adesso });
    await primo.fastify.inject({ method: 'GET', url: `/api/securities/${ISIN}` });
    expect(osservazioni(db)).toHaveLength(1);

    // Seconda richiesta pochi minuti dopo, nella stessa sessione: la guardia
    // risponde dalla cache. Nessuna fonte è stata contattata, quindi non c'è
    // alcuna rilevazione da registrare.
    const secondo = await buildApp({ db, now: new Date('2026-06-30T10:20:00+02:00') });
    const res = await secondo.fastify.inject({ method: 'GET', url: `/api/securities/${ISIN}` });

    expect(res.statusCode).toBe(200);
    expect(res.json<SecurityLookupResponse>().confirmation).toBeDefined();
    expect(secondo.fetchSecurity).not.toHaveBeenCalled();
    expect(osservazioni(db)).toHaveLength(1);
  });

  it('404 da entrambe le fonti → nessuna osservazione', async () => {
    const db = nuovoDb();
    const { fastify } = await buildApp({
      db,
      result: { status: 'not-found' },
      fallbackResult: { status: 'not-found' },
    });

    const res = await fastify.inject({ method: 'GET', url: `/api/securities/${ISIN}` });

    expect(res.statusCode).toBe(404);
    expect(osservazioni(db)).toHaveLength(0);
  });

  it('502 con nessuna fonte che risponde → nessuna osservazione', async () => {
    const db = nuovoDb();
    const { fastify } = await buildApp({
      db,
      result: { status: 'error', reason: 'timeout' },
      fallbackResult: { status: 'error', reason: 'challenge non superato' },
    });

    const res = await fastify.inject({ method: 'GET', url: `/api/securities/${ISIN}` });

    expect(res.statusCode).toBe(502);
    expect(osservazioni(db)).toHaveLength(0);
  });

  it('recupero riuscito con prezzo non disponibile alla fonte → nessuna osservazione', async () => {
    const db = nuovoDb();
    const { fastify } = await buildApp({
      db,
      result: { status: 'found', security: { ...DA_BORSA_ITALIANA, price: null } },
    });

    const res = await fastify.inject({ method: 'GET', url: `/api/securities/${ISIN}` });

    // L'anagrafica entra in archivio, ma senza prezzo non c'è quotazione da
    // iscrivere: lo storico non deve mostrare una riga inventata.
    expect(res.statusCode).toBe(200);
    expect(osservazioni(db)).toHaveLength(0);
  });

  it('due recuperi in giorni civili distinti → due osservazioni, anche a prezzo invariato', async () => {
    const db = nuovoDb();

    const primo = await buildApp({ db, now: new Date('2026-06-30T10:00:00+02:00') });
    await primo.fastify.inject({ method: 'GET', url: `/api/securities/${ISIN}` });

    // Il giorno dopo, a mercato aperto: la guardia lascia passare (una sessione
    // si è conclusa) e il recupero avviene davvero.
    const secondo = await buildApp({ db, now: new Date('2026-07-01T10:00:00+02:00') });
    const res = await secondo.fastify.inject({ method: 'GET', url: `/api/securities/${ISIN}` });

    expect(res.statusCode).toBe(200);
    expect(res.json<SecurityLookupResponse>().confirmation).toBeUndefined();
    expect(secondo.fetchSecurity).toHaveBeenCalledTimes(1);

    const righe = osservazioni(db);
    expect(righe).toHaveLength(2);
    expect(righe.map((r) => r.observed_day)).toEqual(['2026-06-30', '2026-07-01']);
    expect(righe.map((r) => r.price)).toEqual([94.55, 94.55]);
  });

  it('due recuperi forzati nello stesso giorno allo stesso prezzo → una sola osservazione', async () => {
    const db = nuovoDb();

    const primo = await buildApp({ db, now: new Date('2026-06-30T10:00:00+02:00') });
    await primo.fastify.inject({ method: 'GET', url: `/api/securities/${ISIN}` });

    // `?force=true` scavalca la guardia e contatta davvero la fonte: la fonte
    // risponde con lo stesso prezzo, quindi non c'è alcuna variazione da
    // registrare. È il caso in cui la deduplica evita che lo storico si gonfi di
    // righe identiche a ogni «Aggiorna dati».
    const secondo = await buildApp({ db, now: new Date('2026-06-30T10:20:00+02:00') });
    const res = await secondo.fastify.inject({ method: 'GET', url: `/api/securities/${ISIN}?force=true` });

    expect(res.statusCode).toBe(200);
    expect(secondo.fetchSecurity).toHaveBeenCalledTimes(1);
    expect(osservazioni(db)).toHaveLength(1);
  });

  it('due recuperi forzati nello stesso giorno a prezzi diversi → due osservazioni', async () => {
    const db = nuovoDb();

    const primo = await buildApp({ db, now: new Date('2026-06-30T10:00:00+02:00') });
    await primo.fastify.inject({ method: 'GET', url: `/api/securities/${ISIN}` });

    const secondo = await buildApp({
      db,
      now: new Date('2026-06-30T16:02:00+02:00'),
      result: { status: 'found', security: { ...DA_BORSA_ITALIANA, price: 95.4 } },
    });
    await secondo.fastify.inject({ method: 'GET', url: `/api/securities/${ISIN}?force=true` });

    const righe = osservazioni(db);
    expect(righe).toHaveLength(2);
    expect(righe.map((r) => r.price)).toEqual([94.55, 95.4]);
    expect(righe.map((r) => r.observed_day)).toEqual(['2026-06-30', '2026-06-30']);
  });
});
