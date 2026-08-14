/**
 * US-015 (TASK-04, TASK-05) — la scomposizione della variazione del
 * portafoglio: `variazione del valore = capitale netto versato + movimento di
 * mercato`.
 *
 * Il rischio specifico a questo modulo, distinto da quello dei fratelli
 * (`metricheTitolo.ts`, `serieValorePortafoglio.ts`), è che l'identità regga
 * "per caso" perché il perimetro non è stato applicato **prima** delle cifre:
 * un titolo che dovrebbe uscire da entrambi i lati dell'identità (valore e
 * flussi) ma esce da uno solo produce un'identità che somma comunque zero, con
 * ogni test superficiale verde. I test di questo file isolano perciò due
 * confini che si sbagliano in silenzio:
 *
 * - **il capo semiaperto**: un carico datato esattamente all'inizio della
 *   finestra è già dentro il valore iniziale, e contarlo fra i versamenti lo
 *   conterebbe due volte;
 * - **il perimetro prima dei flussi**: il carico di un titolo escluso non deve
 *   comparire fra i versamenti, o il movimento di mercato ne assorbirebbe
 *   l'importo con il segno rovesciato — una perdita (o un guadagno) inventata.
 *
 * Le fixture passano quasi sempre dalla pipeline vera
 * (`componiSerieValorePortafoglio` → `ritagliaSerie`) invece di punti
 * fabbricati a mano: è la stessa serie che il grafico disegna, e un punto
 * fabbricato a mano potrebbe nascondere un disaccordo con quella pipeline.
 */
import { describe, it, expect } from 'vitest';
import {
  calcolaScomposizioneFinestra,
  componiSerieValorePortafoglio,
  ritagliaSerie,
  RILEVAZIONI_MINIME_VARIAZIONE,
  type CaricoValore,
  type VenditaFlusso,
  type RilevazioneSerie,
  type TitoloPortafoglio,
  type PuntoPortafoglio,
  type EsitoScomposizioneFinestra,
} from '@portfolia/shared';

/** Un carico, ridotto ai tre campi che la serie del valore legge. */
const carico = (loadDate: string, quantity: number, loadPrice = 0): CaricoValore => ({
  loadDate,
  loadPrice,
  quantity,
});

/** Una vendita, coi tre campi che questo modulo legge (US-015: `salePrice` incluso). */
const vendita = (saleDate: string, quantity: number, salePrice = 0): VenditaFlusso => ({
  saleDate,
  quantity,
  salePrice,
});

/** Una rilevazione. `observedAt` è in unix **secondi**, come in archivio. */
const rilevazione = (istanteIso: string, price: number): RilevazioneSerie => ({
  price,
  observedAt: Date.parse(istanteIso) / 1000,
});

/** Un titolo del perimetro, con valori di default per i campi non rilevanti al test. */
function titolo(input: Partial<TitoloPortafoglio> & { isin: string }): TitoloPortafoglio {
  return { name: null, loads: [], sales: [], priceHistory: [], ...input };
}

/**
 * Ritaglia la serie aggregata **vera** (non punti fabbricati) sulla finestra
 * chiesta: la stessa pipeline che `GraficoPortafoglio` percorre prima di
 * chiamare `calcolaScomposizioneFinestra`.
 */
function finestraSu(titoli: TitoloPortafoglio[], da: number, a: number): readonly PuntoPortafoglio[] {
  const serie = componiSerieValorePortafoglio(titoli);
  return ritagliaSerie({ punti: serie.punti, finestra: { da, a } }).punti;
}

/** Restringe l'unione al ramo «disponibile»: serve al tipo, non alla logica. */
function disponibile(
  esito: EsitoScomposizioneFinestra,
): Extract<EsitoScomposizioneFinestra, { stato: 'disponibile' }> {
  if (esito.stato !== 'disponibile') {
    throw new Error(`atteso stato 'disponibile', ricevuto '${esito.stato}'`);
  }
  return esito;
}

/** Restringe l'unione al ramo «non disponibile». */
function nonDisponibile(
  esito: EsitoScomposizioneFinestra,
): Extract<EsitoScomposizioneFinestra, { stato: 'non-disponibile' }> {
  if (esito.stato !== 'non-disponibile') {
    throw new Error(`atteso stato 'non-disponibile', ricevuto '${esito.stato}'`);
  }
  return esito;
}

