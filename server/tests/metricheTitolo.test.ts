/**
 * US-038 — le due metriche sotto il grafico del titolo: il P&L da carico e la
 * variazione di periodo.
 *
 * Due guasti temuti, ed entrambi sono *silenziosi*: nessuno solleva
 * un'eccezione, nessuno tinge di rosso una suite, e la scheda continua a
 * mostrare un numero. Solo che il numero è falso.
 *
 * Il primo è l'**aritmetica che sembra giusta**. Una media aritmetica al posto
 * di quella ponderata coincide esattamente con quella corretta quando le
 * quantità sono uguali — cioè proprio nei casi che si scrivono per primi in un
 * test — e diverge solo sui carichi veri; e la «semplificazione» algebrica di
 * `currentPrice × qty − avgLoadPrice × qty` in `(currentPrice − avgLoadPrice) × qty`
 * è un'identità sui reali ma non in virgola mobile: sposta l'ultimo bit, e
 * siccome la scheda mostra lo stesso esito in due punti (la casella
 * «Differenza» di *Posizione a conto* e il riquadro del P&L sotto il grafico),
 * la divergenza si presenta all'utente come due centesimi che non tornano fra
 * due letture dello stesso dato. I test di questo file fissano quindi la media
 * su quantità **diverse** — l'unico caso in cui ponderata e aritmetica si
 * distinguono — e pinnano la differenza con `toBe`, non con `toBeCloseTo`:
 * `toBeCloseTo` è cieco esattamente al difetto che qui si vuole intercettare.
 *
 * Il secondo è lo **zero al posto dell'assenza**. Un dato mancante reso come
 * `0` non lascia traccia: «0,00 %» è una frase di senso compiuto, afferma che
 * il prezzo non si è mosso, e nessuno la legge come «non lo so» (ADR-003,
 * FR-012). Lo stesso vale per i suoi parenti: un `Infinity` da divisione per
 * zero e un `NaN` da media su zero quote attraversano `JSON.stringify` come
 * `null` o si stampano come «NaN %» in fondo a una scheda che nessuno rilegge.
 * I casi degeneri sono quindi provati uno per uno, e su ciascuno si asserisce
 * che il campo non calcolabile sia `null` — e che gli altri restino valorizzati,
 * perché l'assenza di uno non deve poter cancellare la presenza degli altri.
 *
 * Il rovescio della stessa medaglia va provato con altrettanta cura: lo zero
 * **misurato** è un dato, e deve restare disponibile. Il divieto riguarda lo
 * zero al posto dell'assenza, non lo zero come misura.
 *
 * Le funzioni sono pure: nessuna rete, nessun archivio, nessun orologio.
 */
import { describe, it, expect } from 'vitest';
import {
  calcolaPnlDaCarico,
  calcolaVariazionePeriodo,
  componiSerieTitolo,
  ritagliaSerie,
  RILEVAZIONI_MINIME_VARIAZIONE,
  type CaricoPnl,
  type CaricoSerie,
  type OriginePunto,
  type PuntoSerie,
  type RilevazioneSerie,
  type VariazionePeriodo,
} from '@portfolia/shared';

const GIORNO_MS = 24 * 60 * 60 * 1000;

/** Un carico, ridotto ai due soli campi che il P&L legge. */
const caricoPnl = (loadPrice: number, quantity: number): CaricoPnl => ({ loadPrice, quantity });

/** Un punto già composto, nella forma che `calcolaVariazionePeriodo` riceve. */
const punto = (at: number, price: number, origin: OriginePunto): PuntoSerie => ({
  at,
  price,
  origin,
});

/** Un carico per `componiSerieTitolo`, quando il test parte dalla serie vera. */
const carico = (loadDate: string, loadPrice: number): CaricoSerie => ({ loadDate, loadPrice });

/** Una rilevazione per `componiSerieTitolo`: `observedAt` è in unix **secondi**. */
const rilevazione = (istanteIso: string, price: number): RilevazioneSerie => ({
  price,
  observedAt: Date.parse(istanteIso) / 1000,
});

