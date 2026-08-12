/**
 * US-036 — la serie di prezzo del singolo titolo e il dominio dei suoi assi.
 *
 * Due assi di verifica, e in entrambi il guasto temuto è *silenzioso*.
 *
 * Il primo è la composizione: fondere due elenchi di granularità diversa — la
 * data civile del carico, l'istante unix al secondo della rilevazione — in una
 * sola serie ordinata. Sbagliare l'unità o il fuso non produce un errore ma un
 * punto spostato di un giorno (o di 56 anni, dimenticando il ×1000), e nessuno
 * guarda un grafico con il sospetto che l'ascissa sia sbagliata.
 *
 * Il secondo è la scala: una coordinata `NaN` o `Infinity` non solleva
 * eccezioni, produce un `path` SVG che non disegna nulla — un grafico
 * *invisibile*, indistinguibile da un dato assente. I casi degeneri sono quindi
 * provati uno per uno, e su ciascuno si asserisce che tutte e quattro le
 * coordinate siano finite.
 *
 * Nessun accesso a rete o archivio, e nessun orologio reale: `now` è sempre un
 * istante fissato qui. Le due funzioni sono pure, e il criterio «la costruzione
 * del grafico non genera alcuna richiesta alla fonte» è provato dalla firma.
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  componiSerieTitolo,
  calcolaScalaSerie,
  giornoCivilePunto,
  calcolaFinestra,
  ritagliaSerie,
  SCALE_TEMPORALI,
  SCALA_PREDEFINITA,
  definizioneScala,
  type CaricoSerie,
  type RilevazioneSerie,
  type PuntoSerie,
  type ScalaSerie,
  type OriginePunto,
  type ScalaTemporale,
  type FinestraTemporale,
} from '@portfolia/shared';

const GIORNO_MS = 24 * 60 * 60 * 1000;

/** Un carico, ridotto ai due campi che la serie legge. */
const carico = (loadDate: string, loadPrice: number): CaricoSerie => ({ loadDate, loadPrice });

/**
 * Una rilevazione. `observedAt` è in unix **secondi** (come in archivio e nella
 * risposta di `/detail`): la conversione a millisecondi è ciò che si prova.
 */
const rilevazione = (istanteIso: string, price: number): RilevazioneSerie => ({
  price,
  observedAt: Date.parse(istanteIso) / 1000,
});

/** Un punto già composto, per i test sulla scala. */
const punto = (at: number, price: number, origin: OriginePunto): PuntoSerie => ({
  at,
  price,
  origin,
});

describe('componiSerieTitolo', () => {
  it('due carichi e due rilevazioni diventano quattro punti crescenti, ciascuno con la propria origine', () => {
    // Le rilevazioni arrivano dalla più recente alla più antica, come le
    // consegna `GET /detail` (`observed_at DESC`): l'ordine d'uscita non deve
    // dipendere dall'ordine d'ingresso.
    const serie = componiSerieTitolo({
      loads: [carico('2026-01-15', 10.5), carico('2026-03-02', 12.25)],
      observations: [
        rilevazione('2026-04-01T09:30:00Z', 13.75),
        rilevazione('2026-02-01T10:00:00Z', 11),
      ],
    });

    expect(serie).toEqual([
      { at: Date.UTC(2026, 0, 15), price: 10.5, origin: 'carico' },
      { at: Date.UTC(2026, 1, 1, 10, 0, 0), price: 11, origin: 'rilevazione' },
      { at: Date.UTC(2026, 2, 2), price: 12.25, origin: 'carico' },
      { at: Date.UTC(2026, 3, 1, 9, 30, 0), price: 13.75, origin: 'rilevazione' },
    ]);
  });

  it('senza rilevazioni la serie è quella dei soli carichi', () => {
    const serie = componiSerieTitolo({
      loads: [carico('2026-03-02', 12.25), carico('2026-01-15', 10.5)],
      observations: [],
    });

    expect(serie).toEqual([
      { at: Date.UTC(2026, 0, 15), price: 10.5, origin: 'carico' },
      { at: Date.UTC(2026, 2, 2), price: 12.25, origin: 'carico' },
    ]);
  });

  it('senza carichi né rilevazioni la serie è vuota, non un errore', () => {
    expect(componiSerieTitolo({ loads: [], observations: [] })).toEqual([]);
  });

  it('carico e rilevazione nello stesso istante: prima il carico, il fatto anteriore della giornata', () => {
    const mezzanotte = Date.UTC(2026, 0, 15);
    const serie = componiSerieTitolo({
      loads: [carico('2026-01-15', 10)],
      observations: [{ price: 11, observedAt: mezzanotte / 1000 }],
    });

    expect(serie.map((p) => p.origin)).toEqual(['carico', 'rilevazione']);
    expect(serie.map((p) => p.at)).toEqual([mezzanotte, mezzanotte]);
  });

  it('due rilevazioni nello stesso istante restano ordinate per prezzo, qualunque sia l’ordine d’ingresso', () => {
    // Il terzo criterio di ordinamento non serve a leggere il grafico: serve a
    // renderlo deterministico. Senza di esso la stessa scheda si disegnerebbe
    // in due modi a seconda dell'ordine con cui l'archivio ha risposto.
    const istante = Date.UTC(2026, 5, 30, 15, 0, 0);
    const alta: RilevazioneSerie = { price: 12, observedAt: istante / 1000 };
    const bassa: RilevazioneSerie = { price: 9, observedAt: istante / 1000 };

    const crescente = componiSerieTitolo({ loads: [], observations: [bassa, alta] });
    const decrescente = componiSerieTitolo({ loads: [], observations: [alta, bassa] });

    expect(crescente.map((p) => p.price)).toEqual([9, 12]);
    expect(decrescente).toEqual(crescente);
  });

  it('una data di carico malformata viene scartata, non trasformata in un istante NaN', () => {
    const serie = componiSerieTitolo({
      loads: [
        carico('non-una-data', 10),
        carico('15/01/2026', 10), // formato italiano: non è una data ISO
        carico('2026-01-15', 11),
      ],
      observations: [],
    });

    expect(serie).toEqual([{ at: Date.UTC(2026, 0, 15), price: 11, origin: 'carico' }]);
    // Ridondante rispetto alla riga sopra, ma dichiara il guasto evitato: un
    // punto con `at` NaN non spezza il disegno, lo rende invisibile.
    expect(serie.every((p) => Number.isFinite(p.at))).toBe(true);
  });

  it('un prezzo non finito viene scartato invece di entrare nella serie', () => {
    const serie = componiSerieTitolo({
      loads: [carico('2026-01-15', Number.NaN)],
      observations: [
        { price: Number.POSITIVE_INFINITY, observedAt: Date.UTC(2026, 1, 1) / 1000 },
        { price: 11, observedAt: Date.UTC(2026, 1, 2) / 1000 },
      ],
    });

    expect(serie).toEqual([{ at: Date.UTC(2026, 1, 2), price: 11, origin: 'rilevazione' }]);
  });
});

