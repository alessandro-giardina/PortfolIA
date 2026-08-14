/**
 * US-019 (TASK-04) — l'aggregazione del valore del portafoglio nel tempo.
 *
 * Il rischio principale è lo stesso dei moduli fratelli (`serieTitolo.ts`,
 * `serieValore.ts`): un guasto *silenzioso*. Qui però il guasto ha due forme
 * specifiche a questo modulo:
 *
 * - **i due zeri che si confondono.** «Zero titoli detenuti» (`0`, misurato) e
 *   «titoli detenuti ma nessuno valorizzato» (`null`, non affermabile) si
 *   assomigliano a schermo — un test che li collassasse nello stesso caso non
 *   lo noterebbe;
 * - **il riporto in ore invece che in giorni civili.** Una rilevazione alle
 *   23:00 di un giorno e un punto a mezzanotte del giorno dopo sono separati da
 *   25 ore ma da *due* giorni civili: un calcolo sulla differenza in ore
 *   arrotondata sbaglierebbe l'età di un giorno esatto, ed è proprio la cifra
 *   che la scheda scrive accanto al timbro «riportata».
 *
 * Nessun accesso a rete o archivio, nessun orologio reale: le funzioni sono
 * pure e ogni istante arriva come argomento.
 */
import { describe, it, expect } from 'vitest';
import {
  SCALE_TEMPORALI,
  calcolaFinestra,
  componiSerieValorePortafoglio,
  coperturaPerimetroFinestra,
  dateEventoPortafoglio,
  prezzoNotoA,
  ritagliaSerie,
  type PuntoPortafoglio,
  type ScalaTemporale,
  type TitoloPortafoglio,
  type CaricoValore,
  type VenditaFlusso,
  type RilevazioneSerie,
} from '@portfolia/shared';

/** Un carico, ridotto ai tre campi che questo modulo (tramite `serieValore.ts`) legge. */
const carico = (loadDate: string, quantity: number, loadPrice = 0): CaricoValore => ({
  loadDate,
  loadPrice,
  quantity,
});

/** Una vendita. `salePrice` di default a 0: questi test non lo osservano. */
const vendita = (saleDate: string, quantity: number, salePrice = 0): VenditaFlusso => ({
  saleDate,
  quantity,
  salePrice,
});

/**
 * Una rilevazione. `observedAt` è in unix **secondi**, come in archivio e come
 * `componiSerieTitolo` la consuma altrove: la conversione a millisecondi è
 * interna a `prezzoNotoA`.
 */
const rilevazione = (istanteIso: string, price: number): RilevazioneSerie => ({
  price,
  observedAt: Date.parse(istanteIso) / 1000,
});

/** Un titolo del perimetro, con valori di default per i campi non rilevanti al test. */
function titolo(input: Partial<TitoloPortafoglio> & { isin: string }): TitoloPortafoglio {
  return { name: null, loads: [], sales: [], priceHistory: [], ...input };
}

