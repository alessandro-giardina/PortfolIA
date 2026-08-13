/**
 * US-039 — la serie del **valore della posizione** e la quantità detenuta a una
 * data.
 *
 * Il peso sta qui e non negli E2E perché i quattro criteri sostanziali sono
 * aritmetici prima che visivi, e il guasto temuto è *plausibile*: una curva
 * costruita moltiplicando l'intera serie per la quantità posseduta oggi è più
 * liscia, più continua e più bella di quella giusta — e afferma che nel 2021 si
 * possedessero già le quote comprate nel 2023. Nessuna ispezione a occhio la
 * distinguerebbe, quindi la distinzione va scritta come conto.
 *
 * Quattro fatti, uno per criterio:
 *
 *  - la quantità applicata a ogni data è quella **detenuta a quella data**
 *    (criterio 3), estremi inclusi sul giorno del carico;
 *  - il gradino vale **esattamente** `prezzo di carico × quote nuove`, cioè il
 *    capitale versato (criterio 4), e i suoi due capi stanno sullo stesso istante
 *    nell'ordine giusto;
 *  - le rilevazioni anteriori al primo carico sono **escluse e contate**, mai
 *    portate a zero: una posizione che non esiste non vale zero;
 *  - il prezzo medio di carico non entra nel dominio Y della vista valore
 *    (criterio 5), che è verificato accanto alle due generalizzazioni in
 *    `serieTitolo.test.ts`.
 *
 * Nessun accesso a rete o archivio, nessun orologio: le funzioni sono pure e
 * `now` arriva sempre come argomento.
 */
import { describe, it, expect } from 'vitest';
import {
  VISTE_GRAFICO,
  VISTA_PREDEFINITA,
  calcolaFinestra,
  componiSerieTitolo,
  componiSerieValore,
  definizioneVista,
  primaDetenzione,
  quantitaDetenutaA,
  ritagliaSerie,
  type CaricoValore,
  type PuntoSerie,
  type PuntoValore,
  type RilevazioneSerie,
  type VenditaValore,
} from '@portfolia/shared';

/** Un carico, con i tre campi che la serie del valore legge. */
const carico = (loadDate: string, loadPrice: number, quantity: number): CaricoValore => ({
  loadDate,
  loadPrice,
  quantity,
});

/** Una vendita, con i due soli campi che la serie del valore legge. */
const vendita = (saleDate: string, quantity: number): VenditaValore => ({
  saleDate,
  quantity,
});

/** Una rilevazione. `observedAt` è in unix **secondi**, come in archivio. */
const rilevazione = (istanteIso: string, price: number): RilevazioneSerie => ({
  price,
  observedAt: Date.parse(istanteIso) / 1000,
});

/** L'istante di una data civile, ancorato a mezzanotte UTC come i carichi. */
const giorno = (dataCivile: string): number => Date.parse(`${dataCivile}T00:00:00Z`);

/**
 * Lo scenario dei mockup, che è anche il secondo caso della spec: due carichi a
 * prezzi e quantità **diversi** — a quantità uguali il gradino non
 * dimostrerebbe la ponderazione — e due rilevazioni recenti.
 *
 * I cinque prodotti attesi sono esatti in virgola mobile (4.672 · 5.696 · 14.240
 * · 25.380 · 25.692), il che rende lecito asserirli con `toBe`: dove non lo
 * fossero, un `toBe` sarebbe un test che fallisce per l'ultimo bit invece che per
 * un difetto.
 */
const CARICHI = [carico('2021-09-19', 58.4, 80), carico('2023-03-04', 71.2, 120)];
const RILEVAZIONI = [
  rilevazione('2026-08-07T09:00:00Z', 126.9),
  rilevazione('2026-08-10T09:00:00Z', 128.46),
];

/** La serie del prezzo da cui la serie del valore si compone, mai riletta a parte. */
function serieDiPrezzo(
  loads: readonly CaricoValore[] = CARICHI,
  observations: readonly RilevazioneSerie[] = RILEVAZIONI,
): PuntoSerie[] {
  return componiSerieTitolo({ loads, observations });
}