/**
 * Il fuso dell'host non deve entrare nel risultato.
 *
 * La conversione è in UTC **per costruzione** (`Date.parse(`…T00:00:00Z`)`), ma
 * «per costruzione» è un'affermazione sul codice di oggi: questi test la
 * verificano sul comportamento, eseguendo lo stesso caso ai due estremi opposti
 * del planisfero. Se qualcuno reintroducesse `new Date(anno, mese, giorno)` —
 * il costruttore che interpreta i campi nel fuso della macchina — il carico
 * slitterebbe di 14 ore a est e di 11 a ovest, e queste asserzioni cadrebbero.
 */
describe('componiSerieTitolo — indipendenza dal fuso dell’host', () => {
  /** +14:00 e -11:00: i due estremi opposti, a 25 ore di distanza civile. */
  const FUSI = ['UTC', 'Pacific/Kiritimati', 'Pacific/Niue'] as const;

  const fusoOriginale = process.env.TZ;

  afterEach(() => {
    // Il fuso è stato globale: lasciarlo alterato falserebbe ogni altro file.
    if (fusoOriginale === undefined) delete process.env.TZ;
    else process.env.TZ = fusoOriginale;
  });

  it('il fuso della macchina cambia davvero a runtime: le prove che seguono non sono vacue', () => {
    // Senza questa premessa i test sotto resterebbero verdi anche se
    // `process.env.TZ` non avesse effetto in questo runtime: passerebbero non
    // avendo verificato nulla.
    process.env.TZ = 'Pacific/Kiritimati';
    const aEst = new Date(Date.UTC(2026, 0, 15)).getDate();
    process.env.TZ = 'Pacific/Niue';
    const aOvest = new Date(Date.UTC(2026, 0, 15)).getDate();

    expect(aEst).not.toBe(aOvest); // 15 a est, ancora 14 a ovest
  });

  for (const fuso of FUSI) {
    it(`con TZ=${fuso} la data di carico cade sulla mezzanotte UTC attesa`, () => {
      process.env.TZ = fuso;

      const serie = componiSerieTitolo({ loads: [carico('2026-01-15', 10)], observations: [] });

      expect(serie).toEqual([{ at: Date.UTC(2026, 0, 15), price: 10, origin: 'carico' }]);
      expect(serie.map((p) => new Date(p.at).toISOString())).toEqual([
        '2026-01-15T00:00:00.000Z',
      ]);
    });
  }

  it('gli estremi opposti del planisfero producono la stessa serie', () => {
    const input = {
      loads: [carico('2026-01-15', 10), carico('2026-12-31', 11)],
      observations: [rilevazione('2026-06-30T22:30:00Z', 12)],
    };

    process.env.TZ = 'Pacific/Kiritimati';
    const est = componiSerieTitolo(input);
    process.env.TZ = 'Pacific/Niue';
    const ovest = componiSerieTitolo(input);

    expect(ovest).toEqual(est);
  });
});

