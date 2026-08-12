/**
 * US-042 — le rotte delle vendite, e l'effetto delle vendite sulle tre viste
 * aggregate.
 *
 * Il criterio 2 — «nessun carico esistente viene modificato o cancellato» — è
 * l'unico di questa spec che un test può dimostrare solo **rileggendo**. Contare
 * i carichi non basta: una POST che alterasse `quantity` per «scalare» la vendita
 * lascerebbe il conteggio invariato, la quantità residua corretta e ogni altra
 * asserzione verde. I test di questo file rileggono quindi i carichi campo per
 * campo dopo ogni vendita, e confrontano l'intero oggetto con quello di prima.
 *
 * Il secondo guasto temuto è la **regressione silenziosa** delle tre viste. Da
 * US-042 riepilogo, riepilogo arricchito e dettaglio non aggregano più in SQL ma
 * nel dominio: un registro senza vendite deve continuare a produrre esattamente
 * le stesse cifre di prima, ed è ciò che i file `api.positions.summary`,
 * `api.positions.enriched` e `api.positions.detail` verificano restando
 * invariati. Qui si aggiunge il caso nuovo: le stesse tre viste **dopo** una
 * vendita.
 *
 * Il terzo è il **messaggio unico**. I criteri 4 e 5 chiedono due rifiuti
 * distinti, e la sola asserzione che li tiene distinti è confrontarli fra loro:
 * due `expect(...).toContain('non è possibile')` passerebbero anche su un
 * messaggio solo.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { existsSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import Fastify from 'fastify';
import * as schema from '../src/db/schema.js';
import type {
  EnrichedPositionSummary,
  Position,
  PositionDetail,
  PositionSummary,
  Sale,
} from '@portfolia/shared';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '..', 'src', 'db', 'migrations');

let testDbPath: string;
let conn: InstanceType<typeof Database>;
let testDb: ReturnType<typeof drizzle>;

vi.mock('../src/db/index.js', () => ({
  get db() {
    return testDb;
  },
  get conn() {
    return conn;
  },
}));

// Le rotte vanno importate DOPO il mock del db (hoisting gestito da vi.mock).
const { positionsRoutes } = await import('../src/api/positions.js');
const { salesRoutes } = await import('../src/api/sales.js');

async function buildApp() {
  testDbPath = join(tmpdir(), `test-api-sales-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  conn = new Database(testDbPath);
  testDb = drizzle(conn, { schema });
  migrate(testDb, { migrationsFolder: MIGRATIONS_DIR });

  const fastify = Fastify();

  fastify.post<{ Body: { name?: string } }>('/api/portfolios', async (req, reply) => {
    const { name } = req.body ?? {};
    if (!name || name.trim() === '') {
      return reply.status(400).send({ error: 'Il nome non può essere vuoto.' });
    }
    const result = testDb.insert(schema.portfolios).values({ name: name.trim() }).returning().get();
    return reply.status(201).send(result);
  });

  await fastify.register(positionsRoutes);
  await fastify.register(salesRoutes);

  await fastify.ready();
  return fastify;
}

afterEach(() => {
  if (conn) conn.close();
  if (testDbPath && existsSync(testDbPath)) unlinkSync(testDbPath);
});

type App = Awaited<ReturnType<typeof buildApp>>;

async function creaPortafoglio(app: App, name: string): Promise<number> {
  const res = await app.inject({ method: 'POST', url: '/api/portfolios', payload: { name } });
  return res.json<{ id: number }>().id;
}

async function carica(
  app: App,
  portfolioId: number,
  isin: string,
  loadDate: string,
  loadPrice: number,
  quantity: number,
): Promise<Position> {
  const res = await app.inject({
    method: 'POST',
    url: `/api/portfolios/${portfolioId}/positions`,
    payload: { isin, load_date: loadDate, load_price: loadPrice, quantity },
  });
  expect(res.statusCode).toBe(201);
  return res.json<Position>();
}

function vendi(app: App, portfolioId: number, payload: Record<string, unknown>) {
  return app.inject({ method: 'POST', url: `/api/portfolios/${portfolioId}/sales`, payload });
}

async function elencaCarichi(app: App, portfolioId: number): Promise<Position[]> {
  const res = await app.inject({ method: 'GET', url: `/api/portfolios/${portfolioId}/positions` });
  expect(res.statusCode).toBe(200);
  return res.json<Position[]>();
}

/** Semina il prezzo corrente nella cache anagrafica, come farebbe un rilevamento. */
function seminaPrezzo(isin: string, price: number, name = 'Titolo di prova'): void {
  testDb.insert(schema.securities).values({ isin, name, price }).run();
}