describe('VISTE_GRAFICO, VISTA_PREDEFINITA, definizioneVista', () => {
  it('le due viste sono il prezzo unitario e il valore della posizione, in quest’ordine', () => {
    expect(VISTE_GRAFICO.map((v) => v.id)).toEqual(['prezzo', 'valore']);
  });

  it('la vista predefinita all’apertura della scheda è il prezzo unitario (criterio 2)', () => {
    expect(VISTA_PREDEFINITA).toBe('prezzo');
    expect(VISTE_GRAFICO[0].id).toBe(VISTA_PREDEFINITA);
  });

  it('ogni vista dichiara la propria ordinata: nessuna cifra resta ambigua a schermo', () => {
    for (const vista of VISTE_GRAFICO) {
      expect(vista.etichetta.length).toBeGreaterThan(0);
      expect(vista.didascalia.length).toBeGreaterThan(0);
      expect(vista.ordinata.length).toBeGreaterThan(0);
    }
    expect(definizioneVista('valore').didascalia).toContain('CONTROVALORE');
    expect(definizioneVista('prezzo').didascalia).toContain('QUOTA');
  });

  it('un identificativo ignoto ripiega sulla vista del prezzo, non su un controvalore muto', () => {
    expect(definizioneVista('inesistente' as never).id).toBe('prezzo');
  });
});

describe('quantitaDetenutaA', () => {
  it('prima del primo carico la quantità è zero: la posizione non esiste ancora', () => {
    expect(quantitaDetenutaA(CARICHI, [], giorno('2021-09-18'))).toBe(0);
    expect(quantitaDetenutaA(CARICHI, [], giorno('2010-01-01'))).toBe(0);
  });

  it('il giorno **stesso** del carico le quote sono già detenute (estremo incluso)', () => {
    expect(quantitaDetenutaA(CARICHI, [], giorno('2021-09-19'))).toBe(80);
    expect(quantitaDetenutaA(CARICHI, [], giorno('2023-03-04'))).toBe(200);
  });

  it('fra i due carichi vale il solo primo: i carichi successivi non retroagiscono', () => {
    expect(quantitaDetenutaA(CARICHI, [], giorno('2022-06-01'))).toBe(80);
    expect(quantitaDetenutaA(CARICHI, [], giorno('2023-03-03'))).toBe(80);
  });

  it('dopo l’ultimo carico vale la somma di tutti', () => {
    expect(quantitaDetenutaA(CARICHI, [], giorno('2026-08-10'))).toBe(200);
  });

  it('più carichi nello stesso giorno si sommano, e valgono già quel giorno', () => {
    const stessoGiorno = [carico('2024-02-01', 10, 30), carico('2024-02-01', 12, 45)];
    expect(quantitaDetenutaA(stessoGiorno, [], giorno('2024-01-31'))).toBe(0);
    expect(quantitaDetenutaA(stessoGiorno, [], giorno('2024-02-01'))).toBe(75);
  });

  it('l’ordine d’ingresso dei carichi non cambia l’esito', () => {
    const invertiti = [...CARICHI].reverse();
    for (const data of ['2021-09-18', '2021-09-19', '2022-06-01', '2023-03-04', '2026-01-01']) {
      expect(quantitaDetenutaA(invertiti, [], giorno(data))).toBe(
        quantitaDetenutaA(CARICHI, [], giorno(data)),
      );
    }
  });

  it('un carico con data malformata viene ignorato, non trasformato in NaN', () => {
    const conRifiuto = [...CARICHI, carico('non-una-data', 12, 999)];
    expect(quantitaDetenutaA(conRifiuto, [], giorno('2026-01-01'))).toBe(200);
  });

  it('una quantità non finita viene ignorata invece di avvelenare la somma', () => {
    const conRifiuto = [...CARICHI, carico('2024-01-01', 12, Number.NaN)];
    expect(quantitaDetenutaA(conRifiuto, [], giorno('2026-01-01'))).toBe(200);
  });

  it('un istante non finito dà zero, mai NaN', () => {
    expect(quantitaDetenutaA(CARICHI, [], Number.NaN)).toBe(0);
  });
});