describe('calcolaScalaSerie', () => {
  /** Istante corrente fissato: 10 agosto 2026, mezzogiorno UTC. */
  const ORA = Date.UTC(2026, 7, 10, 12, 0, 0);

  /**
   * Il guasto che questi test difendono: una coordinata non finita non solleva
   * un'eccezione, produce un grafico che non disegna nulla. Va asserito su
   * tutte e quattro le coordinate, non su quella che si sospetta.
   */
  function assertiscoCoordinateFinite(scala: ScalaSerie): void {
    for (const nome of ['xMin', 'xMax', 'yMin', 'yMax'] as const) {
      expect(Number.isFinite(scala[nome]), `${nome} = ${scala[nome]} non è finito`).toBe(true);
    }
  }

  it('primo caso degenere — un solo punto: coordinate finite e ampiezza non nulla su entrambi gli assi', () => {
    const scala = calcolaScalaSerie({
      punti: [punto(ORA, 10, 'carico')],
      prezzoMedio: 10,
      now: ORA,
    });

    assertiscoCoordinateFinite(scala);
    expect(scala.xMin).toBeLessThan(scala.xMax);
    expect(scala.yMin).toBeLessThan(scala.yMax);
  });

  it('secondo caso degenere — prezzi tutti identici e uguali al prezzo medio: coordinate finite e dominio Y con ampiezza', () => {
    const scala = calcolaScalaSerie({
      punti: [punto(Date.UTC(2026, 0, 15), 8.4, 'carico'), punto(Date.UTC(2026, 2, 2), 8.4, 'carico')],
      prezzoMedio: 8.4,
      now: ORA,
    });

    assertiscoCoordinateFinite(scala);
    expect(scala.yMin).toBeLessThan(8.4);
    expect(scala.yMax).toBeGreaterThan(8.4);
  });

  it('terzo caso degenere — prezzo medio esterno all’intervallo osservato: coordinate finite', () => {
    const punti = [
      punto(Date.UTC(2026, 0, 15), 10, 'carico'),
      punto(Date.UTC(2026, 2, 2), 12, 'rilevazione'),
    ];

    assertiscoCoordinateFinite(calcolaScalaSerie({ punti, prezzoMedio: 20, now: ORA }));
    assertiscoCoordinateFinite(calcolaScalaSerie({ punti, prezzoMedio: 5, now: ORA }));
  });

  it('il dominio Y contiene il prezzo medio anche quando sta sopra il massimo osservato', () => {
    // Situazione ordinaria, non un angolo: un titolo che dopo il carico si è
    // mosso in una sola direzione. La linea di riferimento del criterio 4 deve
    // restare visibile, altrimenti il guadagno latente non è leggibile.
    const scala = calcolaScalaSerie({
      punti: [
        punto(Date.UTC(2026, 0, 15), 10, 'carico'),
        punto(Date.UTC(2026, 2, 2), 12, 'rilevazione'),
      ],
      prezzoMedio: 20,
      now: ORA,
    });

    expect(scala.yMin).toBeLessThanOrEqual(20);
    expect(scala.yMax).toBeGreaterThanOrEqual(20);
  });

  it('il dominio Y contiene il prezzo medio anche quando sta sotto il minimo osservato', () => {
    const scala = calcolaScalaSerie({
      punti: [
        punto(Date.UTC(2026, 0, 15), 10, 'carico'),
        punto(Date.UTC(2026, 2, 2), 12, 'rilevazione'),
      ],
      prezzoMedio: 5,
      now: ORA,
    });

    expect(scala.yMin).toBeLessThanOrEqual(5);
    expect(scala.yMax).toBeGreaterThanOrEqual(5);
  });

  it('il dominio X comincia al primo carico e termina ad «adesso», anche con l’ultimo punto molto anteriore', () => {
    // Il vuoto a destra è a sua volta un'informazione: sei mesi senza
    // rilevazioni vanno mostrati come vuoto, non compressi via.
    const primoCarico = Date.UTC(2026, 0, 15);
    const punti = componiSerieTitolo({
      loads: [carico('2026-01-15', 10), carico('2026-02-02', 11)],
      observations: [rilevazione('2026-02-10T10:00:00Z', 12)],
    });

    const scala = calcolaScalaSerie({ punti, prezzoMedio: 10.5, now: ORA });

    expect(scala.xMin).toBe(primoCarico);
    expect(scala.xMax).toBe(ORA);
  });

  it('una rilevazione anteriore al primo carico resta dentro il dominio X', () => {
    // `priceHistory` è per ISIN, non per posizione: le rilevazioni registrate
    // mentre il titolo stava in un altro portafoglio (o quelle create dal
    // backfill di US-009 dalla riga di cache) possono precedere il primo
    // carico. Se il dominio partisse dal carico, quei punti cadrebbero a
    // sinistra del riquadro disegnabile — fuori dal grafico, senza alcun
    // segnale. È il difetto simmetrico a quello che `xMax` già previene per la
    // data di carico futura.
    const rilevazioneVecchia = Date.UTC(2026, 0, 5);
    const punti = [
      punto(rilevazioneVecchia, 9, 'rilevazione'),
      punto(Date.UTC(2026, 1, 10), 10, 'carico'),
    ];

    const scala = calcolaScalaSerie({ punti, prezzoMedio: 10, now: ORA });

    expect(scala.xMin).toBeLessThanOrEqual(rilevazioneVecchia);
    expect(scala.xMax).toBe(ORA);
  });

  it('con prezzo 0 l’ampiezza Y resta non nulla: il margine proporzionale non basta', () => {
    const scala = calcolaScalaSerie({
      punti: [punto(ORA - GIORNO_MS, 0, 'carico')],
      prezzoMedio: 0,
      now: ORA,
    });

    assertiscoCoordinateFinite(scala);
    expect(scala.yMin).toBeLessThan(scala.yMax);
    expect(scala.yMin).toBeLessThanOrEqual(0);
    expect(scala.yMax).toBeGreaterThanOrEqual(0);
  });

  it('serie vuota: dominio finito e non degenere, senza eccezioni', () => {
    const scala = calcolaScalaSerie({ punti: [], prezzoMedio: 9.5, now: ORA });

    assertiscoCoordinateFinite(scala);
    expect(scala.xMin).toBeLessThan(scala.xMax);
    expect(scala.yMin).toBeLessThan(scala.yMax);
    expect(scala.yMin).toBeLessThanOrEqual(9.5);
    expect(scala.yMax).toBeGreaterThanOrEqual(9.5);
  });

  it('punti malformati non contaminano il dominio', () => {
    // Un chiamante diverso da `componiSerieTitolo` potrebbe passare punti già
    // guasti: il dominio resta finito comunque.
    const scala = calcolaScalaSerie({
      punti: [
        punto(Number.NaN, 10, 'carico'),
        punto(ORA - GIORNO_MS, Number.POSITIVE_INFINITY, 'rilevazione'),
        punto(ORA - 2 * GIORNO_MS, 11, 'carico'),
      ],
      prezzoMedio: 11,
      now: ORA,
    });

    assertiscoCoordinateFinite(scala);
    expect(scala.xMin).toBe(ORA - 2 * GIORNO_MS);
    expect(scala.xMax).toBe(ORA);
  });

  it('«adesso» come Date o come unix ms danno lo stesso dominio', () => {
    const punti = [punto(Date.UTC(2026, 0, 15), 10, 'carico')];

    const daNumero = calcolaScalaSerie({ punti, prezzoMedio: 10, now: ORA });
    const daData = calcolaScalaSerie({ punti, prezzoMedio: 10, now: new Date(ORA) });

    expect(daData).toEqual(daNumero);
  });
});

/**
 * `giornoCivilePunto` — il giorno che il grafico *scrive* accanto a un punto.
 *
 * Tenere il fuso fuori dalla composizione non basta: `PuntoSerie.at` fonde una
 * data civile (il carico, ancorato a mezzanotte UTC) e un istante reale (la
 * rilevazione), e renderli allo stesso modo ne sbaglia per forza uno. Il guasto
 * è di nuovo silenzioso — una data giusta a Roma e sbagliata di un giorno a New
 * York — e per giunta *contraddittorio*, perché la stessa scheda mostra il
 * carico anche nella tabella «Carichi registrati», che legge `loadDate` così
 * com'è. Le due letture non devono poter divergere.
 */