describe('dateEventoPortafoglio', () => {
  it('un punto per ogni evento (carico, vendita, rilevazione) di qualunque titolo, nessun punto in più', () => {
    const titoli: TitoloPortafoglio[] = [
      titolo({
        isin: 'A',
        loads: [carico('2026-01-01', 10)],
        sales: [vendita('2026-06-01', 10)],
        priceHistory: [rilevazione('2026-03-01T10:00:00Z', 12)],
      }),
      titolo({
        isin: 'B',
        loads: [carico('2026-02-01', 5)],
        priceHistory: [rilevazione('2026-04-01T09:00:00Z', 20)],
      }),
    ];

    const attese = [
      Date.UTC(2026, 0, 1), // carico A
      Date.UTC(2026, 1, 1), // carico B
      Date.parse('2026-03-01T10:00:00Z'), // rilevazione A
      Date.parse('2026-04-01T09:00:00Z'), // rilevazione B
      Date.UTC(2026, 5, 1), // vendita A
    ];

    expect(dateEventoPortafoglio(titoli)).toEqual(attese);
    // Nessun punto in più: la composizione del punto genera esattamente un
    // punto per ciascuna di queste date, non uno per titolo per data.
    expect(componiSerieValorePortafoglio(titoli).punti.map((p) => p.at)).toEqual(attese);
  });

  it('senza titoli o senza eventi, l’elenco è vuoto — non un errore', () => {
    expect(dateEventoPortafoglio([])).toEqual([]);
    expect(dateEventoPortafoglio([titolo({ isin: 'A' })])).toEqual([]);
    expect(componiSerieValorePortafoglio([titolo({ isin: 'A' })]).punti).toEqual([]);
  });

  it('eventi di titoli diversi allo stesso istante deduplicano in un solo punto', () => {
    // Due carichi con la stessa `loadDate` si ancorano alla stessa mezzanotte
    // UTC: è lo stesso istante, non due istanti vicini.
    const titoli: TitoloPortafoglio[] = [
      titolo({ isin: 'A', loads: [carico('2026-01-01', 10)] }),
      titolo({ isin: 'B', loads: [carico('2026-01-01', 5)] }),
    ];

    const eventi = dateEventoPortafoglio(titoli);

    expect(eventi).toEqual([Date.UTC(2026, 0, 1)]);
    expect(componiSerieValorePortafoglio(titoli).punti).toHaveLength(1);
  });

  it('una rilevazione allo stesso istante esatto di un carico di un altro titolo resta un solo punto', () => {
    const istante = Date.UTC(2026, 4, 12); // mezzanotte UTC
    const titoli: TitoloPortafoglio[] = [
      titolo({ isin: 'A', loads: [carico('2026-05-12', 10)] }),
      titolo({ isin: 'B', priceHistory: [{ price: 15, observedAt: istante / 1000 }] }),
    ];

    expect(dateEventoPortafoglio(titoli)).toEqual([istante]);
  });
});

describe('prezzoNotoA — riporto in avanti e sua età in giorni civili', () => {
  it('una rilevazione anteriore alla data del punto dà stato «riportato» con l’età giusta', () => {
    const t = titolo({
      isin: 'A',
      priceHistory: [rilevazione('2026-05-12T00:00:00Z', 96.2)],
    });

    const esito = prezzoNotoA(t, Date.UTC(2026, 5, 3)); // 3 giugno 2026

    expect(esito).toEqual({
      stato: 'riportato',
      prezzo: 96.2,
      osservatoA: Date.parse('2026-05-12T00:00:00Z'),
      etaGiorni: 22,
    });
  });

  it('una rilevazione registrata quella data stessa dà stato «del-giorno» con età zero', () => {
    const t = titolo({ isin: 'A', priceHistory: [rilevazione('2026-06-03T14:00:00Z', 74.5)] });

    // Il punto cade esattamente sull'istante della rilevazione: è così che
    // nasce un punto d'evento reale (`evento.at = rilevazione.observedAt * 1000`).
    const esito = prezzoNotoA(t, Date.parse('2026-06-03T14:00:00Z'));

    expect(esito).toEqual({
      stato: 'del-giorno',
      prezzo: 74.5,
      osservatoA: Date.parse('2026-06-03T14:00:00Z'),
      etaGiorni: 0,
    });
  });

  it('senza alcuna rilevazione non successiva alla data, lo stato è «nessuno»', () => {
    const t = titolo({ isin: 'A', priceHistory: [rilevazione('2026-07-01T00:00:00Z', 10)] });

    // La sola rilevazione esistente è *dopo* la data chiesta.
    expect(prezzoNotoA(t, Date.UTC(2026, 5, 1))).toEqual({
      stato: 'nessuno',
      prezzo: null,
      osservatoA: null,
      etaGiorni: null,
    });
  });

  it('l’età è in giorni civili, non in ore: 25 ore possono valere due giorni civili', () => {
    // La rilevazione è alle 23:00 del 10 gennaio; il punto cade a mezzanotte
    // UTC del 12 gennaio (un carico, ancorato con `istanteDataCivile`). La
    // differenza reale è 25 ore (1,04 giorni): un calcolo che arrotondasse le
    // ore darebbe 1, ma i giorni civili separati sono due (10 → 11 → 12).
    const t = titolo({ isin: 'A', priceHistory: [rilevazione('2026-01-10T23:00:00Z', 50)] });

    const esito = prezzoNotoA(t, Date.UTC(2026, 0, 12));

    expect(esito.stato).toBe('riportato');
    expect(esito.etaGiorni).toBe(2);
  });

  it('la stessa rilevazione, letta un’ora dopo la mezzanotte del giorno seguente, resta a un solo giorno civile', () => {
    // Confronto simmetrico al test precedente: qui la distanza reale è appena
    // un'ora (23:00 → 00:00 del giorno dopo) ma il giorno civile è già
    // cambiato — un solo giorno di differenza, non zero.
    const t = titolo({ isin: 'A', priceHistory: [rilevazione('2026-01-10T23:00:00Z', 50)] });

    const esito = prezzoNotoA(t, Date.UTC(2026, 0, 11));

    expect(esito.etaGiorni).toBe(1);
  });

  it('con `at` non finito lo stato è «nessuno», non un confronto silenzioso su NaN', () => {
    const t = titolo({ isin: 'A', priceHistory: [rilevazione('2026-01-01T00:00:00Z', 10)] });

    expect(prezzoNotoA(t, Number.NaN)).toEqual({
      stato: 'nessuno',
      prezzo: null,
      osservatoA: null,
      etaGiorni: null,
    });
  });
});