/**
 * Restringe l'unione al ramo «disponibile».
 *
 * Serve al tipo, non alla logica: senza il restringimento TypeScript non
 * lascerebbe leggere `valore`/`percentuale`, ed è precisamente la proprietà per
 * cui l'esito è un'unione discriminata invece di una manciata di campi
 * nullable. L'`expect` che precede il `throw` fa sì che un esito inatteso si
 * presenti come asserzione fallita leggibile e non come eccezione grezza.
 */
function disponibile(esito: VariazionePeriodo): Extract<VariazionePeriodo, { stato: 'disponibile' }> {
  expect(esito.stato).toBe('disponibile');
  if (esito.stato !== 'disponibile') throw new Error('atteso stato «disponibile»');
  return esito;
}

/** Simmetrica della precedente, sul ramo dell'assenza dichiarata. */
function nonDisponibile(
  esito: VariazionePeriodo,
): Extract<VariazionePeriodo, { stato: 'non-disponibile' }> {
  expect(esito.stato).toBe('non-disponibile');
  if (esito.stato !== 'non-disponibile') throw new Error('atteso stato «non-disponibile»');
  return esito;
}

describe('calcolaPnlDaCarico', () => {
  it('tre carichi a prezzi **e quantità** diversi: la media è quella ponderata, non l’aritmetica', () => {
    // Le due medie coincidono a quantità uguali: un test con 100 quote ciascuno
    // resterebbe verde anche sostituendo la formula ponderata con
    // `Σ(prezzi)/n`. Le quantità qui sono deliberatamente diverse (80/90/50), e
    // sotto si asserisce non solo il valore giusto ma anche che sia *diverso*
    // da quello sbagliato — altrimenti la prova non distinguerebbe le due.
    const loads = [caricoPnl(61.4, 80), caricoPnl(70.1, 90), caricoPnl(76.1, 50)];

    const pnl = calcolaPnlDaCarico({ loads, currentPrice: 128.46 });

    // 61,40×80 + 70,10×90 + 76,10×50 = 4.912 + 6.309 + 3.805 = 15.026 su 220 quote
    expect(pnl.totalQuantity).toBe(220);
    expect(pnl.avgLoadPrice).toBeCloseTo(68.3, 6);
    expect(pnl.totalLoadValue).toBeCloseTo(15026.0, 6);
    // 128,46 × 220 = 28.261,20 → differenza 13.235,20, cioè +88,08 %
    expect(pnl.currentValue).toBeCloseTo(28261.2, 6);
    expect(pnl.difference).toBeCloseTo(13235.2, 6);
    expect(pnl.differencePercent).toBeCloseTo(88.0820, 3);

    // La media aritmetica dei tre prezzi vale 69,20: vicina, plausibile, e
    // sbagliata di 90 centesimi sul controvalore per ogni quota. È il numero
    // che comparirebbe se la ponderazione sparisse, e questa riga è l'unica del
    // test che se ne accorgerebbe.
    const mediaAritmetica = (61.4 + 70.1 + 76.1) / 3;
    expect(mediaAritmetica).toBeCloseTo(69.2, 6);
    expect(pnl.avgLoadPrice).not.toBeCloseTo(mediaAritmetica, 2);
  });

  it('senza prezzo corrente i tre campi derivati sono null, mai zero, e i dati di carico restano valorizzati', () => {
    // «Non so quanto vale oggi» non è «vale zero»: uno zero qui dichiarerebbe
    // una perdita totale. E l'assenza del prezzo corrente non tocca ciò che
    // discende dai soli carichi, che resta noto e va mostrato.
    const pnl = calcolaPnlDaCarico({
      loads: [caricoPnl(61.4, 80), caricoPnl(70.1, 90)],
      currentPrice: null,
    });

    expect(pnl.currentValue).toBeNull();
    expect(pnl.difference).toBeNull();
    expect(pnl.differencePercent).toBeNull();

    expect(pnl.totalQuantity).toBe(170);
    expect(pnl.avgLoadPrice).toBeCloseTo(66.005_882_35, 6); // (4.912 + 6.309) / 170
    expect(pnl.totalLoadValue).toBeCloseTo(11221.0, 6);
  });

  it('controvalore di carico nullo perché il prezzo di carico è 0: percentuale null, mai Infinity', () => {
    // Un carico a prezzo zero (un titolo ricevuto, un errore di inserimento
    // storico) porta il denominatore a zero. La divisione non solleva nulla:
    // produce `Infinity`, che si stamperebbe come «∞ %» — o, passando da
    // `JSON.stringify`, come `null` per la ragione sbagliata.
    const pnl = calcolaPnlDaCarico({ loads: [caricoPnl(0, 100)], currentPrice: 12.5 });

    expect(pnl.differencePercent).toBeNull();
    // La differenza assoluta resta invece perfettamente misurabile: l'assenza
    // della percentuale non deve trascinarsi dietro anche il valore.
    expect(pnl.totalQuantity).toBe(100);
    expect(pnl.avgLoadPrice).toBe(0);
    expect(pnl.totalLoadValue).toBe(0);
    expect(pnl.currentValue).toBeCloseTo(1250.0, 6);
    expect(pnl.difference).toBeCloseTo(1250.0, 6);
  });

  it('quantità totale nulla: nessun NaN dalla divisione per zero e percentuale null', () => {
    // Seconda forma dello stesso denominatore nullo, e la più insidiosa: qui a
    // sparire è il *divisore della media*, non quello della percentuale. Senza
    // la guardia `totalQuantity > 0` la media sarebbe `0/0 = NaN`, e un `NaN`
    // contamina in silenzio ogni campo a valle — `NaN × 0` è ancora `NaN`.
    const conQuantitaZero = calcolaPnlDaCarico({
      loads: [caricoPnl(61.4, 0), caricoPnl(70.1, 0)],
      currentPrice: 128.46,
    });

    expect(Number.isNaN(conQuantitaZero.avgLoadPrice)).toBe(false);
    expect(conQuantitaZero.avgLoadPrice).toBe(0);
    expect(conQuantitaZero.totalQuantity).toBe(0);
    expect(conQuantitaZero.totalLoadValue).toBe(0);
    expect(conQuantitaZero.differencePercent).toBeNull();
    // Nessuno dei campi numerici valorizzati è NaN o Infinity.
    for (const [nome, valore] of Object.entries(conQuantitaZero)) {
      if (typeof valore === 'number') {
        expect(Number.isFinite(valore), `${nome} = ${valore} non è finito`).toBe(true);
      }
    }

    // Elenco di carichi vuoto: stesso esito, senza eccezioni. È lo stato che
    // l'aggregato assume se l'ultima posizione viene cancellata mentre la
    // scheda è aperta.
    const senzaCarichi = calcolaPnlDaCarico({ loads: [], currentPrice: 128.46 });
    expect(senzaCarichi.totalQuantity).toBe(0);
    expect(senzaCarichi.avgLoadPrice).toBe(0);
    expect(senzaCarichi.differencePercent).toBeNull();
  });

  it('regressione — l’ordine delle operazioni non si «semplifica»: la differenza è pinnata alla forma non raccolta', () => {
    // Ingressi scelti apposta (ricerca esaustiva su prezzi a due decimali e
    // quantità intere) perché le due forme divergano *davvero* su di essi:
    //
    //   currentPrice × qty − avgLoadPrice × qty  =  -22474.7                (forma del gestore)
    //   (currentPrice − avgLoadPrice) × qty      =  -22474.700000000004     (forma raccolta)
    //
    // Un delta di 3,6e-12 € non si vede su una casella; si vede quando le due
    // letture della *stessa* posizione — «Differenza» in Posizione a conto e il
    // riquadro P&L sotto il grafico — vengono arrotondate ai centesimi da due
    // percorsi che hanno associato i prodotti in ordine diverso, e cadono ai due
    // lati dell'ultimo mezzo centesimo. L'asserzione è `toBe`: `toBeCloseTo`
    // sarebbe cieco a tutta questa classe di difetti per costruzione.
    const loads = [caricoPnl(85.31, 53), caricoPnl(282.61, 103)];
    const currentPrice = 71.51;

    // L'aritmetica del vecchio gestore in linea, riscritta qui passo per passo:
    // è il riferimento contro cui la funzione estratta va confrontata, e va
    // ricalcolato — non copiato dalla funzione — o non proverebbe nulla.
    const totalQuantity = loads.reduce((somma, riga) => somma + riga.quantity, 0);
    const weightedSum = loads.reduce((somma, riga) => somma + riga.loadPrice * riga.quantity, 0);
    const avgLoadPrice = totalQuantity > 0 ? weightedSum / totalQuantity : 0;
    const totalLoadValue = avgLoadPrice * totalQuantity;
    const currentValue = currentPrice * totalQuantity;
    const differenzaAttesa = currentValue - totalLoadValue;

    // La forma che «semplificando» si scriverebbe, algebricamente identica.
    const differenzaRaccolta = (currentPrice - avgLoadPrice) * totalQuantity;

    // Premessa del test, dichiarata invece che sperata: su questi ingressi le
    // due forme *non* coincidono. Senza questa riga il resto resterebbe verde
    // anche su una coppia di numeri per cui le due scritture danno lo stesso
    // bit, cioè avendo verificato nulla.
    expect(differenzaRaccolta).not.toBe(differenzaAttesa);
    expect(differenzaAttesa).toBe(-22474.7);
    expect(differenzaRaccolta).toBe(-22474.700000000004);

    const pnl = calcolaPnlDaCarico({ loads, currentPrice });

    expect(pnl.difference).toBe(differenzaAttesa);
    expect(pnl.difference).not.toBe(differenzaRaccolta);
    // Anche i due termini intermedi sono pinnati al bit: è da lì che la
    // differenza eredita il proprio ultimo bit, e riassociarli sposterebbe il
    // risultato senza toccare la riga della sottrazione.
    expect(pnl.currentValue).toBe(currentValue);
    expect(pnl.totalLoadValue).toBe(totalLoadValue);
    expect(pnl.avgLoadPrice).toBe(avgLoadPrice);
    // E la percentuale discende dalla differenza pinnata, non da un secondo
    // conto indipendente che potrebbe divergerne.
    expect(pnl.differencePercent).toBe((differenzaAttesa / totalLoadValue) * 100);
  });
});