describe('quantitaDetenutaA — le vendite (US-045)', () => {
  it('una vendita fra due carichi riduce la quantità dalla sua data in poi', () => {
    const vendite = [vendita('2022-01-15', 30)];

    // Prima della vendita: solo il primo carico, la vendita non ha ancora agito.
    expect(quantitaDetenutaA(CARICHI, vendite, giorno('2022-01-14'))).toBe(80);
    // Il giorno stesso: l'estremo è incluso, come per i carichi.
    expect(quantitaDetenutaA(CARICHI, vendite, giorno('2022-01-15'))).toBe(50);
    // Fra la vendita e il secondo carico la riduzione resta.
    expect(quantitaDetenutaA(CARICHI, vendite, giorno('2022-06-01'))).toBe(50);
    // Dopo il secondo carico: la somma dei carichi meno la vendita.
    expect(quantitaDetenutaA(CARICHI, vendite, giorno('2026-01-01'))).toBe(170);
  });

  it('carichi e vendite interlacciati non in ordine cronologico di iscrizione danno la quantità corretta a ogni checkpoint', () => {
    // L'ordine d'ingresso non è l'ordine delle date: il secondo carico e la
    // seconda vendita sono iscritti prima dei rispettivi antecedenti.
    const loadsFuoriOrdine = [
      carico('2023-03-04', 71.2, 120),
      carico('2021-09-19', 58.4, 80),
    ];
    const venditeFuoriOrdine = [vendita('2023-06-01', 50), vendita('2022-01-15', 30)];

    const checkpoint = (dataCivile: string): number =>
      quantitaDetenutaA(loadsFuoriOrdine, venditeFuoriOrdine, giorno(dataCivile));

    expect(checkpoint('2021-09-18')).toBe(0);
    expect(checkpoint('2021-09-19')).toBe(80);
    expect(checkpoint('2022-01-15')).toBe(50);
    expect(checkpoint('2023-03-04')).toBe(170);
    expect(checkpoint('2023-06-01')).toBe(120);
    expect(checkpoint('2026-01-01')).toBe(120);
  });

  it('una vendita totale porta la quantità a zero dalla sua data in poi, e la mantiene', () => {
    const venditaTotale = [vendita('2024-01-01', 200)];

    expect(quantitaDetenutaA(CARICHI, venditaTotale, giorno('2023-12-31'))).toBe(200);
    expect(quantitaDetenutaA(CARICHI, venditaTotale, giorno('2024-01-01'))).toBe(0);
    expect(quantitaDetenutaA(CARICHI, venditaTotale, giorno('2026-08-10'))).toBe(0);
  });

  it('un carico e una vendita nello stesso giorno: l’estremo incluso vale per entrambi', () => {
    const soloCarico = [carico('2022-05-01', 10, 50)];
    const venditaStessoGiorno = [vendita('2022-05-01', 20)];

    // Il giorno prima del carico la posizione non esiste ancora.
    expect(quantitaDetenutaA(soloCarico, venditaStessoGiorno, giorno('2022-04-30'))).toBe(0);
    // Il giorno stesso: sia il carico sia la vendita sono già inclusi.
    expect(quantitaDetenutaA(soloCarico, venditaStessoGiorno, giorno('2022-05-01'))).toBe(30);
  });

  it('una vendita con data malformata viene ignorata, non trasformata in NaN', () => {
    const conRifiuto = [vendita('non-una-data', 999)];
    expect(quantitaDetenutaA(CARICHI, conRifiuto, giorno('2026-01-01'))).toBe(200);
  });

  it('una vendita con quantità non finita viene ignorata invece di avvelenare la sottrazione', () => {
    const conRifiuto = [vendita('2024-01-01', Number.NaN)];
    expect(quantitaDetenutaA(CARICHI, conRifiuto, giorno('2026-01-01'))).toBe(200);
  });
});

describe('primaDetenzione', () => {
  it('è la data del primo carico, qualunque sia l’ordine d’ingresso', () => {
    expect(primaDetenzione(CARICHI)).toBe(giorno('2021-09-19'));
    expect(primaDetenzione([...CARICHI].reverse())).toBe(giorno('2021-09-19'));
  });

  it('è null senza alcun carico valido: la serie del valore non esiste per nessuna finestra', () => {
    expect(primaDetenzione([])).toBeNull();
    expect(primaDetenzione([carico('non-una-data', 10, 5)])).toBeNull();
  });
});