/**
 * Lo scenario di riferimento del mockup (`docs/mockups/US-019/README.md`):
 * due titoli con rilevazioni deliberatamente disallineate, la condizione
 * normale con lo storico rado di ADR-008. Il punto del 3 giugno 2026 è quello
 * che la spec chiede di dimostrare: € 16.636,00, «1 di 2 titoli su prezzo
 * riportato, 22 giorni».
 */
describe('scenario a rilevazioni disallineate (mockup US-019)', () => {
  const world = titolo({
    isin: 'IE00B4L5Y983',
    name: 'Ishares Core MSCI World',
    loads: [carico('2025-09-19', 80, 58.4)],
    priceHistory: [rilevazione('2026-05-12T00:00:00Z', 96.2), rilevazione('2026-08-10T00:00:00Z', 128.46)],
  });
  const allWorld = titolo({
    isin: 'IE00BK5BQT80',
    name: 'Vanguard FTSE All-World',
    loads: [carico('2026-03-04', 120, 71.2)],
    priceHistory: [rilevazione('2026-06-03T00:00:00Z', 74.5)],
  });

  const serie = componiSerieValorePortafoglio([world, allWorld]);

  it('cinque date d’evento, cinque punti', () => {
    expect(serie.punti).toHaveLength(5);
  });

  it('il punto del 3 giugno 2026 vale esattamente € 16.636,00, con 1 titolo su prezzo del giorno e 1 riportato', () => {
    const punto = serie.punti.find((p) => p.at === Date.UTC(2026, 5, 3));
    if (!punto) throw new Error('punto del 3 giugno non trovato');

    expect(punto.valoreTotale).toBeCloseTo(16636.0, 6);
    expect(punto.suPrezzoDelGiorno).toBe(1);
    expect(punto.suPrezzoRiportato).toBe(1);
    expect(punto.nonValorizzati).toBe(0);
    expect(punto.copertura).toBe('piena');

    const contributoRiportato = punto.contributi.find((c) => c.isin === 'IE00B4L5Y983');
    if (!contributoRiportato) throw new Error('contributo riportato non trovato');

    expect(contributoRiportato.prezzo.stato).toBe('riportato');
    expect(contributoRiportato.prezzo.etaGiorni).toBe(22);
    expect(contributoRiportato.quantita).toBe(80);
    expect(contributoRiportato.valore).toBeCloseTo(7696.0, 6);

    const contributoDelGiorno = punto.contributi.find((c) => c.isin === 'IE00BK5BQT80');
    if (!contributoDelGiorno) throw new Error('contributo del giorno non trovato');

    expect(contributoDelGiorno.prezzo.stato).toBe('del-giorno');
    expect(contributoDelGiorno.valore).toBeCloseTo(8940.0, 6);
  });

  it('i due carichi (19 settembre 2025, 4 marzo 2026) restano a copertura parziale: nessuna rilevazione ancora', () => {
    const primoCarico = serie.punti.find((p) => p.at === Date.UTC(2025, 8, 19));
    const secondoCarico = serie.punti.find((p) => p.at === Date.UTC(2026, 2, 4));
    if (!primoCarico || !secondoCarico) throw new Error('carichi non trovati');

    expect(primoCarico.valoreTotale).toBeNull();
    expect(primoCarico.copertura).toBe('parziale');
    expect(secondoCarico.valoreTotale).toBeNull();
    expect(secondoCarico.copertura).toBe('parziale');
  });

  it('il 12 maggio 2026, a copertura parziale, la somma parziale è quella di un solo titolo valorizzato', () => {
    const punto = serie.punti.find((p) => p.at === Date.UTC(2026, 4, 12));
    if (!punto) throw new Error('punto non trovato');

    expect(punto.copertura).toBe('parziale');
    expect(punto.nonValorizzati).toBe(1); // Vanguard non ancora rilevato
    // Somma parziale del solo Ishares, valorizzato del giorno (96,20 × 80).
    expect(punto.valoreTotale).toBeCloseTo(7696.0, 6);
  });

  it('il 10 agosto 2026 il totale sale a € 19.216,80, entrambi rilevati', () => {
    const punto = serie.punti.find((p) => p.at === Date.UTC(2026, 7, 10));
    if (!punto) throw new Error('punto non trovato');

    expect(punto.valoreTotale).toBeCloseTo(19216.8, 6);
    expect(punto.nonValorizzati).toBe(0);
  });

  it('la prima copertura piena è la data del 3 giugno 2026', () => {
    expect(serie.primaCoperturaPiena).toBe(Date.UTC(2026, 5, 3));
  });
});