describe('giornoCivilePunto', () => {
  /** +14:00 e -11:00: i due estremi opposti, a 25 ore di distanza civile. */
  const FUSI = ['UTC', 'Pacific/Kiritimati', 'Pacific/Niue'] as const;

  const fusoOriginale = process.env.TZ;

  afterEach(() => {
    if (fusoOriginale === undefined) delete process.env.TZ;
    else process.env.TZ = fusoOriginale;
  });

  for (const fuso of FUSI) {
    it(`con TZ=${fuso} il carico conserva la propria loadDate`, () => {
      process.env.TZ = fuso;

      // Si parte dalla `loadDate` e si arriva alla stringa che il grafico
      // scrive: è il giro completo che l'utente vede, non solo metà.
      const [puntoCarico] = componiSerieTitolo({
        loads: [carico('2026-02-16', 10)],
        observations: [],
      });

      expect(giornoCivilePunto(puntoCarico)).toBe('2026-02-16');
    });
  }

  it('la rilevazione segue il giorno locale, come la tabella dello storico prezzi', () => {
    // Le 23:30Z del 10 agosto sono già l'11 agosto a Roma: `PriceObservation`
    // è un istante reale, e US-009 lo mostra nel giorno di chi legge.
    const istante = Date.parse('2026-08-10T23:30:00Z');

    process.env.TZ = 'Europe/Rome'; // +02:00 in agosto
    expect(giornoCivilePunto({ at: istante, origin: 'rilevazione' })).toBe('2026-08-11');

    process.env.TZ = 'America/New_York'; // -04:00 in agosto
    expect(giornoCivilePunto({ at: istante, origin: 'rilevazione' })).toBe('2026-08-10');
  });

  it('a ovest di Greenwich il carico non scivola al giorno prima, la rilevazione sì', () => {
    // Il caso che ha motivato la funzione: con una sola regola di resa, uno dei
    // due punti sarebbe necessariamente sbagliato.
    process.env.TZ = 'Pacific/Niue';

    const mezzanotteUtc = Date.UTC(2026, 1, 16);

    expect(giornoCivilePunto({ at: mezzanotteUtc, origin: 'carico' })).toBe('2026-02-16');
    expect(giornoCivilePunto({ at: mezzanotteUtc, origin: 'rilevazione' })).toBe('2026-02-15');
  });

  it('mese e giorno sono sempre a due cifre', () => {
    process.env.TZ = 'UTC';

    expect(giornoCivilePunto({ at: Date.UTC(2026, 0, 5), origin: 'carico' })).toBe('2026-01-05');
    expect(giornoCivilePunto({ at: Date.UTC(2026, 11, 31), origin: 'carico' })).toBe('2026-12-31');
  });
});

/**
 * US-037 — le scale temporali del grafico del titolo.
 *
 * `SCALE_TEMPORALI` è un fatto di dominio dichiarativo: l'ordine (dalla scala
 * più stretta alla più ampia) e l'identificativo stabile (`data-scala`) sono
 * ciò che il commutatore di US-039 dovrà poter riutilizzare senza riscriverli.
 */
describe('SCALE_TEMPORALI, SCALA_PREDEFINITA, definizioneScala', () => {
  it('le cinque scale sono ordinate dalla più stretta alla più ampia', () => {
    expect(SCALE_TEMPORALI.map((s) => s.id)).toEqual([
      'mese',
      'anno',
      'cinque-anni',
      'dieci-anni',
      'tutto',
    ]);
  });

  it('solo «tutto» ha mesi null: è l’unica scala che non ritaglia nulla', () => {
    expect(SCALE_TEMPORALI.filter((s) => s.mesi === null).map((s) => s.id)).toEqual(['tutto']);
  });

  it('la scala predefinita all’apertura della scheda è «tutto lo storico»', () => {
    // Criterio 2: è la sola scala che non possa nascondere un punto in silenzio.
    expect(SCALA_PREDEFINITA).toBe('tutto');
  });

  it('definizioneScala restituisce la definizione giusta per ogni identificativo valido', () => {
    for (const attesa of SCALE_TEMPORALI) {
      expect(definizioneScala(attesa.id)).toEqual(attesa);
    }
  });

  it('un identificativo ignoto ripiega sulla scala più ampia, non su un errore', () => {
    // Un id sconosciuto non deve poter ritagliare via dei punti senza dirlo: il
    // ripiego è deliberatamente quello che ritaglia di meno.
    const ignoto = 'boh' as ScalaTemporale;

    expect(definizioneScala(ignoto)).toEqual(definizioneScala('tutto'));
  });
});

/**
 * `calcolaFinestra` — l'aritmetica di calendario dietro ai bottoni «Ultimo
 * mese» / «Ultimo anno» / eccetera.
 *
 * Il guasto temuto qui non è silenzioso come un `NaN`: è un'off-by-one che si
 * vede solo in due giorni l'anno (31 marzo, 29 febbraio) e che nessuno nota
 * finché la suite non gira proprio in quel giorno. `setMonth`/`setFullYear` di
 * JavaScript traboccano quando il giorno di destinazione non esiste
 * (`retrocediMesi` lo cita esplicitamente); questi test fissano `now` a mano
 * sui giorni dove il trabocco accadrebbe, così il difetto è riproducibile ogni
 * volta e non solo una volta l'anno.
 *
 * L'aritmetica è su campi **locali**: le date si costruiscono con
 * `new Date(anno, mese, giorno, ora)` (costruttore locale, non `Date.UTC`) e si
 * legge il risultato con `getFullYear`/`getMonth`/`getDate` — mai
 * `toISOString()` o `Date.parse('...Z')`, che leggerebbero i campi nel fuso
 * sbagliato e farebbero fallire la suite in metà dei fusi orari della CI.
 */