describe('componiSerieValore — la quantità non retroagisce (criterio 3)', () => {
  it('ogni punto porta la quantità detenuta alla **sua** data, non quella finale', () => {
    const { punti } = componiSerieValore({ punti: serieDiPrezzo(), loads: CARICHI, sales: [] });

    expect(punti.map((p) => p.quantita)).toEqual([80, 80, 200, 200, 200]);
    expect(punti.map((p) => p.price)).toEqual([4672, 5696, 14240, 25380, 25692]);
  });

  it('il punto del primo carico vale 80 × 58,40 e **non** 200 × 58,40: la scorciatoia è esclusa', () => {
    const { punti } = componiSerieValore({ punti: serieDiPrezzo(), loads: CARICHI, sales: [] });

    expect(punti[0].price).toBe(4672);
    expect(punti[0].price).not.toBe(11680);
  });

  it('il punto immediatamente precedente al secondo carico porta la sola quantità del primo', () => {
    const conRilevazioneInMezzo = serieDiPrezzo(CARICHI, [
      rilevazione('2022-06-01T09:00:00Z', 64),
      ...RILEVAZIONI,
    ]);
    const { punti } = componiSerieValore({ punti: conRilevazioneInMezzo, loads: CARICHI, sales: [] });

    const inMezzo = punti.find((p) => p.at === Date.parse('2022-06-01T09:00:00Z'));
    expect(inMezzo?.quantita).toBe(80);
    expect(inMezzo?.price).toBe(64 * 80);
  });

  it('ogni punto conserva il prezzo unitario da cui il controvalore discende', () => {
    const { punti } = componiSerieValore({ punti: serieDiPrezzo(), loads: CARICHI, sales: [] });

    for (const punto of punti) {
      expect(punto.price).toBeCloseTo(punto.prezzoUnitario * punto.quantita, 8);
    }
    expect(punti.map((p) => p.prezzoUnitario)).toEqual([58.4, 71.2, 71.2, 126.9, 128.46]);
  });

  it('la quantità finale è la somma dei carichi', () => {
    const serie = componiSerieValore({ punti: serieDiPrezzo(), loads: CARICHI, sales: [] });
    expect(serie.quantitaFinale).toBe(200);
  });
});

describe('componiSerieValore — il gradino è capitale versato (criterio 4)', () => {
  it('il salto vale esattamente prezzo di carico × quote nuove', () => {
    const { gradini } = componiSerieValore({ punti: serieDiPrezzo(), loads: CARICHI, sales: [] });

    expect(gradini).toHaveLength(1);
    const gradino = gradini[0];
    expect(gradino.at).toBe(giorno('2023-03-04'));
    expect(gradino.quoteAggiunte).toBe(120);
    expect(gradino.prezzoCarico).toBe(71.2);
    expect(gradino.capitaleVersato).toBe(71.2 * 120);
    expect(gradino.capitaleVersato).toBe(8544);
  });

  it('l’altezza del gradino è la differenza dei suoi due capi, per costruzione', () => {
    const { gradini } = componiSerieValore({ punti: serieDiPrezzo(), loads: CARICHI, sales: [] });
    const gradino = gradini[0];

    expect(gradino.valorePrima).toBe(5696);
    expect(gradino.valoreDopo).toBe(14240);
    expect(gradino.capitaleVersato).toBe(gradino.valoreDopo - gradino.valorePrima);
  });

  it('i due capi stanno sullo **stesso istante**, nell’ordine ante → post', () => {
    const { punti } = componiSerieValore({ punti: serieDiPrezzo(), loads: CARICHI, sales: [] });
    const capi = punti.filter((p) => p.capo !== null);

    expect(capi).toHaveLength(2);
    expect(capi[0].capo).toBe('ante');
    expect(capi[1].capo).toBe('post');
    expect(capi[0].at).toBe(capi[1].at);
    expect(capi[0].at).toBe(giorno('2023-03-04'));
    expect(capi[0].price).toBeLessThan(capi[1].price);
    // I due capi rimandano allo stesso gradino, non a due copie che potrebbero
    // divergere: la quota disegnata e il cartellino sotto leggono un solo fatto.
    expect(capi[0].gradino).toBe(capi[1].gradino);
  });

  it('il capo ante porta la quantità precedente, il capo post quella nuova', () => {
    const { punti } = componiSerieValore({ punti: serieDiPrezzo(), loads: CARICHI, sales: [] });
    const [ante, post] = punti.filter((p) => p.capo !== null);

    expect(ante.quantita).toBe(80);
    expect(post.quantita).toBe(200);
    expect(ante.prezzoUnitario).toBe(post.prezzoUnitario);
  });

  it('il primo carico **non** è un gradino: è l’origine della serie', () => {
    const { punti, gradini } = componiSerieValore({
      punti: serieDiPrezzo(CARICHI.slice(0, 1), []),
      loads: CARICHI.slice(0, 1),
      sales: [],
    });

    expect(gradini).toHaveLength(0);
    expect(punti).toHaveLength(1);
    expect(punti[0].capo).toBeNull();
    expect(punti[0].gradino).toBeNull();
    // Nessun punto a valore zero il giorno prima: schiaccerebbe per sempre il
    // dominio Y sullo zero per mostrare un salto che è solo l'inizio della storia.
    expect(punti.every((p) => p.price > 0)).toBe(true);
  });

  it('tre carichi producono due gradini, ciascuno col proprio capitale versato', () => {
    const tre = [...CARICHI, carico('2024-05-06', 90, 50)];
    const { gradini } = componiSerieValore({ punti: serieDiPrezzo(tre, RILEVAZIONI), loads: tre, sales: [] });

    expect(gradini.map((g) => g.quoteAggiunte)).toEqual([120, 50]);
    expect(gradini.map((g) => g.capitaleVersato)).toEqual([71.2 * 120, 90 * 50]);
  });

  it('un carico che non aggiunge quantità non produce alcun gradino', () => {
    const conZero = [...CARICHI, carico('2024-05-06', 90, 0)];
    const { gradini } = componiSerieValore({
      punti: serieDiPrezzo(conZero, RILEVAZIONI),
      loads: conZero,
      sales: [],
    });

    expect(gradini).toHaveLength(1);
  });
});