describe('titoli che entrano ed escono dal perimetro', () => {
  // Titolo A: carico a metà finestra — non detenuto prima del proprio carico.
  const A = titolo({
    isin: 'A',
    loads: [carico('2026-02-01', 10)],
    priceHistory: [rilevazione('2026-02-05T00:00:00Z', 10)],
  });
  // Titolo B: carico presto, vendita totale successiva — non più detenuto dopo.
  const B = titolo({
    isin: 'B',
    loads: [carico('2026-01-01', 5)],
    sales: [vendita('2026-03-01', 5)],
    priceHistory: [rilevazione('2026-01-02T00:00:00Z', 20)],
  });

  const serie = componiSerieValorePortafoglio([A, B]);

  it('prima del carico di A, solo B è nel perimetro', () => {
    const punto = serie.punti.find((p) => p.at === Date.UTC(2026, 0, 1));
    if (!punto) throw new Error('punto non trovato');

    expect(punto.contributi.map((c) => c.isin)).toEqual(['B']);
    expect(punto.contributi[0].quantita).toBe(5);
  });

  it('dopo il carico di A, entrambi sono nel perimetro', () => {
    const punto = serie.punti.find((p) => p.at === Date.UTC(2026, 1, 1));
    if (!punto) throw new Error('punto non trovato');

    expect(punto.contributi.map((c) => c.isin).sort()).toEqual(['A', 'B']);
  });

  it('dopo la vendita totale di B, solo A resta nel perimetro', () => {
    const punto = serie.punti.find((p) => p.at === Date.UTC(2026, 2, 1));
    if (!punto) throw new Error('punto non trovato');

    expect(punto.contributi.map((c) => c.isin)).toEqual(['A']);
    // La quantità detenuta di A resta corretta anche dopo l'uscita di B.
    expect(punto.contributi[0].quantita).toBe(10);
  });

  it('ogni contributo elencato ha sempre quantità positiva: un titolo non detenuto non compare mai', () => {
    for (const punto of serie.punti) {
      for (const contributo of punto.contributi) {
        expect(contributo.quantita).toBeGreaterThan(0);
      }
    }
  });
});