// ─── Lo scenario dei mockup di US-042 ───────────────────────────────────────
const ISIN = 'IE00BK5BQT80';
const CARICO_1 = { data: '2023-04-12', prezzo: 9.8, quantita: 600 };
const CARICO_2 = { data: '2025-02-07', prezzo: 11.5, quantita: 400 };

/** Il portafoglio dello scenario: i due carichi, 1.000 quote, medio € 10,4800. */
async function scenario(app: App, nome: string): Promise<{ portfolioId: number; carichi: Position[] }> {
  const portfolioId = await creaPortafoglio(app, nome);
  const primo = await carica(app, portfolioId, ISIN, CARICO_1.data, CARICO_1.prezzo, CARICO_1.quantita);
  const secondo = await carica(app, portfolioId, ISIN, CARICO_2.data, CARICO_2.prezzo, CARICO_2.quantita);
  return { portfolioId, carichi: [primo, secondo] };
}

describe('POST /api/portfolios/:id/sales — iscrizione', () => {
  it('registra la vendita e restituisce 201 con l\'iscrizione', async () => {
    const app = await buildApp();
    const { portfolioId } = await scenario(app, 'Vendita 201');

    const res = await vendi(app, portfolioId, {
      isin: ISIN,
      sale_date: '2026-06-03',
      sale_price: 12.5,
      quantity: 400,
    });

    expect(res.statusCode).toBe(201);
    const sale = res.json<Sale>();
    expect(sale).toMatchObject({
      portfolioId,
      isin: ISIN,
      saleDate: '2026-06-03',
      salePrice: 12.5,
      quantity: 400,
    });
    expect(sale.id).toBeGreaterThan(0);
    expect(sale.createdAt).toBeGreaterThan(0);
  });

  it('non modifica né cancella alcun carico', async () => {
    const app = await buildApp();
    const { portfolioId } = await scenario(app, 'Carichi intatti');
    const prima = await elencaCarichi(app, portfolioId);

    await vendi(app, portfolioId, { isin: ISIN, sale_date: '2026-06-03', sale_price: 12.5, quantity: 400 });

    // Il confronto è sull'intero oggetto e non sul conteggio: una POST che
    // «scalasse» la vendita dalla quantità del lotto lascerebbe due righe, la
    // quantità residua corretta e questo test l'unico a vederlo.
    expect(await elencaCarichi(app, portfolioId)).toEqual(prima);
  });

  it('non modifica alcun carico nemmeno quando la vendita azzera la posizione', async () => {
    const app = await buildApp();
    const { portfolioId } = await scenario(app, 'Carichi intatti a zero');
    const prima = await elencaCarichi(app, portfolioId);

    await vendi(app, portfolioId, { isin: ISIN, sale_date: '2026-06-03', sale_price: 12.5, quantity: 400 });
    await vendi(app, portfolioId, { isin: ISIN, sale_date: '2026-08-10', sale_price: 12.9, quantity: 600 });

    expect(await elencaCarichi(app, portfolioId)).toEqual(prima);
  });

  it('accetta una vendita datata il giorno stesso del carico', async () => {
    const app = await buildApp();
    const { portfolioId } = await scenario(app, 'Stesso giorno');

    // Comprato e rivenduto lo stesso giorno: operazione ordinaria, e un confronto
    // di date con `<` stretto la renderebbe impossibile da iscrivere.
    const res = await vendi(app, portfolioId, {
      isin: ISIN,
      sale_date: CARICO_2.data,
      sale_price: 11.9,
      quantity: 400,
    });
    expect(res.statusCode).toBe(201);
  });
});