describe('componiSerieValore — i punti anteriori alla prima detenzione (criterio 3)', () => {
  it('le rilevazioni anteriori al primo carico sono escluse e contate, mai portate a zero', () => {
    const anteriori = [
      rilevazione('2021-05-03T09:00:00Z', 50),
      rilevazione('2021-07-01T09:00:00Z', 54),
      rilevazione('2021-08-12T09:00:00Z', 56),
      ...RILEVAZIONI,
    ];
    const serie = componiSerieValore({ punti: serieDiPrezzo(CARICHI, anteriori), loads: CARICHI, sales: [] });

    expect(serie.puntiEsclusi).toBe(3);
    expect(serie.primaDetenzione).toBe(giorno('2021-09-19'));
    expect(serie.punti.every((p) => p.at >= giorno('2021-09-19'))).toBe(true);
    expect(serie.punti.some((p) => p.price === 0)).toBe(false);
  });

  it('una rilevazione **il giorno stesso** del primo carico non è anteriore: entra nella serie', () => {
    const stessoGiorno = [rilevazione('2021-09-19T15:00:00Z', 59), ...RILEVAZIONI];
    const serie = componiSerieValore({
      punti: serieDiPrezzo(CARICHI, stessoGiorno),
      loads: CARICHI,
      sales: [],
    });

    expect(serie.puntiEsclusi).toBe(0);
    expect(serie.punti.some((p) => p.price === 59 * 80)).toBe(true);
  });

  it('senza alcun carico la serie è vuota e la ragione è dichiarata, non dedotta', () => {
    const serie = componiSerieValore({ punti: serieDiPrezzo([], RILEVAZIONI), loads: [], sales: [] });

    expect(serie.punti).toEqual([]);
    expect(serie.gradini).toEqual([]);
    expect(serie.ragioneVuota).toBe('senza-carichi');
    expect(serie.primaDetenzione).toBeNull();
    expect(serie.quantitaFinale).toBe(0);
    // I due punti di prezzo esistono e restano contati: l'archivio conosce i
    // prezzi, non conosce alcuna quantità.
    expect(serie.puntiEsclusi).toBe(2);
  });

  it('con carichi ma nessun punto utilizzabile la ragione è «senza-punti», non «senza-carichi»', () => {
    // Il carico ha prezzo non finito: `componiSerieTitolo` ne scarta il punto,
    // ma la quantità resta detenuta. La serie del valore non ha nulla da
    // moltiplicare, e lo dice con la ragione giusta.
    const soloRifiuti = [carico('2021-09-19', Number.NaN, 80)];
    const serie = componiSerieValore({
      punti: serieDiPrezzo(soloRifiuti, []),
      loads: soloRifiuti,
      sales: [],
    });

    expect(serie.punti).toEqual([]);
    expect(serie.ragioneVuota).toBe('senza-punti');
    expect(serie.primaDetenzione).toBe(giorno('2021-09-19'));
  });

  it('a serie piena la ragione è null: nessun caso limite dichiarato per errore', () => {
    const serie = componiSerieValore({ punti: serieDiPrezzo(), loads: CARICHI, sales: [] });
    expect(serie.ragioneVuota).toBeNull();
    expect(serie.puntiEsclusi).toBe(0);
  });
});