describe('calcolaFinestra', () => {
  /** I soli campi civili che contano per queste prove: anno, mese (0-based), giorno. */
  function campiLocali(ms: number): { anno: number; mese: number; giorno: number } {
    const d = new Date(ms);
    return { anno: d.getFullYear(), mese: d.getMonth(), giorno: d.getDate() };
  }

  it('31 marzo meno un mese cade sul 28 febbraio in anno non bisestile, mai sul 3 marzo', () => {
    // 2026 non è bisestile: se il clamp mancasse, `setMonth` traboccherebbe sul
    // 3 marzo (31 − 28 = 3 giorni oltre l'inizio di marzo).
    const now = new Date(2026, 2, 31, 10, 0, 0);

    const finestra = calcolaFinestra({ scala: 'mese', punti: [], now });

    expect(campiLocali(finestra.da)).toEqual({ anno: 2026, mese: 1, giorno: 28 });
  });

  it('31 marzo meno un mese cade sul 29 febbraio in anno bisestile', () => {
    // 2028 è bisestile: il clamp deve fermarsi al 29, non al 28.
    const now = new Date(2028, 2, 31, 10, 0, 0);

    const finestra = calcolaFinestra({ scala: 'mese', punti: [], now });

    expect(campiLocali(finestra.da)).toEqual({ anno: 2028, mese: 1, giorno: 29 });
  });

  it('29 febbraio meno un anno cade sul 28 febbraio, non sul 1º marzo', () => {
    // `setFullYear(y - 1)` senza clamp trabocca sul 1º marzo: il giorno 29 non
    // esiste nel febbraio dell'anno di destinazione (2027, non bisestile).
    const now = new Date(2028, 1, 29, 9, 0, 0);

    const finestra = calcolaFinestra({ scala: 'anno', punti: [], now });

    expect(campiLocali(finestra.da)).toEqual({ anno: 2027, mese: 1, giorno: 28 });
  });

  it('«cinque anni» retrocede di 5 anni civili, stesso giorno e mese', () => {
    const now = new Date(2026, 5, 15, 8, 0, 0); // 15 giugno 2026

    const finestra = calcolaFinestra({ scala: 'cinque-anni', punti: [], now });

    expect(campiLocali(finestra.da)).toEqual({ anno: 2021, mese: 5, giorno: 15 });
  });

  it('«dieci anni» retrocede di 10 anni civili, stesso giorno e mese', () => {
    const now = new Date(2026, 5, 15, 8, 0, 0);

    const finestra = calcolaFinestra({ scala: 'dieci-anni', punti: [], now });

    expect(campiLocali(finestra.da)).toEqual({ anno: 2016, mese: 5, giorno: 15 });
  });

  it('«ultimo mese» e «ultimo anno» retrocedono di 1 e 12 mesi civili anche su un giorno qualunque', () => {
    // 15 giugno: nessun clamp di fine mese in gioco, il caso «normale» che deve
    // continuare a funzionare esattamente come ci si aspetta a calendario.
    const now = new Date(2026, 5, 15, 8, 0, 0);

    const unMese = calcolaFinestra({ scala: 'mese', punti: [], now });
    const unAnno = calcolaFinestra({ scala: 'anno', punti: [], now });

    expect(campiLocali(unMese.da)).toEqual({ anno: 2026, mese: 4, giorno: 15 });
    expect(campiLocali(unAnno.da)).toEqual({ anno: 2025, mese: 5, giorno: 15 });
  });

  it('l’estremo destro è sempre «adesso» per tutte le scale finite', () => {
    const now = new Date(2026, 5, 15, 8, 0, 0);
    const scaleFinite: ScalaTemporale[] = ['mese', 'anno', 'cinque-anni', 'dieci-anni'];

    for (const scala of scaleFinite) {
      expect(calcolaFinestra({ scala, punti: [], now }).a).toBe(now.getTime());
    }
  });

  it('«tutto» va dal primo istante d’archivio ad «adesso», quando l’ultimo dato è nel passato', () => {
    const now = Date.UTC(2026, 7, 10, 12, 0, 0);
    const primo = Date.UTC(2026, 0, 15);
    const ultimo = Date.UTC(2026, 3, 1);
    const punti = [punto(primo, 10, 'carico'), punto(ultimo, 11, 'rilevazione')];

    const finestra = calcolaFinestra({ scala: 'tutto', punti, now });

    expect(finestra).toEqual({ da: primo, a: now });
  });

  it('«tutto» con serie vuota collassa su «adesso» sia a sinistra sia a destra', () => {
    const now = Date.UTC(2026, 7, 10, 12, 0, 0);

    const finestra = calcolaFinestra({ scala: 'tutto', punti: [], now });

    expect(finestra).toEqual({ da: now, a: now });
  });

  it('«tutto» con un punto futuro non riporta «a» a prima dei dati: resta l’istante del punto', () => {
    // Simmetrico al caso già coperto in `calcolaScalaSerie` per il carico
    // futuro: il criterio vale anche per la finestra, non solo per il dominio.
    const now = Date.UTC(2026, 7, 10, 12, 0, 0);
    const passato = Date.UTC(2026, 0, 1);
    const futuro = Date.UTC(2026, 11, 31);
    const punti = [punto(passato, 10, 'carico'), punto(futuro, 11, 'carico')];

    const finestra = calcolaFinestra({ scala: 'tutto', punti, now });

    expect(finestra).toEqual({ da: passato, a: futuro });
  });

  it('la finestra comincia alla mezzanotte UTC del giorno civile, non all’ora di adesso', () => {
    // Conservare l'ora di partenza produrrebbe una finestra che comincia alle
    // 09:30 del giorno D. Sembra un dettaglio e non lo è: la barra dichiara la
    // finestra «dal D», ma un carico datato proprio D è ancorato a mezzanotte —
    // cioè *prima* di quell'ora — e cadrebbe fuori dal ritaglio, sparendo dal
    // grafico e dal conteggio senza che nulla lo dica.
    const now = new Date(2026, 7, 11, 9, 30, 45, 123).getTime();

    const finestra = calcolaFinestra({ scala: 'mese', punti: [], now });

    // Il giorno è quello che il clamp di calendario ha scelto, e l'istante è la
    // sua mezzanotte **UTC**: la stessa àncora di una `loadDate`.
    expect(new Date(finestra.da).toISOString()).toBe('2026-07-11T00:00:00.000Z');
    // L'estremo destro resta «adesso» esatto: si àncora l'inizio, non la fine.
    expect(finestra.a).toBe(now);
  });

  describe('un carico datato esattamente sul confine resta dentro il ritaglio', () => {
    // La prova della regola precedente dal lato che conta per l'utente: il punto
    // che il grafico deve mostrare. Girata su tre fusi perché è proprio qui che
    // un ancoraggio alla mezzanotte *locale* si romperebbe — riparando il caso a
    // est di Greenwich e rompendolo a ovest.
    const fusoOriginale = process.env.TZ;

    afterEach(() => {
      if (fusoOriginale === undefined) delete process.env.TZ;
      else process.env.TZ = fusoOriginale;
    });

    for (const fuso of ['UTC', 'Pacific/Kiritimati', 'Pacific/Niue'] as const) {
      it(`con TZ=${fuso}`, () => {
        process.env.TZ = fuso;

        const now = new Date(2026, 7, 11, 9, 30).getTime();
        const finestra = calcolaFinestra({ scala: 'mese', punti: [], now });

        // Il giorno di confine si legge dai campi **UTC**, come una `loadDate`.
        const inizio = new Date(finestra.da);
        const giornoConfine = `${inizio.getUTCFullYear()}-${String(inizio.getUTCMonth() + 1).padStart(2, '0')}-${String(inizio.getUTCDate()).padStart(2, '0')}`;

        const serie = componiSerieTitolo({ loads: [carico(giornoConfine, 42)], observations: [] });
        const ritaglio = ritagliaSerie({ punti: serie, finestra });

        expect(ritaglio.punti).toHaveLength(1);
        expect(ritaglio.punti[0].price).toBe(42);
      });
    }
  });

  it('l’esito non dipende dall’orologio della macchina: «adesso» arriva sempre come argomento', () => {
    const now = Date.UTC(2026, 5, 15, 10, 0, 0);
    const input = { scala: 'mese' as const, punti: [], now };

    const orologioOriginale = Date.now;
    try {
      Date.now = () => Date.UTC(1999, 0, 1);
      const primaLettura = calcolaFinestra(input);

      Date.now = () => Date.UTC(2099, 0, 1);
      const secondaLettura = calcolaFinestra(input);

      expect(secondaLettura).toEqual(primaLettura);
    } finally {
      Date.now = orologioOriginale; // Un orologio globale alterato falserebbe ogni altro file.
    }
  });
});