describe('POST /api/portfolios/:id/sales — i due rifiuti', () => {
  it('rifiuta con 400 la quantità superiore alla disponibile, nominandola', async () => {
    const app = await buildApp();
    const { portfolioId } = await scenario(app, 'Quantità eccedente');

    const res = await vendi(app, portfolioId, {
      isin: ISIN,
      sale_date: '2026-08-10',
      sale_price: 12.9,
      quantity: 1200,
    });

    expect(res.statusCode).toBe(400);
    const { error } = res.json<{ error: string }>();
    expect(error).toContain('1200');
    expect(error).toContain('1000');
  });

  it('rifiuta con 400 la vendita anteriore al carico che dovrebbe consumare', async () => {
    const app = await buildApp();
    const { portfolioId } = await scenario(app, 'Vendita antedatata');

    // 800 quote su 1.000 caricate: la giacenza basterebbe, ma al 01.I.2024 il
    // secondo carico non era ancora avvenuto e ne risultano 600.
    const res = await vendi(app, portfolioId, {
      isin: ISIN,
      sale_date: '2024-01-01',
      sale_price: 10.5,
      quantity: 800,
    });

    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: string }>().error).toContain('600');
  });

  it('dà ai due rifiuti due messaggi diversi', async () => {
    const app = await buildApp();
    const { portfolioId } = await scenario(app, 'Due messaggi');

    const eccedente = await vendi(app, portfolioId, {
      isin: ISIN, sale_date: '2026-08-10', sale_price: 12.9, quantity: 1200,
    });
    const anteriore = await vendi(app, portfolioId, {
      isin: ISIN, sale_date: '2024-01-01', sale_price: 10.5, quantity: 800,
    });

    expect(eccedente.json<{ error: string }>().error).not.toBe(
      anteriore.json<{ error: string }>().error,
    );
  });

  it('non lascia alcuna iscrizione dopo un rifiuto', async () => {
    const app = await buildApp();
    const { portfolioId } = await scenario(app, 'Rifiuto senza traccia');

    await vendi(app, portfolioId, { isin: ISIN, sale_date: '2026-08-10', sale_price: 12.9, quantity: 1200 });
    await vendi(app, portfolioId, { isin: ISIN, sale_date: '2024-01-01', sale_price: 10.5, quantity: 800 });

    const res = await app.inject({ method: 'GET', url: `/api/portfolios/${portfolioId}/sales` });
    expect(res.json<Sale[]>()).toEqual([]);

    // E la quantità residua è ancora quella dei carichi: nessun effetto parziale.
    const summary = await app.inject({
      method: 'GET',
      url: `/api/portfolios/${portfolioId}/positions/summary`,
    });
    expect(summary.json<PositionSummary[]>()[0].totalQuantity).toBe(1000);
  });

  it('rifiuta la vendita di un titolo che non risulta caricato', async () => {
    const app = await buildApp();
    const portfolioId = await creaPortafoglio(app, 'Titolo non caricato');

    const res = await vendi(app, portfolioId, {
      isin: ISIN, sale_date: '2026-06-03', sale_price: 12.5, quantity: 1,
    });

    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: string }>().error).toContain('carico');
  });
});