describe('calcolaScomposizioneFinestra — l\'identità (criterio 7)', () => {
  it('un carico e una vendita entrambi dentro la finestra: variazione = versato + mercato al centesimo', () => {
    const titoli = [
      titolo({
        isin: 'A',
        loads: [
          carico('2025-01-01', 200, 90), // baseline, fuori finestra
          carico('2026-03-01', 50, 100), // dentro la finestra: +5.000
        ],
        sales: [vendita('2026-05-01', 20, 110)], // dentro la finestra: −2.200
        priceHistory: [
          rilevazione('2026-01-01T00:00:00Z', 100), // prima: 200 × 100 = 20.000
          rilevazione('2027-01-01T00:00:00Z', 100), // ultima: 230 × 100 = 23.000
        ],
      }),
    ];
    const punti = finestraSu(titoli, Date.UTC(2026, 0, 1), Date.UTC(2027, 0, 1));

    const esito = disponibile(calcolaScomposizioneFinestra({ punti, titoli }));

    expect(esito.valoreIniziale).toBe(20_000);
    expect(esito.valoreFinale).toBe(23_000);
    expect(esito.variazione).toBe(3_000);
    expect(esito.capitaleNettoVersato).toBe(2_800); // 5.000 − 2.200
    expect(esito.movimentoMercato).toBe(200);
    // L'identità, non presa sulla parola: la somma dei due addendi torna alla
    // variazione al centesimo.
    expect(esito.capitaleNettoVersato + esito.movimentoMercato).toBe(esito.variazione);
  });

  it('una vendita maggiore del carico: il capitale netto versato è negativo, e l\'identità regge comunque', () => {
    const titoli = [
      titolo({
        isin: 'A',
        loads: [
          carico('2025-01-01', 200, 90),
          carico('2026-02-01', 10, 100), // +1.000
        ],
        sales: [vendita('2026-03-01', 100, 120)], // −12.000
        priceHistory: [
          rilevazione('2026-01-01T00:00:00Z', 100), // prima: 200 × 100 = 20.000
          rilevazione('2026-06-01T00:00:00Z', 100), // ultima: 110 × 100 = 11.000
        ],
      }),
    ];
    const punti = finestraSu(titoli, Date.UTC(2026, 0, 1), Date.UTC(2026, 5, 1));

    const esito = disponibile(calcolaScomposizioneFinestra({ punti, titoli }));

    expect(esito.variazione).toBe(-9_000);
    expect(esito.capitaleNettoVersato).toBe(-11_000); // 1.000 − 12.000: negativo
    expect(esito.movimentoMercato).toBe(2_000);
    expect(esito.capitaleNettoVersato + esito.movimentoMercato).toBe(esito.variazione);
  });

  it('senza alcun flusso: il movimento di mercato coincide con la variazione, e il versato è uno zero misurato', () => {
    // Nessun carico, nessuna vendita nella finestra: il versato è `0`, ma è
    // uno zero **misurato** — nessun movimento di cassa — non un'assenza. La
    // guardia da non introdurre mai è `capitaleNettoVersato || null`, che
    // romperebbe esattamente questo caso.
    const titoli = [
      titolo({
        isin: 'A',
        loads: [carico('2025-01-01', 100, 90)],
        priceHistory: [
          rilevazione('2026-01-01T00:00:00Z', 100), // prima: 10.000
          rilevazione('2026-06-01T00:00:00Z', 115), // ultima: 11.500
        ],
      }),
    ];
    const punti = finestraSu(titoli, Date.UTC(2026, 0, 1), Date.UTC(2026, 5, 1));

    const esito = disponibile(calcolaScomposizioneFinestra({ punti, titoli }));

    expect(esito.capitaleNettoVersato).toBe(0);
    expect(esito.movimentoMercato).toBe(esito.variazione);
    expect(esito.variazione).toBe(1_500);
    expect(esito.percentuale).toBe(15);
  });

  it('un carico datato esattamente al primo capo NON entra fra i flussi; uno all\'ultimo capo entra', () => {
    // Il difetto più facile da introdurre e il più difficile da vedere a
    // occhio: l'intervallo è semiaperto `(prima.at, ultima.at]`. Un carico sul
    // primo capo è già dentro `valoreIniziale` — contarlo lo conterebbe due
    // volte — mentre uno sull'ultimo capo non è ancora entrato in nessuna
    // somma e va contato.
    const titoli = [
      titolo({
        isin: 'A',
        loads: [
          carico('2025-01-01', 200, 90), // ben prima della finestra
          carico('2026-01-01', 10, 120), // ESATTAMENTE il primo capo: 1.200, da escludere
          carico('2026-07-01', 5, 150), // ESATTAMENTE l'ultimo capo: 750, da includere
        ],
        priceHistory: [
          rilevazione('2025-12-01T00:00:00Z', 100), // prezzo noto prima della finestra, riportato al primo capo
          rilevazione('2026-06-15T00:00:00Z', 130), // prezzo noto prima dell'ultimo capo, riportato lì
        ],
      }),
    ];
    const punti = finestraSu(titoli, Date.UTC(2026, 0, 1), Date.UTC(2026, 6, 1));

    // Premessa: il primo e l'ultimo punto della finestra sono davvero i due
    // carichi ai capi, non un terzo punto imprevisto.
    expect(punti[0].at).toBe(Date.UTC(2026, 0, 1));
    expect(punti[punti.length - 1].at).toBe(Date.UTC(2026, 6, 1));

    const esito = disponibile(calcolaScomposizioneFinestra({ punti, titoli }));

    // Solo il carico dell'ultimo capo (750) entra: né quello del primo capo
    // (1.200, già dentro valoreIniziale), né il baseline del 2025 (fuori
    // finestra). Se il primo capo fosse (erroneamente) incluso, il totale
    // sarebbe 1.950, non 750.
    expect(esito.capitaleNettoVersato).toBe(750);
    expect(esito.capitaleNettoVersato).not.toBe(1_950);
  });
});