describe('copertura piena/parziale e `primaCoperturaPiena`', () => {
  it('la copertura passa da parziale a piena quando l’ultimo titolo senza prezzo viene rilevato', () => {
    // X è detenuto dal 1º gennaio ma rilevato solo il 1º marzo; Y è detenuto e
    // rilevato lo stesso giorno (1º gennaio). Il 1º gennaio la copertura è
    // parziale (X non ha ancora prezzo); il 1º marzo diventa piena.
    const X = titolo({
      isin: 'X',
      loads: [carico('2026-01-01', 10)],
      priceHistory: [rilevazione('2026-03-01T00:00:00Z', 15)],
    });
    const Y = titolo({
      isin: 'Y',
      loads: [carico('2026-01-01', 5)],
      priceHistory: [rilevazione('2026-01-01T00:00:00Z', 20)],
    });

    const serie = componiSerieValorePortafoglio([X, Y]);

    const primoPunto = serie.punti.find((p) => p.at === Date.UTC(2026, 0, 1));
    const secondoPunto = serie.punti.find((p) => p.at === Date.UTC(2026, 2, 1));
    if (!primoPunto || !secondoPunto) throw new Error('punti non trovati');

    expect(primoPunto.copertura).toBe('parziale');
    expect(primoPunto.nonValorizzati).toBe(1);
    expect(secondoPunto.copertura).toBe('piena');
    expect(secondoPunto.nonValorizzati).toBe(0);

    expect(serie.primaCoperturaPiena).toBe(Date.UTC(2026, 2, 1));
  });

  it('se la copertura piena non viene mai raggiunta, `primaCoperturaPiena` è null', () => {
    // P è detenuto ma non riceve mai una rilevazione: ogni punto della serie
    // resta a copertura parziale.
    const P = titolo({ isin: 'P', loads: [carico('2026-01-01', 10)] });
    const Q = titolo({
      isin: 'Q',
      loads: [carico('2026-02-01', 5)],
      priceHistory: [rilevazione('2026-02-01T00:00:00Z', 20), rilevazione('2026-04-01T00:00:00Z', 22)],
    });

    const serie = componiSerieValorePortafoglio([P, Q]);

    expect(serie.punti.length).toBeGreaterThan(0);
    expect(serie.punti.every((p) => p.copertura === 'parziale')).toBe(true);
    expect(serie.primaCoperturaPiena).toBeNull();
  });
});

describe('i due zeri: zero titoli detenuti (misurato) contro titoli detenuti ma non valorizzati (non affermabile)', () => {
  // M: carico e poi vendita totale, senza mai una rilevazione — quando M esce
  // dal perimetro e N non è ancora entrato, il portafoglio non ha alcun
  // titolo detenuto: zero misurato.
  const M = titolo({
    isin: 'M',
    loads: [carico('2026-01-01', 10)],
    sales: [vendita('2026-02-01', 10)],
  });
  // N: entra dopo che M è uscito, e non è mai rilevato — titolo detenuto ma
  // non valorizzato: null, non zero.
  const N = titolo({ isin: 'N', loads: [carico('2026-03-01', 5)] });

  const serie = componiSerieValorePortafoglio([M, N]);

  it('quando M è l’unico detenuto e non ha prezzo, il totale è null, non zero', () => {
    const punto = serie.punti.find((p) => p.at === Date.UTC(2026, 0, 1));
    if (!punto) throw new Error('punto non trovato');

    expect(punto.contributi).toHaveLength(1);
    expect(punto.valoreTotale).toBeNull();
    expect(punto.copertura).toBe('parziale');
  });

  it('quando M è appena uscito e N non è ancora entrato, zero titoli detenuti dà valoreTotale 0, non null', () => {
    const punto = serie.punti.find((p) => p.at === Date.UTC(2026, 1, 1));
    if (!punto) throw new Error('punto non trovato');

    expect(punto.contributi).toHaveLength(0);
    expect(punto.valoreTotale).toBe(0);
    // Vacuamente piena: nessun titolo detenuto, quindi nessuno "non valorizzato".
    expect(punto.copertura).toBe('piena');
  });

  it('i due stati non collassano nello stesso caso: uno è null, l’altro è 0, mai lo stesso valore per premesse diverse', () => {
    const zeroTitoli = serie.punti.find((p) => p.at === Date.UTC(2026, 1, 1));
    const titoliNonValorizzati = serie.punti.find((p) => p.at === Date.UTC(2026, 0, 1));
    if (!zeroTitoli || !titoliNonValorizzati) throw new Error('punti non trovati');

    expect(zeroTitoli.valoreTotale).not.toBe(titoliNonValorizzati.valoreTotale);
    expect(zeroTitoli.valoreTotale).toBe(0);
    expect(titoliNonValorizzati.valoreTotale).toBeNull();
  });

  it('quando N entra, resta comunque non valorizzato (null), non zero', () => {
    const punto = serie.punti.find((p) => p.at === Date.UTC(2026, 2, 1));
    if (!punto) throw new Error('punto non trovato');

    expect(punto.contributi).toHaveLength(1);
    expect(punto.valoreTotale).toBeNull();
  });
});