describe('POST /api/portfolios/:id/sales — validazioni di forma', () => {
  it('risponde 404 su un portafoglio inesistente', async () => {
    const app = await buildApp();
    const res = await vendi(app, 999_999, {
      isin: ISIN, sale_date: '2026-06-03', sale_price: 12.5, quantity: 1,
    });
    expect(res.statusCode).toBe(404);
  });

  it('risponde 404 su un id di portafoglio non numerico', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/portfolios/abc/sales',
      payload: { isin: ISIN, sale_date: '2026-06-03', sale_price: 12.5, quantity: 1 },
    });
    expect(res.statusCode).toBe(404);
  });

  const invalidi: Array<{ nome: string; payload: Record<string, unknown>; atteso: string }> = [
    { nome: 'ISIN assente', payload: { sale_date: '2026-06-03', sale_price: 12.5, quantity: 1 }, atteso: 'ISIN' },
    { nome: 'ISIN non valido', payload: { isin: 'NONVALIDO123', sale_date: '2026-06-03', sale_price: 12.5, quantity: 1 }, atteso: 'ISIN' },
    { nome: 'data assente', payload: { isin: ISIN, sale_price: 12.5, quantity: 1 }, atteso: 'data' },
    { nome: 'data non ISO', payload: { isin: ISIN, sale_date: '03/06/2026', sale_price: 12.5, quantity: 1 }, atteso: 'data' },
    { nome: 'prezzo nullo', payload: { isin: ISIN, sale_date: '2026-06-03', sale_price: 0, quantity: 1 }, atteso: 'prezzo' },
    { nome: 'prezzo negativo', payload: { isin: ISIN, sale_date: '2026-06-03', sale_price: -1, quantity: 1 }, atteso: 'prezzo' },
    { nome: 'prezzo non numerico', payload: { isin: ISIN, sale_date: '2026-06-03', sale_price: '12,50', quantity: 1 }, atteso: 'prezzo' },
    { nome: 'quantità non intera', payload: { isin: ISIN, sale_date: '2026-06-03', sale_price: 12.5, quantity: 1.5 }, atteso: 'quantità' },
    { nome: 'quantità nulla', payload: { isin: ISIN, sale_date: '2026-06-03', sale_price: 12.5, quantity: 0 }, atteso: 'quantità' },
    { nome: 'quantità negativa', payload: { isin: ISIN, sale_date: '2026-06-03', sale_price: 12.5, quantity: -10 }, atteso: 'quantità' },
  ];

  it.each(invalidi)('risponde 400 con $nome', async ({ payload, atteso }) => {
    const app = await buildApp();
    const { portfolioId } = await scenario(app, `Forma ${atteso} ${Math.random()}`);

    const res = await vendi(app, portfolioId, payload);
    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: string }>().error.toLowerCase()).toContain(atteso.toLowerCase());
  });

  it('valida la forma prima di leggere il registro', async () => {
    const app = await buildApp();
    const { portfolioId } = await scenario(app, 'Ordine validazioni');

    // Data non valida **e** quantità impossibile: il messaggio deve parlare della
    // data. Spiegare che «al 03/06/2026 la quantità disponibile è 1000» darebbe
    // per buona una data che non è una data.
    const res = await vendi(app, portfolioId, {
      isin: ISIN, sale_date: '03/06/2026', sale_price: 12.5, quantity: 9999,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: string }>().error).toContain('data');
  });
});

describe('GET /api/portfolios/:id/sales', () => {
  it('elenca le vendite in ordine di data', async () => {
    const app = await buildApp();
    const { portfolioId } = await scenario(app, 'Elenco vendite');

    // Iscritte in ordine cronologico inverso: l'elenco deve riordinarle.
    await vendi(app, portfolioId, { isin: ISIN, sale_date: '2026-08-10', sale_price: 12.9, quantity: 600 });
    await vendi(app, portfolioId, { isin: ISIN, sale_date: '2026-06-03', sale_price: 12.5, quantity: 400 });

    const res = await app.inject({ method: 'GET', url: `/api/portfolios/${portfolioId}/sales` });
    expect(res.statusCode).toBe(200);
    expect(res.json<Sale[]>().map((v) => v.saleDate)).toEqual(['2026-06-03', '2026-08-10']);
  });

  it('risponde [] su un portafoglio senza vendite', async () => {
    const app = await buildApp();
    const { portfolioId } = await scenario(app, 'Nessuna vendita');
    const res = await app.inject({ method: 'GET', url: `/api/portfolios/${portfolioId}/sales` });
    expect(res.statusCode).toBe(200);
    expect(res.json<Sale[]>()).toEqual([]);
  });

  it('risponde 404 su un portafoglio inesistente', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/portfolios/999999/sales' });
    expect(res.statusCode).toBe(404);
  });
});