describe('componiSerieValore — la vendita totale (US-045)', () => {
  // Cade fra le due rilevazioni della serie standard (2026-08-07 e
  // 2026-08-10): un checkpoint su ciascun lato della vendita.
  const VENDITA_TOTALE = [vendita('2026-08-08', 200)];

  it('dopo una vendita totale i punti successivi compaiono a price:0 senza incrementare puntiEsclusi', () => {
    const serie = componiSerieValore({ punti: serieDiPrezzo(), loads: CARICHI, sales: VENDITA_TOTALE });
    const dopo = serie.punti.filter((p) => p.at >= giorno('2026-08-08'));

    expect(dopo).toHaveLength(1);
    expect(dopo.every((p) => p.quantita === 0)).toBe(true);
    expect(dopo.every((p) => p.price === 0)).toBe(true);
    // Il punto non è scartato — è un dato legittimo, non un'esclusione: il
    // conteggio non deve confondere «posizione azzerata» con «punto anteriore
    // alla prima detenzione».
    expect(serie.puntiEsclusi).toBe(0);
  });

  it('i punti anteriori alla vendita restano al valore pieno, non influenzati dal residuo futuro', () => {
    const serie = componiSerieValore({ punti: serieDiPrezzo(), loads: CARICHI, sales: VENDITA_TOTALE });
    const prima = serie.punti.filter((p) => p.at < giorno('2026-08-08'));

    expect(prima.map((p) => p.price)).toEqual([4672, 5696, 14240, 25380]);
    expect(prima.every((p) => p.quantita > 0)).toBe(true);
  });

  it('quantitaFinale riflette il residuo dopo la vendita, non la somma dei soli carichi', () => {
    const serie = componiSerieValore({ punti: serieDiPrezzo(), loads: CARICHI, sales: VENDITA_TOTALE });
    expect(serie.quantitaFinale).toBe(0);
  });

  it('una vendita parziale lascia un residuo positivo, non uno zero', () => {
    const venditaParziale = [vendita('2026-08-08', 50)];
    const serie = componiSerieValore({ punti: serieDiPrezzo(), loads: CARICHI, sales: venditaParziale });
    const dopo = serie.punti.filter((p) => p.at >= giorno('2026-08-08'));

    expect(dopo.every((p) => p.quantita === 150)).toBe(true);
    expect(serie.quantitaFinale).toBe(150);
    expect(serie.puntiEsclusi).toBe(0);
  });
});

describe('componiSerieValore — guardie e ordine', () => {
  it('un punto malformato non entra e non viene contato fra gli esclusi', () => {
    const malformati: PuntoSerie[] = [
      { at: Number.NaN, price: 10, origin: 'rilevazione' },
      { at: giorno('2024-01-01'), price: Number.POSITIVE_INFINITY, origin: 'rilevazione' },
      ...serieDiPrezzo(),
    ];
    const serie = componiSerieValore({ punti: malformati, loads: CARICHI, sales: [] });

    expect(serie.punti).toHaveLength(5);
    expect(serie.puntiEsclusi).toBe(0);
    expect(serie.punti.every((p) => Number.isFinite(p.price) && Number.isFinite(p.at))).toBe(true);
  });

  it('la serie non viene riordinata: gli istanti restano non decrescenti e nell’ordine d’origine', () => {
    const { punti } = componiSerieValore({ punti: serieDiPrezzo(), loads: CARICHI, sales: [] });

    for (let i = 1; i < punti.length; i++) {
      expect(punti[i].at).toBeGreaterThanOrEqual(punti[i - 1].at);
    }
    expect(punti.map((p) => p.at)).toEqual([
      giorno('2021-09-19'),
      giorno('2023-03-04'),
      giorno('2023-03-04'),
      Date.parse('2026-08-07T09:00:00Z'),
      Date.parse('2026-08-10T09:00:00Z'),
    ]);
  });

  it('ogni punto conserva l’origine d’archivio del punto di prezzo da cui discende', () => {
    const { punti } = componiSerieValore({ punti: serieDiPrezzo(), loads: CARICHI, sales: [] });
    expect(punti.map((p) => p.origin)).toEqual([
      'carico',
      'carico',
      'carico',
      'rilevazione',
      'rilevazione',
    ]);
  });

  it('la funzione è pura: due chiamate sugli stessi ingressi danno lo stesso esito', () => {
    const punti = serieDiPrezzo();
    const prima = componiSerieValore({ punti, loads: CARICHI, sales: [] });
    const seconda = componiSerieValore({ punti, loads: CARICHI, sales: [] });

    expect(seconda).toEqual(prima);
    // E la serie del prezzo non viene toccata: le due viste leggono lo stesso array.
    expect(punti).toEqual(serieDiPrezzo());
  });
});