describe('casi degeneri — dati malformati non propagano NaN', () => {
  /** Verifica che tutti i campi numerici di un punto siano finiti o esplicitamente null. */
  function assertiscoNessunNaN(serie: ReturnType<typeof componiSerieValorePortafoglio>): void {
    for (const punto of serie.punti) {
      expect(Number.isFinite(punto.at), `at = ${punto.at} non è finito`).toBe(true);
      expect(Number.isFinite(punto.price), `price = ${punto.price} non è finito`).toBe(true);
      if (punto.valoreTotale !== null) {
        expect(Number.isFinite(punto.valoreTotale), 'valoreTotale non è finito né null').toBe(true);
      }
      for (const contributo of punto.contributi) {
        expect(Number.isFinite(contributo.quantita), 'quantita non è finita').toBe(true);
        if (contributo.valore !== null) {
          expect(Number.isFinite(contributo.valore), 'valore non è finito né null').toBe(true);
        }
        if (contributo.prezzo.stato !== 'nessuno') {
          expect(Number.isFinite(contributo.prezzo.prezzo)).toBe(true);
          expect(Number.isFinite(contributo.prezzo.osservatoA)).toBe(true);
          expect(Number.isFinite(contributo.prezzo.etaGiorni)).toBe(true);
        }
      }
    }
    if (serie.primaCoperturaPiena !== null) {
      expect(Number.isFinite(serie.primaCoperturaPiena)).toBe(true);
    }
  }

  it('date di carico/vendita malformate vengono scartate come eventi, senza generare punti NaN', () => {
    const corrotto = titolo({
      isin: 'CORR',
      loads: [
        carico('non-una-data', 10),
        carico('15/01/2026', 10), // formato italiano, non ISO
        carico('2026-02-01', 5), // il solo valido
      ],
      sales: [vendita('un’altra-data-guasta', 3)],
    });
    const buono = titolo({
      isin: 'OK',
      loads: [carico('2026-01-10', 8)],
      priceHistory: [rilevazione('2026-01-15T10:00:00Z', 12)],
    });

    const serie = componiSerieValorePortafoglio([corrotto, buono]);

    assertiscoNessunNaN(serie);
    // Solo tre eventi validi restano: due carichi validi e una rilevazione.
    expect(serie.punti.map((p) => p.at)).toEqual([
      Date.UTC(2026, 0, 10),
      Date.parse('2026-01-15T10:00:00Z'),
      Date.UTC(2026, 1, 1),
    ]);
  });

  it('quantità e prezzi non finiti vengono scartati invece di propagare NaN nel totale', () => {
    const corrotto = titolo({
      isin: 'CORR2',
      loads: [carico('2026-01-01', Number.NaN), carico('2026-01-05', 4)],
      sales: [vendita('2026-01-10', Number.POSITIVE_INFINITY)],
      priceHistory: [
        { price: Number.POSITIVE_INFINITY, observedAt: Date.parse('2026-01-06T00:00:00Z') / 1000 },
        { price: 9, observedAt: Number.NaN },
        rilevazione('2026-01-07T00:00:00Z', 11), // il solo valido
      ],
    });

    const serie = componiSerieValorePortafoglio([corrotto]);

    assertiscoNessunNaN(serie);

    const puntoFinale = serie.punti.at(-1);
    if (!puntoFinale) throw new Error('nessun punto prodotto');
    // Quantità valida (4, il carico NaN è stato scartato) × prezzo valido (11).
    expect(puntoFinale.valoreTotale).toBeCloseTo(44, 6);
  });

  it('un titolo interamente vuoto (nessun carico, nessuna vendita, nessuna rilevazione) non produce eventi né NaN', () => {
    const vuoto = titolo({ isin: 'VUOTO' });
    const serie = componiSerieValorePortafoglio([vuoto]);

    expect(serie.punti).toEqual([]);
    expect(serie.primaCoperturaPiena).toBeNull();
  });
});