describe('calcolaScomposizioneFinestra — la soglia dei punti (criterio 5)', () => {
  it('zero o un punto in finestra: non disponibile, ragione "punti-insufficienti", nessuna cifra', () => {
    expect(RILEVAZIONI_MINIME_VARIAZIONE).toBe(2);

    const titoli = [
      titolo({
        isin: 'A',
        loads: [carico('2026-01-01', 100, 90)],
        priceHistory: [
          rilevazione('2026-01-01T00:00:00Z', 100),
          rilevazione('2026-06-01T00:00:00Z', 110),
          rilevazione('2027-01-01T00:00:00Z', 120),
        ],
      }),
    ];
    const puntiCompleti = finestraSu(titoli, -Infinity, Infinity);
    expect(puntiCompleti.length).toBeGreaterThanOrEqual(RILEVAZIONI_MINIME_VARIAZIONE + 1);

    const sottoSoglia = puntiCompleti.slice(0, RILEVAZIONI_MINIME_VARIAZIONE - 1);
    const allaSoglia = puntiCompleti.slice(0, RILEVAZIONI_MINIME_VARIAZIONE);

    const esitoZero = nonDisponibile(calcolaScomposizioneFinestra({ punti: [], titoli }));
    expect(esitoZero.ragione).toBe('punti-insufficienti');
    expect(esitoZero.puntiCompresi).toBe(0);

    const esitoUno = nonDisponibile(calcolaScomposizioneFinestra({ punti: sottoSoglia, titoli }));
    expect(esitoUno.ragione).toBe('punti-insufficienti');
    expect(esitoUno.puntiCompresi).toBe(1);
    // Nessuna cifra: l'esito "non disponibile" non porta valore/versato/mercato.
    expect(Object.keys(esitoUno)).not.toContain('variazione');
    expect(Object.keys(esitoUno)).not.toContain('capitaleNettoVersato');

    const esitoAllaSoglia = calcolaScomposizioneFinestra({ punti: allaSoglia, titoli });
    expect(esitoAllaSoglia.stato).toBe('disponibile');
  });
});