describe('componiSerieValore + ritagliaSerie — la retroattività in forma ritagliata', () => {
  /** Una finestra che comincia **dopo** il primo carico, il caso che il difetto adora. */
  const FINESTRA = { da: giorno('2024-01-01'), a: giorno('2026-08-11') };

  it('una finestra posteriore al primo carico applica comunque la quantità piena', () => {
    const serie = componiSerieValore({ punti: serieDiPrezzo(), loads: CARICHI, sales: [] });
    const ritaglio = ritagliaSerie({ punti: serie.punti, finestra: FINESTRA });

    expect(ritaglio.punti.map((p) => p.quantita)).toEqual([200, 200]);
    expect(ritaglio.punti.map((p) => p.price)).toEqual([25380, 25692]);
  });

  it('comporre sui soli carichi caduti in finestra dimenticherebbe le quote: è il difetto, e non accade', () => {
    // La composizione *sbagliata*: si ritaglia prima e si compone poi, cioè si
    // guarda la finestra invece della posizione. Il confronto è il test.
    const ritaglioPrezzo = ritagliaSerie({ punti: serieDiPrezzo(), finestra: FINESTRA });
    const carichiInFinestra = CARICHI.filter(
      (c) => Date.parse(`${c.loadDate}T00:00:00Z`) >= FINESTRA.da,
    );
    const sbagliata = componiSerieValore({
      punti: ritaglioPrezzo.punti,
      loads: carichiInFinestra,
      sales: [],
    });

    expect(carichiInFinestra).toHaveLength(0);
    expect(sbagliata.punti).toHaveLength(0);

    // La composizione giusta — serie intera, carichi interi, ritaglio *dopo* —
    // conserva le 200 quote.
    const giusta = ritagliaSerie({
      punti: componiSerieValore({ punti: serieDiPrezzo(), loads: CARICHI, sales: [] }).punti,
      finestra: FINESTRA,
    });
    expect(giusta.punti).toHaveLength(2);
    expect(giusta.punti.every((p) => p.quantita === 200)).toBe(true);
  });

  it('il ritaglio conserva i campi del punto valore: quantità, prezzo unitario, gradino e capo', () => {
    const serie = componiSerieValore({ punti: serieDiPrezzo(), loads: CARICHI, sales: [] });
    const ritaglio = ritagliaSerie({
      punti: serie.punti,
      finestra: { da: giorno('2023-01-01'), a: giorno('2026-08-11') },
    });

    const capi = ritaglio.punti.filter((p: PuntoValore) => p.capo !== null);
    expect(capi).toHaveLength(2);
    expect(capi[0].gradino?.capitaleVersato).toBe(8544);
    expect(capi[1].quantita).toBe(200);
    expect(capi[1].prezzoUnitario).toBe(71.2);
  });

  it('la finestra della scala si calcola sulla serie del **prezzo**: commutare la vista non la muove', () => {
    const prezzoIntero = serieDiPrezzo();
    const valore = componiSerieValore({ punti: prezzoIntero, loads: CARICHI, sales: [] }).punti;
    const now = Date.parse('2026-08-11T10:00:00Z');

    // La stessa scala, gli stessi punti d'ingresso: la finestra non dipende da
    // quale grandezza la curva stia tracciando, e il criterio 1 lo esige.
    const finestra = calcolaFinestra({ scala: 'anno', punti: prezzoIntero, now });
    expect(calcolaFinestra({ scala: 'anno', punti: valore, now })).toEqual(finestra);
  });
});