/**
 * `ritagliaSerie` — il verdetto di copertura che accompagna il ritaglio.
 *
 * Il caso che ha motivato l'intera funzione è quello vietato: una finestra
 * senza punti non deve mai produrre un valore sintetico ancorato a sinistra
 * (il riporto dell'ultimo prezzo noto). `copertura: 'assente'` è la dichiarazione
 * esplicita di quel vuoto, e va provata anche quando l'archivio possiede dati
 * — solo altrove sull'asse dei tempi.
 */
describe('ritagliaSerie', () => {
  const t0 = Date.UTC(2026, 0, 1);

  it('finestra senza punti dentro dà «assente», anche se l’archivio ha punti prima della finestra', () => {
    const punti = [punto(t0, 10, 'carico')];
    const finestra: FinestraTemporale = { da: t0 + 10 * GIORNO_MS, a: t0 + 20 * GIORNO_MS };

    const esito = ritagliaSerie({ punti, finestra });

    expect(esito.punti).toEqual([]); // nessun punto sintetico riportato da sinistra
    expect(esito.copertura).toBe('assente');
    expect(esito.primoDatoDisponibile).toBe(t0); // fatto sull'intera serie, non sul ritaglio
  });

  it('finestra che comincia prima del primo punto d’archivio dà «parziale»', () => {
    const rilevazione2 = t0 + 5 * GIORNO_MS;
    const punti = [punto(t0, 10, 'carico'), punto(rilevazione2, 11, 'rilevazione')];
    const finestra: FinestraTemporale = { da: t0 - 10 * GIORNO_MS, a: rilevazione2 };

    const esito = ritagliaSerie({ punti, finestra });

    expect(esito.copertura).toBe('parziale');
    expect(esito.primoDatoDisponibile).toBe(t0);
    expect(esito.punti).toEqual(punti);
  });

  it('finestra che comincia esattamente sul primo punto d’archivio dà «piena»', () => {
    const punti = [punto(t0, 10, 'carico'), punto(t0 + 5 * GIORNO_MS, 11, 'rilevazione')];
    const finestra: FinestraTemporale = { da: t0, a: t0 + 5 * GIORNO_MS };

    expect(ritagliaSerie({ punti, finestra }).copertura).toBe('piena');
  });

  it('finestra che comincia dopo il primo punto d’archivio dà «piena»: la storia comincia prima', () => {
    // Il primo punto (t0) resta fuori dal ritaglio, ma la copertura è comunque
    // piena: l'archivio possiede dati da prima dell'inizio della finestra.
    const punti = [punto(t0, 10, 'carico'), punto(t0 + 5 * GIORNO_MS, 11, 'rilevazione')];
    const finestra: FinestraTemporale = { da: t0 + GIORNO_MS, a: t0 + 5 * GIORNO_MS };

    const esito = ritagliaSerie({ punti, finestra });

    expect(esito.copertura).toBe('piena');
    expect(esito.punti).toEqual([punto(t0 + 5 * GIORNO_MS, 11, 'rilevazione')]);
  });

  it('un punto esattamente su «da» e uno esattamente su «a» sono entrambi inclusi (estremi chiusi)', () => {
    const punti = [
      punto(t0, 10, 'carico'),
      punto(t0 + GIORNO_MS, 11, 'rilevazione'),
      punto(t0 + 2 * GIORNO_MS, 12, 'carico'),
    ];
    const finestra: FinestraTemporale = { da: t0, a: t0 + 2 * GIORNO_MS };

    const esito = ritagliaSerie({ punti, finestra });

    expect(esito.punti).toEqual(punti);
  });

  it('la serie ritagliata conserva l’ordine crescente e l’origine di ciascun punto', () => {
    const punti = [
      punto(t0, 10, 'carico'),
      punto(t0 + GIORNO_MS, 11, 'rilevazione'),
      punto(t0 + 2 * GIORNO_MS, 12, 'carico'),
      punto(t0 + 30 * GIORNO_MS, 13, 'rilevazione'), // fuori dalla finestra
    ];
    const finestra: FinestraTemporale = { da: t0, a: t0 + 2 * GIORNO_MS };

    const esito = ritagliaSerie({ punti, finestra });

    expect(esito.punti.map((p) => p.at)).toEqual([t0, t0 + GIORNO_MS, t0 + 2 * GIORNO_MS]);
    expect(esito.punti.map((p) => p.origin)).toEqual(['carico', 'rilevazione', 'carico']);
  });

  it('serie vuota: punti vuoti, copertura «assente», nessun primo dato disponibile', () => {
    const esito = ritagliaSerie({ punti: [], finestra: { da: t0, a: t0 + GIORNO_MS } });

    expect(esito).toEqual({ punti: [], copertura: 'assente', primoDatoDisponibile: null });
  });

  it('i punti malformati non entrano nel ritaglio né influenzano il primo dato disponibile', () => {
    const punti = [
      punto(Number.NaN, 5, 'carico'),
      punto(t0 - GIORNO_MS, Number.POSITIVE_INFINITY, 'rilevazione'),
      punto(t0, 10, 'carico'),
    ];
    const finestra: FinestraTemporale = { da: t0 - 100 * GIORNO_MS, a: t0 + 100 * GIORNO_MS };

    const esito = ritagliaSerie({ punti, finestra });

    expect(esito.punti).toEqual([punto(t0, 10, 'carico')]);
    expect(esito.primoDatoDisponibile).toBe(t0);
    // La finestra comincia 100 giorni prima di t0: la copertura è «parziale»
    // in modo corretto — l'asserzione rilevante di questo test è sopra, sui
    // due campi che i punti malformati non devono poter alterare.
    expect(esito.copertura).toBe('parziale');
  });
});