describe('calcolaScomposizioneFinestra — il perimetro (criterio 6)', () => {
  it('un titolo detenuto e mai valorizzato viene escluso: il suo carico non compare fra i versamenti', () => {
    const titoli = [
      titolo({
        isin: 'A',
        name: 'Titolo Valorizzato',
        loads: [carico('2025-01-01', 200, 90)],
        priceHistory: [
          rilevazione('2026-01-01T00:00:00Z', 100), // prima: 200 × 100 = 20.000
          rilevazione('2027-01-01T00:00:00Z', 110), // ultima: 200 × 110 = 22.000
        ],
      }),
      titolo({
        isin: 'B',
        name: 'Titolo Mai Rilevato',
        loads: [
          carico('2025-06-01', 50, 200), // baseline, fuori finestra
          carico('2026-06-01', 10, 300), // dentro la finestra: 3.000, NON deve entrare nei versamenti
        ],
        priceHistory: [], // mai rilevato: sempre `valore: null` finché detenuto
      }),
    ];
    const punti = finestraSu(titoli, Date.UTC(2026, 0, 1), Date.UTC(2027, 0, 1));

    const esito = disponibile(calcolaScomposizioneFinestra({ punti, titoli }));

    expect(esito.perimetro).toBe('parziale');
    expect(esito.titoliEsclusi).toEqual([{ isin: 'B', name: 'Titolo Mai Rilevato' }]);
    expect(esito.titoliCompresi).toEqual([{ isin: 'A', name: 'Titolo Valorizzato' }]);

    // Il punto centrale: il carico di B (3.000) NON compare nei versamenti.
    // Se comparisse, il movimento di mercato ne assorbirebbe l'importo col
    // segno rovesciato — una perdita inventata, con l'identità formalmente
    // verde perché somma comunque zero.
    expect(esito.capitaleNettoVersato).toBe(0);
    expect(esito.valoreIniziale).toBe(20_000);
    expect(esito.valoreFinale).toBe(22_000);
    expect(esito.variazione).toBe(2_000);
    expect(esito.movimentoMercato).toBe(2_000);
  });

  it('un titolo comprato dentro la finestra e regolarmente rilevato resta compreso', () => {
    const titoli = [
      titolo({
        isin: 'A',
        loads: [carico('2025-01-01', 100, 90)],
        priceHistory: [
          rilevazione('2026-01-01T00:00:00Z', 50), // prima: 100 × 50 = 5.000
          rilevazione('2027-01-01T00:00:00Z', 60), // ultima: 100 × 60 = 6.000
        ],
      }),
      titolo({
        isin: 'C',
        loads: [carico('2026-04-01', 20, 70)], // comprato dentro la finestra: +1.400
        priceHistory: [
          // Rilevato esattamente il giorno dell'acquisto: mai un punto scoperto.
          rilevazione('2026-04-01T00:00:00Z', 75),
        ],
      }),
    ];
    const punti = finestraSu(titoli, Date.UTC(2026, 0, 1), Date.UTC(2027, 0, 1));

    const esito = disponibile(calcolaScomposizioneFinestra({ punti, titoli }));

    expect(esito.perimetro).toBe('completo');
    expect(esito.titoliEsclusi).toEqual([]);
    expect(esito.titoliCompresi.map((t) => t.isin).sort()).toEqual(['A', 'C']);

    expect(esito.valoreIniziale).toBe(5_000); // C non ancora detenuto a "prima"
    expect(esito.valoreFinale).toBe(6_000 + 20 * 75); // A rivalutato + C riportato al suo ultimo prezzo
    expect(esito.capitaleNettoVersato).toBe(1_400); // il carico di C conta: è nel perimetro
  });

  it('perimetro vuoto: non disponibile con ragione "perimetro-vuoto", distinta dalla soglia', () => {
    const titoli = [
      titolo({
        isin: 'B',
        loads: [carico('2026-01-01', 10, 200), carico('2026-06-01', 5, 210)],
        priceHistory: [], // mai rilevato
      }),
    ];
    const punti = finestraSu(titoli, Date.UTC(2026, 0, 1), Date.UTC(2026, 5, 1));
    expect(punti.length).toBeGreaterThanOrEqual(RILEVAZIONI_MINIME_VARIAZIONE); // premessa: la soglia non è il motivo

    const esito = nonDisponibile(calcolaScomposizioneFinestra({ punti, titoli }));

    expect(esito.ragione).toBe('perimetro-vuoto');
    expect(esito.ragione).not.toBe('punti-insufficienti');
  });
});