describe('calcolaVariazionePeriodo', () => {
  const T0 = Date.UTC(2026, 0, 15);

  it('due rilevazioni: variazione disponibile, con valore, percentuale e giorni fra i due capi', () => {
    const esito = disponibile(
      calcolaVariazionePeriodo({
        punti: [
          punto(T0, 100, 'rilevazione'),
          punto(T0 + 30 * GIORNO_MS, 112.5, 'rilevazione'),
        ],
      }),
    );

    expect(esito.prima.price).toBe(100);
    expect(esito.ultima.price).toBe(112.5);
    expect(esito.valore).toBe(12.5);
    expect(esito.percentuale).toBe(12.5);
    expect(esito.giorni).toBe(30);
    expect(esito.rilevazioniComprese).toBe(2);
  });

  it('i carichi non contano: tre carichi e una sola rilevazione danno «non disponibile»', () => {
    // Un prezzo di carico dice quanto ha pagato *l'utente*, non a quanto il
    // mercato scambiava il titolo. Contarlo fra i capi misurerebbe le decisioni
    // di chi compra invece del movimento del titolo — e lo farebbe restituendo
    // un numero perfettamente plausibile, mai un errore. Qui la finestra ha
    // quattro punti in tutto e la variazione resta indisponibile: è la
    // conseguenza che la scheda deve dichiarare a schermo, spiegando perché.
    const punti = componiSerieTitolo({
      loads: [carico('2026-01-15', 61.4), carico('2026-02-10', 70.1), carico('2026-03-05', 76.1)],
      observations: [rilevazione('2026-03-20T17:35:00Z', 128.46)],
    });
    expect(punti).toHaveLength(4); // premessa: i punti ci sono, sono di origine sbagliata

    const esito = nonDisponibile(calcolaVariazionePeriodo({ punti }));

    expect(esito.rilevazioniComprese).toBe(1);
    expect(esito.unica).toEqual(punti[3]);
    expect(esito.unica?.origin).toBe('rilevazione');
    expect(esito.unica?.price).toBe(128.46);
  });

  it('nessuna rilevazione: non disponibile con zero rilevazioni comprese e nessuna «unica»', () => {
    // `unica` esiste per far scrivere alla scheda «una sola rilevazione, dal
    // …»: senza nemmeno quella non c'è nulla da citare, e il campo è `null`
    // invece di un punto di ripiego.
    const esito = nonDisponibile(
      calcolaVariazionePeriodo({ punti: [punto(T0, 61.4, 'carico')] }),
    );

    expect(esito.rilevazioniComprese).toBe(0);
    expect(esito.unica).toBeNull();

    // Finestra completamente vuota: stesso esito, nessuna eccezione.
    const suSerieVuota = nonDisponibile(calcolaVariazionePeriodo({ punti: [] }));
    expect(suSerieVuota.rilevazioniComprese).toBe(0);
    expect(suSerieVuota.unica).toBeNull();
  });

  it('due rilevazioni allo stesso prezzo: disponibile, con valore 0 e percentuale 0', () => {
    // Lo zero **misurato** non è l'assenza. Un titolo fermo per un mese è un
    // dato pieno — «0,00 %» è qui la risposta giusta — e va distinto dal caso
    // in cui il movimento non si può misurare affatto.
    //
    // Una guardia scritta `if (!valore)` (o `if (!percentuale)`, o un
    // `valore || null` di ripiego) romperebbe esattamente questo caso, e la
    // rottura sarebbe invisibile: un dato piatto reso come dato assente, senza
    // che nulla nella suite se ne accorga. Questo test è l'unico posto in cui
    // quella riscrittura diventa rossa.
    const esito = disponibile(
      calcolaVariazionePeriodo({
        punti: [
          punto(T0, 87.4, 'rilevazione'),
          punto(T0 + 31 * GIORNO_MS, 87.4, 'rilevazione'),
        ],
      }),
    );

    expect(esito.valore).toBe(0);
    expect(esito.percentuale).toBe(0);
    expect(esito.percentuale).not.toBeNull();
    expect(esito.rilevazioniComprese).toBe(2);
  });

  it('prima rilevazione a prezzo 0: percentuale null, mai Infinity, e valore comunque misurato', () => {
    // Partire da zero rende la variazione relativa indefinita, non infinita:
    // `12,5 / 0 × 100` vale `Infinity`, che si stamperebbe come «∞ %». Il
    // movimento assoluto resta invece un fatto osservato, e va mostrato.
    const esito = disponibile(
      calcolaVariazionePeriodo({
        punti: [
          punto(T0, 0, 'rilevazione'),
          punto(T0 + 7 * GIORNO_MS, 12.5, 'rilevazione'),
        ],
      }),
    );

    expect(esito.percentuale).toBeNull();
    expect(esito.valore).toBe(12.5);
    expect(esito.giorni).toBe(7);
  });

  it('i capi sono quelli dei punti ricevuti — già ritagliati — e le rilevazioni intermedie non entrano nel conto', () => {
    // Il contratto della funzione è che il ritaglio è già avvenuto: non
    // ritaglia e non riordina. Passarle la serie intera misurerebbe un periodo
    // diverso da quello disegnato a schermo, e nulla lo segnalerebbe — la
    // percentuale sotto il grafico si riferirebbe a una finestra che l'utente
    // non ha chiesto. Qui si percorre la pipeline vera (`ritagliaSerie` →
    // `calcolaVariazionePeriodo`) e si asserisce che l'esito dipenda dal
    // ritaglio.
    const GEN10 = Date.UTC(2026, 0, 10);
    const MAR01 = Date.UTC(2026, 2, 1);
    const APR15 = Date.UTC(2026, 3, 15);
    const MAG31 = Date.UTC(2026, 4, 31);
    const AGO01 = Date.UTC(2026, 7, 1);

    const serieIntera = [
      punto(GEN10, 90, 'rilevazione'), // fuori finestra, a sinistra
      punto(MAR01, 100, 'rilevazione'), // primo capo del ritaglio
      punto(APR15, 130, 'rilevazione'), // massimo intermedio: non è un capo
      punto(MAG31, 110, 'rilevazione'), // ultimo capo del ritaglio
      punto(AGO01, 200, 'rilevazione'), // fuori finestra, a destra
    ];

    const ritaglio = ritagliaSerie({ punti: serieIntera, finestra: { da: MAR01, a: MAG31 } });
    const esito = disponibile(calcolaVariazionePeriodo({ punti: ritaglio.punti }));

    expect(esito.prima).toEqual(punto(MAR01, 100, 'rilevazione'));
    expect(esito.ultima).toEqual(punto(MAG31, 110, 'rilevazione'));
    expect(esito.rilevazioniComprese).toBe(3); // i capi più l'intermedia
    // Il picco intermedio a 130 non sposta né il valore né la percentuale: la
    // misura è fra i due capi, non fra minimo e massimo del periodo.
    expect(esito.valore).toBe(10);
    expect(esito.percentuale).toBe(10);
    expect(esito.giorni).toBe(91); // 1º marzo → 31 maggio

    // La stessa serie *non* ritagliata dà un'altra misura (200 − 90 = 110):
    // premessa esplicita che il ritaglio conta, senza la quale il test sopra
    // resterebbe verde anche se la funzione ignorasse la finestra.
    const sullaSerieIntera = disponibile(calcolaVariazionePeriodo({ punti: serieIntera }));
    expect(sullaSerieIntera.valore).toBe(110);
    expect(sullaSerieIntera.valore).not.toBe(esito.valore);
  });

  it('un punto malformato non conta come rilevazione né contamina i capi', () => {
    // Un chiamante diverso dalla pipeline canonica potrebbe consegnare punti
    // già guasti. Una rilevazione a prezzo `NaN` scelta come capo renderebbe
    // `NaN` anche valore e percentuale: non un errore, una scheda che scrive
    // «NaN %».
    const esito = disponibile(
      calcolaVariazionePeriodo({
        punti: [
          punto(T0, Number.NaN, 'rilevazione'),
          punto(T0 + GIORNO_MS, 100, 'rilevazione'),
          punto(T0 + 2 * GIORNO_MS, 110, 'rilevazione'),
          punto(Number.POSITIVE_INFINITY, 120, 'rilevazione'),
        ],
      }),
    );

    expect(esito.rilevazioniComprese).toBe(2);
    expect(esito.prima.price).toBe(100);
    expect(esito.ultima.price).toBe(110);
    expect(Number.isFinite(esito.valore)).toBe(true);
    expect(esito.percentuale).toBe(10);
  });

  it('la soglia dichiarata è due: una rilevazione sotto la soglia, una sopra cambia esito', () => {
    // La costante è esportata perché la scheda ne scriva il motivo («servono
    // almeno due rilevazioni»): il testo a schermo e la guardia devono restare
    // lo stesso fatto, non due numeri scritti in due posti.
    expect(RILEVAZIONI_MINIME_VARIAZIONE).toBe(2);

    const rilevazioni = [
      punto(T0, 100, 'rilevazione'),
      punto(T0 + GIORNO_MS, 105, 'rilevazione'),
    ];

    const sotto = calcolaVariazionePeriodo({
      punti: rilevazioni.slice(0, RILEVAZIONI_MINIME_VARIAZIONE - 1),
    });
    const alla = calcolaVariazionePeriodo({
      punti: rilevazioni.slice(0, RILEVAZIONI_MINIME_VARIAZIONE),
    });

    expect(sotto.stato).toBe('non-disponibile');
    expect(alla.stato).toBe('disponibile');
  });
});