/**
 * `calcolaScalaSerie` con `finestra` (US-037).
 *
 * Il rischio specifico di questa estensione è duplice: che l'asse si accorci
 * silenziosamente fino al primo dato reale invece di coprire l'orizzonte
 * chiesto (facendo credere piena una copertura che non lo è), e che
 * l'aggiunta del campo rompa per regressione il comportamento di US-036 nel
 * caso — il più comune — in cui nessuna finestra viene passata.
 */
describe('calcolaScalaSerie — con finestra (US-037)', () => {
  /** Stesso guasto temuto di US-036: una coordinata non finita è un grafico invisibile. */
  function assertiscoCoordinateFinite(scala: ScalaSerie): void {
    for (const nome of ['xMin', 'xMax', 'yMin', 'yMax'] as const) {
      expect(Number.isFinite(scala[nome]), `${nome} = ${scala[nome]} non è finito`).toBe(true);
    }
  }

  const ORA = Date.UTC(2026, 7, 10, 12, 0, 0);

  it('xMin e xMax coincidono con gli estremi della finestra, non con quelli dei dati', () => {
    // Un asse che si accorciasse fino al primo dato riempirebbe la larghezza
    // disponibile lasciando intendere una copertura piena che non c'è: la
    // finestra chiesta dall'utente vince sempre sui dati effettivamente presenti.
    const finestra: FinestraTemporale = { da: Date.UTC(2020, 0, 1), a: ORA };
    const scala = calcolaScalaSerie({
      punti: [punto(Date.UTC(2025, 5, 1), 10, 'carico')],
      prezzoMedio: 10,
      now: ORA,
      finestra,
    });

    expect(scala.xMin).toBe(finestra.da);
    expect(scala.xMax).toBe(finestra.a);
  });

  it('un solo punto dentro una finestra decennale: nessuna coordinata NaN o Infinity', () => {
    const finestra = calcolaFinestra({ scala: 'dieci-anni', punti: [], now: ORA });
    const scala = calcolaScalaSerie({
      punti: [punto(ORA - 5 * 365 * GIORNO_MS, 10, 'carico')],
      prezzoMedio: 10,
      now: ORA,
      finestra,
    });

    assertiscoCoordinateFinite(scala);
  });

  it('il dominio Y contiene il prezzo medio anche con un solo punto visibile nella finestra', () => {
    const finestra: FinestraTemporale = { da: Date.UTC(2026, 0, 1), a: ORA };
    const scala = calcolaScalaSerie({
      punti: [punto(Date.UTC(2026, 0, 15), 10, 'carico')],
      prezzoMedio: 20, // fuori dall'intervallo osservato, come nel terzo caso degenere di US-036
      now: ORA,
      finestra,
    });

    expect(scala.yMin).toBeLessThanOrEqual(20);
    expect(scala.yMax).toBeGreaterThanOrEqual(20);
  });

  it('una finestra degenere («da» uguale ad «a») produce comunque un’ampiezza X non nulla', () => {
    const scala = calcolaScalaSerie({
      punti: [],
      prezzoMedio: 10,
      now: ORA,
      finestra: { da: ORA, a: ORA },
    });

    assertiscoCoordinateFinite(scala);
    expect(scala.xMin).toBeLessThan(scala.xMax);
  });

  it('regressione — senza «finestra» il risultato è identico a quello di US-036', () => {
    // Stesso scenario del test US-036 «una rilevazione anteriore al primo
    // carico resta dentro il dominio X»: una rilevazione precede il carico.
    const rilevazioneVecchia = Date.UTC(2026, 0, 5);
    const punti = [
      punto(rilevazioneVecchia, 9, 'rilevazione'),
      punto(Date.UTC(2026, 1, 10), 10, 'carico'),
    ];
    const prezzoMedio = 10;

    // La finestra di «tutto» è, per costruzione, lo stesso dominio X che
    // `calcolaScalaSerie` calcola da sé quando il campo manca (lo dichiara il
    // commento di `calcolaFinestra` nel dominio): passarla esplicitamente non
    // deve quindi cambiare nulla.
    const finestraTutto = calcolaFinestra({ scala: 'tutto', punti, now: ORA });

    const senzaFinestra = calcolaScalaSerie({ punti, prezzoMedio, now: ORA });
    const conFinestraTutto = calcolaScalaSerie({ punti, prezzoMedio, now: ORA, finestra: finestraTutto });

    expect(conFinestraTutto).toEqual(senzaFinestra);
    // E il dominio omesso resta esattamente quello che US-036 già garantiva.
    expect(senzaFinestra.xMin).toBeLessThanOrEqual(rilevazioneVecchia);
    expect(senzaFinestra.xMax).toBe(ORA);
  });
});

/**
 * Le due generalizzazioni che US-039 chiede a questo modulo, e la loro
 * regressione.
 *
 * Nessuna delle due cambia il comportamento esistente, ed è esattamente questo a
 * dover essere provato: `ritagliaSerie` diventa generica sul tipo del punto —
 * così il ritaglio non spoglia un `PuntoValore` dei propri campi — e
 * `calcolaScalaSerie` accetta `prezzoMedio: null` (criterio 5: nessuna riga di
 * riferimento, quindi nessun estremo da allargare per accoglierla) e l'opzione
 * `ancoraAZero` (la vista del valore è una grandezza assoluta, e tagliarne la
 * base ingrandirebbe di nascosto proprio il gradino).
 */