// ─── US-020 · la copertura del perimetro sulla finestra ritagliata ───────────

/**
 * L'istante corrente di tutti gli scenari di questa sezione. Fisso e passato
 * come argomento: `calcolaFinestra` è pura, e una finestra che dipendesse
 * dall'orologio renderebbe irriproducibile proprio il rapporto d'ordine fra i
 * punti e gli estremi che questi test mettono alla prova.
 */
const ORA_FISSA = Date.UTC(2026, 7, 13, 12);

/**
 * Ritaglia una serie sulla finestra di una scala, leggendo la scala da
 * `SCALE_TEMPORALI` invece di riscriverne i mesi.
 *
 * La lettura non è una comodità: le cinque scale sono la definizione condivisa
 * di US-037, e un test che ne ricopiasse la durata continuerebbe a passare
 * anche dopo che quella definizione fosse cambiata — cioè smetterebbe di
 * provare che US-020 la riusa.
 */
function ritaglioSullaScala(
  scala: ScalaTemporale,
  punti: readonly PuntoPortafoglio[],
): { punti: PuntoPortafoglio[]; da: number } {
  const definizione = SCALE_TEMPORALI.find((candidata) => candidata.id === scala);
  if (definizione === undefined) throw new Error(`scala ignota: ${scala}`);

  const finestra = calcolaFinestra({ scala: definizione.id, punti, now: ORA_FISSA });
  return { punti: ritagliaSerie({ punti, finestra }).punti, da: finestra.da };
}