describe('Le tre viste aggregate dopo una vendita', () => {
  it('il riepilogo porta residuo, quantità lorde e medio ricalcolato', async () => {
    const app = await buildApp();
    const { portfolioId } = await scenario(app, 'Riepilogo dopo vendita');
    await vendi(app, portfolioId, { isin: ISIN, sale_date: '2026-06-03', sale_price: 12.5, quantity: 400 });

    const res = await app.inject({
      method: 'GET',
      url: `/api/portfolios/${portfolioId}/positions/summary`,
    });
    const [summary] = res.json<PositionSummary[]>();

    expect(summary.loadedQuantity).toBe(1000);
    expect(summary.soldQuantity).toBe(400);
    expect(summary.totalQuantity).toBe(600);
    // LIFO ha consumato il carico più recente: il medio **scende** a 9,8000.
    // Con FIFO sarebbe salito a 11,5000, e la quantità residua sarebbe la stessa.
    expect(summary.avgLoadPrice).toBeCloseTo(9.8, 10);
    expect(summary.totalLoadValue).toBeCloseTo(5880, 8);
  });

  it('il riepilogo dichiara assente il medio a residuo 0 e non lo scrive zero', async () => {
    const app = await buildApp();
    const { portfolioId } = await scenario(app, 'Riepilogo a residuo zero');
    await vendi(app, portfolioId, { isin: ISIN, sale_date: '2026-06-03', sale_price: 12.5, quantity: 400 });
    await vendi(app, portfolioId, { isin: ISIN, sale_date: '2026-08-10', sale_price: 12.9, quantity: 600 });

    const [summary] = (
      await app.inject({ method: 'GET', url: `/api/portfolios/${portfolioId}/positions/summary` })
    ).json<PositionSummary[]>();

    // Il titolo resta elencato con quantità 0: toglierlo è US-044, e una riga a
    // zero è un'informazione vera mentre una riga sparita non spiega nulla.
    expect(summary.totalQuantity).toBe(0);
    expect(summary.avgLoadPrice).toBeNull();
    // Lo zero del controvalore è invece **misurato**: zero quote costano zero.
    expect(summary.totalLoadValue).toBe(0);
    expect(summary.soldQuantity).toBe(1000);
  });

  it('il riepilogo arricchito misura il valore attuale sulle quote residue', async () => {
    const app = await buildApp();
    const { portfolioId } = await scenario(app, 'Arricchito dopo vendita');
    seminaPrezzo(ISIN, 12.5);
    await vendi(app, portfolioId, { isin: ISIN, sale_date: '2026-06-03', sale_price: 12.5, quantity: 400 });

    const [ep] = (
      await app.inject({ method: 'GET', url: `/api/portfolios/${portfolioId}/positions/enriched` })
    ).json<EnrichedPositionSummary[]>();

    expect(ep.totalQuantity).toBe(600);
    expect(ep.loadedQuantity).toBe(1000);
    expect(ep.soldQuantity).toBe(400);
    // 12,50 × 600 e non × 1.000: l'incasso della vendita è fuori dal portafoglio
    // (ADR-009), e contarlo qui gonfierebbe il valore attuale.
    expect(ep.currentValue).toBeCloseTo(12.5 * 600, 8);
    expect(ep.difference).toBeCloseTo(12.5 * 600 - 9.8 * 600, 8);
    expect(ep.avgLoadPrice).toBeCloseTo(9.8, 10);
  });

  it('il riepilogo arricchito porta a 0 il valore del titolo interamente venduto', async () => {
    const app = await buildApp();
    const { portfolioId } = await scenario(app, 'Arricchito a residuo zero');
    seminaPrezzo(ISIN, 12.5);
    await vendi(app, portfolioId, { isin: ISIN, sale_date: '2026-06-03', sale_price: 12.5, quantity: 1000 });

    const [ep] = (
      await app.inject({ method: 'GET', url: `/api/portfolios/${portfolioId}/positions/enriched` })
    ).json<EnrichedPositionSummary[]>();

    expect(ep.totalQuantity).toBe(0);
    expect(ep.currentValue).toBe(0);
    expect(ep.avgLoadPrice).toBeNull();
  });

  it('il dettaglio porta il residuo di ogni lotto accanto alla quantità nominale', async () => {
    const app = await buildApp();
    const { portfolioId, carichi } = await scenario(app, 'Dettaglio dopo vendita');
    await vendi(app, portfolioId, { isin: ISIN, sale_date: '2026-06-03', sale_price: 12.5, quantity: 400 });

    const detail = (
      await app.inject({
        method: 'GET',
        url: `/api/portfolios/${portfolioId}/positions/${ISIN}/detail`,
      })
    ).json<PositionDetail>();

    expect(detail.loadedQuantity).toBe(1000);
    expect(detail.soldQuantity).toBe(400);
    expect(detail.totalQuantity).toBe(600);
    expect(detail.avgLoadPrice).toBeCloseTo(9.8, 10);

    // I due lotti in ordine di carico: il primo intatto, il secondo esaurito. Le
    // quantità nominali sono ancora quelle iscritte.
    expect(detail.loads.map((l) => [l.id, l.quantity, l.residualQuantity])).toEqual([
      [carichi[0].id, 600, 600],
      [carichi[1].id, 400, 0],
    ]);
  });

  it('il dettaglio dichiara assente il medio a residuo 0', async () => {
    const app = await buildApp();
    const { portfolioId } = await scenario(app, 'Dettaglio a residuo zero');
    await vendi(app, portfolioId, { isin: ISIN, sale_date: '2026-06-03', sale_price: 12.5, quantity: 1000 });

    const detail = (
      await app.inject({
        method: 'GET',
        url: `/api/portfolios/${portfolioId}/positions/${ISIN}/detail`,
      })
    ).json<PositionDetail>();

    expect(detail.totalQuantity).toBe(0);
    expect(detail.avgLoadPrice).toBeNull();
    expect(detail.totalLoadValue).toBe(0);
    // I due carichi sono ancora tutti e due nel dettaglio: la vendita non li ha
    // cancellati, li ha solo esauriti.
    expect(detail.loads).toHaveLength(2);
    expect(detail.loads.every((l) => l.residualQuantity === 0)).toBe(true);
  });

  it('senza vendite le tre viste non portano alcun segno delle vendite', async () => {
    const app = await buildApp();
    const { portfolioId } = await scenario(app, 'Senza vendite');
    seminaPrezzo(ISIN, 12.5);

    const [summary] = (
      await app.inject({ method: 'GET', url: `/api/portfolios/${portfolioId}/positions/summary` })
    ).json<PositionSummary[]>();
    const [ep] = (
      await app.inject({ method: 'GET', url: `/api/portfolios/${portfolioId}/positions/enriched` })
    ).json<EnrichedPositionSummary[]>();
    const detail = (
      await app.inject({
        method: 'GET',
        url: `/api/portfolios/${portfolioId}/positions/${ISIN}/detail`,
      })
    ).json<PositionDetail>();

    // Il medio ponderato di prima di US-042: (9,80 × 600 + 11,50 × 400) / 1.000.
    const medioAtteso = (9.8 * 600 + 11.5 * 400) / 1000;
    for (const vista of [summary, ep, detail]) {
      expect(vista.totalQuantity).toBe(1000);
      expect(vista.loadedQuantity).toBe(1000);
      expect(vista.soldQuantity).toBe(0);
      expect(vista.avgLoadPrice).toBe(medioAtteso);
    }
    expect(detail.loads.every((l) => l.residualQuantity === l.quantity)).toBe(true);
  });

  it('tiene separati i registri di due ISIN dello stesso portafoglio', async () => {
    const app = await buildApp();
    const { portfolioId } = await scenario(app, 'Due ISIN');
    const ALTRO = 'IE00B4L5Y983';
    await carica(app, portfolioId, ALTRO, '2024-05-05', 50, 100);

    await vendi(app, portfolioId, { isin: ISIN, sale_date: '2026-06-03', sale_price: 12.5, quantity: 400 });

    const summaries = (
      await app.inject({ method: 'GET', url: `/api/portfolios/${portfolioId}/positions/summary` })
    ).json<PositionSummary[]>();

    // Ordinati per ISIN, come prima di US-042.
    expect(summaries.map((s) => s.isin)).toEqual([ALTRO, ISIN]);
    const altro = summaries.find((s) => s.isin === ALTRO);
    expect(altro).toMatchObject({ totalQuantity: 100, soldQuantity: 0 });
  });

  it('tiene separati i registri di due portafogli sullo stesso ISIN', async () => {
    const app = await buildApp();
    const primo = await scenario(app, 'Portafoglio A');
    const secondo = await scenario(app, 'Portafoglio B');

    await vendi(app, primo.portfolioId, { isin: ISIN, sale_date: '2026-06-03', sale_price: 12.5, quantity: 400 });

    const [sommaB] = (
      await app.inject({ method: 'GET', url: `/api/portfolios/${secondo.portfolioId}/positions/summary` })
    ).json<PositionSummary[]>();
    expect(sommaB.totalQuantity).toBe(1000);
    expect(sommaB.soldQuantity).toBe(0);
  });
});