describe('ritagliaSerie — generica sul tipo del punto (US-039)', () => {
  /** Un punto più ricco, nella forma minima che `PuntoValore` prende. */
  interface PuntoConEtichetta extends PuntoSerie {
    quantita: number;
    etichetta: string;
  }

  const arricchito = (at: number, price: number, quantita: number): PuntoConEtichetta => ({
    at,
    price,
    origin: 'rilevazione',
    quantita,
    etichetta: `q=${quantita}`,
  });

  it('il ritaglio conserva i campi in più del punto, non solo i tre di PuntoSerie', () => {
    const punti = [
      arricchito(Date.UTC(2026, 0, 1), 10, 80),
      arricchito(Date.UTC(2026, 5, 1), 20, 200),
      arricchito(Date.UTC(2026, 11, 1), 30, 200),
    ];

    const ritaglio = ritagliaSerie({
      punti,
      finestra: { da: Date.UTC(2026, 4, 1), a: Date.UTC(2026, 6, 1) },
    });

    expect(ritaglio.punti).toHaveLength(1);
    // L'accesso ai campi in più è verificato dal compilatore *e* a runtime: una
    // firma non generica costringerebbe a un cast, e il cast passerebbe il
    // typecheck restituendo `undefined`.
    expect(ritaglio.punti[0].quantita).toBe(200);
    expect(ritaglio.punti[0].etichetta).toBe('q=200');
  });

  it('regressione — su PuntoSerie il ritaglio resta quello di US-037', () => {
    const punti = [
      punto(Date.UTC(2026, 0, 1), 10, 'carico'),
      punto(Date.UTC(2026, 5, 1), 20, 'rilevazione'),
    ];
    const finestra: FinestraTemporale = { da: Date.UTC(2026, 2, 1), a: Date.UTC(2026, 7, 1) };

    const ritaglio = ritagliaSerie({ punti, finestra });

    expect(ritaglio.punti).toEqual([punti[1]]);
    // La storia comincia **prima** della finestra chiesta: copertura piena, anche
    // se il punto d'apertura resta fuori dal ritaglio.
    expect(ritaglio.copertura).toBe('piena');
    expect(ritaglio.primoDatoDisponibile).toBe(Date.UTC(2026, 0, 1));
  });
});

describe('calcolaScalaSerie — prezzo medio assente e ancoraggio a zero (US-039)', () => {
  const ORA = Date.UTC(2026, 7, 10, 12, 0, 0);
  const PUNTI = [
    punto(Date.UTC(2026, 0, 1), 4672, 'carico'),
    punto(Date.UTC(2026, 5, 1), 25692, 'rilevazione'),
  ];

  it('con prezzoMedio null la riga non entra nel dominio Y: non è nascosta, non ha dove stare', () => {
    const senzaRiga = calcolaScalaSerie({ punti: PUNTI, prezzoMedio: null, now: ORA });

    expect(senzaRiga.yMin).toBe(4672);
    expect(senzaRiga.yMax).toBe(25692);
  });

  it('lo stesso dominio con un prezzo medio da 66 euro si allargherebbe fino a schiacciare la curva', () => {
    // È la ragione per cui il criterio 5 vive nel dominio e non solo nella resa:
    // «nascondere» la riga lasciandola nel calcolo lascerebbe la scala allargata,
    // e nulla a schermo direbbe perché la curva sta tutta nella metà alta.
    const conRiga = calcolaScalaSerie({ punti: PUNTI, prezzoMedio: 66.08, now: ORA });
    const senzaRiga = calcolaScalaSerie({ punti: PUNTI, prezzoMedio: null, now: ORA });

    expect(conRiga.yMin).toBe(66.08);
    expect(senzaRiga.yMin).toBeGreaterThan(conRiga.yMin);
  });

  it('ancoraAZero fissa yMin a zero senza toccare il massimo', () => {
    const ancorata = calcolaScalaSerie({
      punti: PUNTI,
      prezzoMedio: null,
      now: ORA,
      ancoraAZero: true,
    });

    expect(ancorata.yMin).toBe(0);
    expect(ancorata.yMax).toBe(25692);
    expect(ancorata.yMax).toBeGreaterThan(ancorata.yMin);
  });

  it('ancoraAZero su valori tutti identici conserva un’ampiezza non nulla, e la base resta zero', () => {
    const ancorata = calcolaScalaSerie({
      punti: [punto(ORA, 0, 'carico')],
      prezzoMedio: null,
      now: ORA,
      ancoraAZero: true,
    });

    expect(ancorata.yMin).toBe(0);
    expect(ancorata.yMax).toBeGreaterThan(0);
    for (const nome of ['xMin', 'xMax', 'yMin', 'yMax'] as const) {
      expect(Number.isFinite(ancorata[nome]), `${nome} non è finito`).toBe(true);
    }
  });

  it('ancoraAZero non alza la base sopra un valore negativo: lo accoglie', () => {
    const ancorata = calcolaScalaSerie({
      punti: [punto(ORA - GIORNO_MS, -30, 'rilevazione'), punto(ORA, 50, 'rilevazione')],
      prezzoMedio: null,
      now: ORA,
      ancoraAZero: true,
    });

    expect(ancorata.yMin).toBe(-30);
  });

  it('regressione — con i parametri di prima gli estremi restano identici a US-036/US-037', () => {
    const punti = [
      punto(Date.UTC(2026, 0, 5), 9, 'rilevazione'),
      punto(Date.UTC(2026, 1, 10), 10, 'carico'),
    ];
    const finestra = calcolaFinestra({ scala: 'anno', punti, now: ORA });

    // Gli stessi argomenti che i chiamanti passavano prima di US-039: nessun
    // `ancoraAZero`, un prezzo medio numerico.
    const senzaFinestra = calcolaScalaSerie({ punti, prezzoMedio: 10, now: ORA });
    const conFinestra = calcolaScalaSerie({ punti, prezzoMedio: 10, now: ORA, finestra });

    expect(senzaFinestra).toEqual({
      xMin: Date.UTC(2026, 0, 5),
      xMax: ORA,
      yMin: 9,
      yMax: 10,
    });
    expect(conFinestra.xMin).toBe(finestra.da);
    expect(conFinestra.xMax).toBe(finestra.a);
    expect(conFinestra.yMin).toBe(9);
    expect(conFinestra.yMax).toBe(10);

    // E l'opzione a `false` esplicito è indistinguibile dall'ometterla.
    expect(calcolaScalaSerie({ punti, prezzoMedio: 10, now: ORA, ancoraAZero: false })).toEqual(
      senzaFinestra,
    );
  });
});