describe('coperturaPerimetroFinestra', () => {
  it('misura sulla finestra, non sulla serie: una copertura piena anteriore alla finestra non è quella della finestra', () => {
    // Storia lunga: la copertura piena comincia nel 2019, sette anni prima
    // dell'inizio della finestra «ultimo anno».
    const serie = componiSerieValorePortafoglio([
      titolo({
        isin: 'LUNGA',
        loads: [carico('2019-01-10', 10)],
        priceHistory: [
          rilevazione('2019-01-10T10:00:00Z', 100),
          rilevazione('2026-05-01T10:00:00Z', 110),
          rilevazione('2026-07-01T10:00:00Z', 120),
        ],
      }),
    ]);

    const { punti, da } = ritaglioSullaScala('anno', serie.punti);

    // La premessa dello scenario, asserita e non data per scontata: il valore
    // globale cade *prima* dell'inizio della finestra, quindi riusarlo
    // dichiarerebbe una data che l'asse non mostra nemmeno.
    expect(serie.primaCoperturaPiena).not.toBeNull();
    expect(serie.primaCoperturaPiena!).toBeLessThan(da);

    const copertura = coperturaPerimetroFinestra(punti);

    expect(copertura.verdetto).toBe('piena');
    expect(copertura.primaCoperturaPiena).toBe(Date.parse('2026-05-01T10:00:00Z'));
    expect(copertura.puntiPieni).toBe(2);
    expect(copertura.puntiParziali).toBe(0);
  });

  it('segue la regressione della copertura: piena, poi parziale, poi piena di nuovo', () => {
    // Il secondo titolo entra a registro un anno dopo il primo e resta senza
    // prezzo noto per oltre un anno: la copertura, già piena, torna parziale —
    // il caso che un valore calcolato una volta sola non può rappresentare.
    const serie = componiSerieValorePortafoglio([
      titolo({
        isin: 'PRIMO',
        loads: [carico('2024-01-10', 10)],
        priceHistory: [
          rilevazione('2024-01-10T10:00:00Z', 100),
          rilevazione('2025-06-01T10:00:00Z', 110),
          rilevazione('2026-07-01T10:00:00Z', 120),
        ],
      }),
      titolo({
        isin: 'SECONDO',
        loads: [carico('2025-01-15', 5)],
        priceHistory: [rilevazione('2026-06-01T10:00:00Z', 50)],
      }),
    ]);

    // Sull'intera storia la copertura è parziale, e comincia a essere piena nel
    // 2024 — prima della regressione.
    const tutto = coperturaPerimetroFinestra(ritaglioSullaScala('tutto', serie.punti).punti);
    expect(tutto.verdetto).toBe('parziale');
    expect(tutto.primaCoperturaPiena).toBe(Date.parse('2024-01-10T10:00:00Z'));
    expect(tutto.puntiPieni).toBe(3);
    expect(tutto.puntiParziali).toBe(3);

    // Sulla finestra aperta *dopo* la regressione il perimetro è di nuovo
    // completo, e la data d'inizio è quella del secondo tratto: non la data del
    // 2024, che in questa finestra non afferma nulla.
    const anno = coperturaPerimetroFinestra(ritaglioSullaScala('anno', serie.punti).punti);
    expect(anno.verdetto).toBe('piena');
    expect(anno.primaCoperturaPiena).toBe(Date.parse('2026-06-01T10:00:00Z'));
    expect(anno.puntiPieni).toBe(2);
    expect(anno.puntiParziali).toBe(0);
  });

  it('una finestra senza punti è «senza-oggetto», mai «piena»', () => {
    const serie = componiSerieValorePortafoglio([
      titolo({
        isin: 'VECCHIO',
        loads: [carico('2026-01-10', 10)],
        priceHistory: [rilevazione('2026-01-10T10:00:00Z', 40)],
      }),
    ]);

    const { punti } = ritaglioSullaScala('mese', serie.punti);
    expect(punti).toHaveLength(0);

    const copertura = coperturaPerimetroFinestra(punti);

    // «Piena» sarebbe vera solo vacuamente — nessuna eccezione su un insieme di
    // date vuoto — e a schermo si leggerebbe come una rassicurazione sopra un
    // riquadro che non mostra nulla.
    expect(copertura.verdetto).toBe('senza-oggetto');
    expect(copertura.primaCoperturaPiena).toBeNull();
    expect(copertura.puntiPieni).toBe(0);
    expect(copertura.puntiParziali).toBe(0);
  });

  it('tutti i punti completi: verdetto pieno e inizio copertura sul primo punto della finestra', () => {
    // Una rilevazione anteriore al carico rende valorizzato anche il punto del
    // carico: nessun punto della serie ha un titolo detenuto senza prezzo.
    const serie = componiSerieValorePortafoglio([
      titolo({
        isin: 'COMPLETO',
        loads: [carico('2026-02-01', 7)],
        priceHistory: [
          rilevazione('2026-01-05T10:00:00Z', 20),
          rilevazione('2026-03-05T10:00:00Z', 22),
        ],
      }),
    ]);

    const { punti } = ritaglioSullaScala('tutto', serie.punti);
    const copertura = coperturaPerimetroFinestra(punti);

    expect(copertura.verdetto).toBe('piena');
    expect(copertura.primaCoperturaPiena).toBe(punti[0].at);
    expect(copertura.puntiPieni).toBe(punti.length);
    expect(copertura.puntiParziali).toBe(0);
  });

  it('tutti i punti incompleti: verdetto parziale e nessuna data d’inizio copertura', () => {
    // Un titolo detenuto e mai rilevato: la copertura piena non comincia a
    // nessuna data, e `null` lo dice senza inventare un confine.
    const serie = componiSerieValorePortafoglio([
      titolo({ isin: 'MAI-RILEVATO', loads: [carico('2026-01-10', 4)] }),
      titolo({
        isin: 'RILEVATO',
        loads: [carico('2026-01-10', 6)],
        priceHistory: [rilevazione('2026-02-10T10:00:00Z', 30)],
      }),
    ]);

    const { punti } = ritaglioSullaScala('tutto', serie.punti);
    const copertura = coperturaPerimetroFinestra(punti);

    expect(copertura.verdetto).toBe('parziale');
    expect(copertura.primaCoperturaPiena).toBeNull();
    expect(copertura.puntiPieni).toBe(0);
    expect(copertura.puntiParziali).toBe(punti.length);
  });
});