describe('calcolaScomposizioneFinestra — la base della percentuale (criterio 3)', () => {
  it('la base è dichiarata come somma: valoreIniziale + capitaleNettoVersato', () => {
    const titoli = [
      titolo({
        isin: 'A',
        loads: [carico('2025-01-01', 200, 90), carico('2026-03-01', 50, 100)],
        sales: [vendita('2026-05-01', 20, 110)],
        priceHistory: [
          rilevazione('2026-01-01T00:00:00Z', 100),
          rilevazione('2027-01-01T00:00:00Z', 100),
        ],
      }),
    ];
    const punti = finestraSu(titoli, Date.UTC(2026, 0, 1), Date.UTC(2027, 0, 1));

    const esito = disponibile(calcolaScomposizioneFinestra({ punti, titoli }));

    expect(esito.baseRapporto).toBe(esito.valoreIniziale + esito.capitaleNettoVersato);
    expect(esito.baseRapporto).toBe(22_800);
    expect(esito.percentuale).toBe((esito.movimentoMercato / esito.baseRapporto) * 100);
  });

  it('base non positiva (negativa o esattamente zero): percentuale null, mai Infinity', () => {
    // Liquidazione totale dentro la finestra: il versato è talmente negativo
    // che valoreIniziale + versato scende a zero o sotto zero. Il valore
    // assoluto del movimento di mercato resta un fatto misurato — solo il
    // rapporto perde senso.
    const titoliBaseNegativa = [
      titolo({
        isin: 'A',
        loads: [carico('2025-01-01', 100, 90)],
        sales: [vendita('2026-03-01', 100, 12)], // vende tutto: −1.200
        priceHistory: [rilevazione('2026-01-01T00:00:00Z', 10)], // prima: 100 × 10 = 1.000
      }),
    ];
    const puntiNegativa = finestraSu(titoliBaseNegativa, Date.UTC(2026, 0, 1), Date.UTC(2026, 2, 1));
    const esitoNegativa = disponibile(calcolaScomposizioneFinestra({ punti: puntiNegativa, titoli: titoliBaseNegativa }));

    expect(esitoNegativa.baseRapporto).toBeLessThan(0);
    expect(esitoNegativa.percentuale).toBeNull();
    expect(Number.isFinite(esitoNegativa.movimentoMercato)).toBe(true);

    const titoliBaseZero = [
      titolo({
        isin: 'A',
        loads: [carico('2025-01-01', 100, 90)],
        sales: [vendita('2026-02-01', 100, 10)], // vende tutto al prezzo esatto: −1.000
        priceHistory: [rilevazione('2026-01-01T00:00:00Z', 10)], // prima: 100 × 10 = 1.000
      }),
    ];
    const puntiZero = finestraSu(titoliBaseZero, Date.UTC(2026, 0, 1), Date.UTC(2026, 1, 1));
    const esitoZero = disponibile(calcolaScomposizioneFinestra({ punti: puntiZero, titoli: titoliBaseZero }));

    expect(esitoZero.baseRapporto).toBe(0);
    expect(esitoZero.percentuale).toBeNull();
  });

  it('variazione nulla: 0,00 % disponibile — lo zero misurato non è un\'assenza', () => {
    const titoli = [
      titolo({
        isin: 'A',
        loads: [carico('2025-01-01', 100, 90)],
        priceHistory: [
          rilevazione('2026-01-01T00:00:00Z', 100), // prima: 10.000
          rilevazione('2026-06-01T00:00:00Z', 100), // ultima: 10.000, nessun movimento
        ],
      }),
    ];
    const punti = finestraSu(titoli, Date.UTC(2026, 0, 1), Date.UTC(2026, 5, 1));

    const esito = disponibile(calcolaScomposizioneFinestra({ punti, titoli }));

    expect(esito.variazione).toBe(0);
    expect(esito.percentuale).toBe(0);
    expect(esito.percentuale).not.toBeNull();
  });
});
