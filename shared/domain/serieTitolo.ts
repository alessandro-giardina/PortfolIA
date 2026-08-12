/**
 * Serie di prezzo di un singolo titolo (US-036).
 *
 * Il grafico del titolo non ha una propria fonte dati: si compone **solo** da
 * ciò che la scheda titolo ha già in mano — i prezzi di carico (`loads`) e le
 * rilevazioni registrate dagli aggiornamenti (`priceHistory`, FR-018). Nessuna
 * rete, nessun archivio, nessun endpoint: per questo le funzioni qui sono pure e
 * ricevono anche l'istante corrente come argomento.
 *
 * Coerentemente con ADR-003 la serie è **rada per costruzione**: contiene
 * esattamente i punti osservati, senza interpolazioni, stime o valori sintetici
 * a colmare i giorni vuoti.
 */

// `import type` e non un import a runtime: `types/index.ts` riesporta questo
// modulo, quindi un import di valori creerebbe un ciclo fra i due file.
import type { Position, PriceObservation } from '../types/index.js';

/**
 * Provenienza di un punto della serie: distingue il fatto contabile (il carico
 * deciso dall'utente) dal fatto osservato (il prezzo rilevato alla fonte). Il
 * grafico li rende con marker diversi, quindi la distinzione appartiene al
 * dominio e non alla resa.
 */
export type OriginePunto = 'carico' | 'rilevazione';

/** Un punto della serie di prezzo del titolo. */
export interface PuntoSerie {
  /**
   * Istante del punto, **unix in millisecondi**.
   *
   * Il resto del progetto conserva gli istanti in unix *secondi*
   * (`PriceObservation.observedAt`, `Position.createdAt`, `securities.fetched_at`),
   * ma qui l'unità è il millisecondo per una ragione precisa: metà dei punti
   * nasce da una data civile passata per `Date.parse`, che restituisce
   * millisecondi. Scegliere i secondi imporrebbe una divisione (e un
   * arrotondamento) su ogni carico, mentre scegliere i millisecondi concentra la
   * conversione in un unico punto — la moltiplicazione ×1000 delle rilevazioni,
   * fatta in modo esplicito in `componiSerieTitolo`.
   */
  at: number;
  /** Prezzo del punto, nella valuta del titolo. */
  price: number;
  /** Da dove viene il punto. */
  origin: OriginePunto;
}

/** Il carico, ridotto ai due soli campi che la serie usa. */
export type CaricoSerie = Pick<Position, 'loadDate' | 'loadPrice'>;

/** La rilevazione, ridotta ai due soli campi che la serie usa. */
export type RilevazioneSerie = Pick<PriceObservation, 'price' | 'observedAt'>;

/**
 * Ingresso di `componiSerieTitolo`.
 *
 * I due elenchi sono ritagliati con `Pick` sui tipi già dichiarati: la serie non
 * legge quantità né provenienza, e dichiararlo nel tipo evita di accoppiare
 * questo modulo a campi che non usa (se domani `Position` ne guadagna uno, qui
 * non cambia nulla).
 */
export interface ComponiSerieInput {
  loads: readonly CaricoSerie[];
  observations: readonly RilevazioneSerie[];
}

/** Precedenza a pari istante: il carico è il fatto anteriore della giornata. */
const PRECEDENZA_ORIGINE: Record<OriginePunto, number> = {
  carico: 0,
  rilevazione: 1,
};

/**
 * L'istante di una data **civile** (`YYYY-MM-DD`), ancorato alla mezzanotte UTC.
 *
 * `loadDate` è una data civile, non un istante: la si ancora con
 * `Date.parse(...T00:00:00Z)`. `new Date(anno, mese, giorno)` sarebbe un errore —
 * interpreta i campi nel fuso della macchina, quindi lo stesso carico cadrebbe un
 * giorno prima o dopo a seconda di dove gira il codice (o il test), e il grafico
 * cambierebbe forma col fuso del lettore.
 *
 * È **esportata** perché la regola deve avere una sola implementazione: la serie
 * del valore (US-039) confronta le stesse `loadDate` per sapere quante quote
 * erano detenute a una data, e un secondo modo di leggerle farebbe cadere un
 * carico dal lato sbagliato del proprio giorno — con le due viste dello stesso
 * titolo che raccontano due storie diverse.
 *
 * Restituisce `NaN` per una data malformata: chi chiama decide se scartare il
 * punto (`componiSerieTitolo`) o ignorare il carico (`quantitaDetenutaA`).
 */
export function istanteDataCivile(dataCivile: string): number {
  return Date.parse(`${dataCivile}T00:00:00Z`);
}

/**
 * Fonde i prezzi di carico e le rilevazioni in un'unica serie crescente per
 * istante. Funzione pura: nessun accesso all'orologio, nessun effetto.
 *
 * I punti non validi vengono **scartati**, non corretti: una data di carico
 * malformata o un prezzo non finito, se propagati, diventerebbero un `NaN` nelle
 * coordinate e un tratto di grafico invisibile — un errore che non si vede.
 */
export function componiSerieTitolo({ loads, observations }: ComponiSerieInput): PuntoSerie[] {
  const punti: PuntoSerie[] = [];

  for (const carico of loads) {
    // La data civile del carico, ancorata a mezzanotte UTC: la regola vive in
    // `istanteDataCivile` perché US-039 la rilegge per contare le quote detenute.
    const at = istanteDataCivile(carico.loadDate);
    if (!Number.isFinite(at) || !Number.isFinite(carico.loadPrice)) continue;
    punti.push({ at, price: carico.loadPrice, origin: 'carico' });
  }

  for (const rilevazione of observations) {
    // `observedAt` è in unix secondi (vedi `PriceObservation`): conversione
    // esplicita all'unità della serie, dichiarata su `PuntoSerie.at`.
    const at = rilevazione.observedAt * 1000;
    if (!Number.isFinite(at) || !Number.isFinite(rilevazione.price)) continue;
    punti.push({ at, price: rilevazione.price, origin: 'rilevazione' });
  }

  // Ordine *totale*: istante, poi origine (carico prima), poi prezzo. Il terzo
  // criterio non serve a leggere il grafico, serve a renderlo deterministico —
  // senza di esso due rilevazioni nello stesso istante si disporrebbero secondo
  // l'ordine d'ingresso, e la stessa scheda potrebbe disegnarsi in due modi.
  punti.sort(
    (a, b) =>
      a.at - b.at ||
      PRECEDENZA_ORIGINE[a.origin] - PRECEDENZA_ORIGINE[b.origin] ||
      a.price - b.price,
  );

  return punti;
}

/**
 * Il giorno civile di un punto della serie, in formato `YYYY-MM-DD`.
 *
 * Esiste perché `PuntoSerie.at` fonde deliberatamente **due nature diverse**, e
 * renderle allo stesso modo ne sbaglierebbe necessariamente una:
 *
 * - il **carico** nasce da una data civile (`Position.loadDate`, `YYYY-MM-DD`)
 *   che `componiSerieTitolo` ancora a mezzanotte UTC. Leggerne i campi *locali*
 *   la farebbe scivolare al giorno prima a ogni offset negativo: con il carico
 *   del 2026-02-16 e il lettore a New York, la tabella «Carichi registrati»
 *   direbbe il 16 e il grafico della stessa scheda il 15 — due letture dello
 *   stesso fatto che divergono. Si leggono quindi i campi **UTC**, che sono
 *   esattamente i campi della `loadDate` d'origine, in qualunque fuso giri il
 *   codice;
 * - la **rilevazione** è invece un istante reale (`PriceObservation.observedAt`):
 *   le 23:30Z del 10 agosto sono l'11 agosto a Roma, ed è così — nel giorno
 *   *locale* — che la tabella «Storico prezzi» di US-009 la mostra. Renderla in
 *   UTC riparerebbe i carichi rompendo le rilevazioni.
 *
 * La funzione decide **quale giorno**, non come scriverlo: la resa in stile
 * registro resta di chi disegna (`dataCarico`, la stessa che formatta la tabella
 * dei carichi), così le due letture nascono dallo stesso formattatore.
 */
export function giornoCivilePunto({ at, origin }: Pick<PuntoSerie, 'at' | 'origin'>): string {
  const d = new Date(at);
  const [anno, mese, giorno] =
    origin === 'carico'
      ? [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()]
      : [d.getFullYear(), d.getMonth() + 1, d.getDate()];
  return `${anno}-${String(mese).padStart(2, '0')}-${String(giorno).padStart(2, '0')}`;
}

/**
 * Le cinque scale temporali del grafico del titolo (US-037, FR-016).
 *
 * L'identificativo è stabile e finisce negli attributi che i test interrogano
 * (`data-scala`, `data-testid="scala-<id>"`): va scelto una volta e non più
 * cambiato.
 */
export type ScalaTemporale = 'mese' | 'anno' | 'cinque-anni' | 'dieci-anni' | 'tutto';

/** Una scala temporale: identificativo, etichetta e durata retrocessa. */
export interface DefinizioneScala {
  /** L'identificativo stabile della scala. */
  id: ScalaTemporale;
  /** L'etichetta del bottone, in italiano. */
  etichetta: string;
  /**
   * Quanti **mesi civili** si retrocede da «adesso» per trovare l'inizio della
   * finestra. `null` significa «tutto lo storico», cioè nessun ritaglio: la
   * finestra non si calcola all'indietro ma coincide con la storia esistente.
   *
   * I mesi e non i giorni perché «ultimo mese» significa *un mese civile
   * indietro*: la differenza fra un mese e trenta giorni si vede, e l'utente
   * che confronta il grafico col calendario la nota.
   */
  mesi: number | null;
}

/**
 * L'elenco **ordinato** delle scale, dalla più stretta alla più ampia.
 *
 * Vive nel dominio e non nel componente per la stessa ragione per cui ci vive
 * `componiSerieTitolo`: l'ordine e le etichette sono un fatto solo, e chi
 * ricalcolerà sulla stessa finestra (il commutatore prezzo/valore di US-039)
 * deve leggerli da qui invece di riscriverli.
 */
export const SCALE_TEMPORALI: readonly DefinizioneScala[] = [
  { id: 'mese', etichetta: 'Ultimo mese', mesi: 1 },
  { id: 'anno', etichetta: 'Ultimo anno', mesi: 12 },
  { id: 'cinque-anni', etichetta: 'Ultimi 5 anni', mesi: 60 },
  { id: 'dieci-anni', etichetta: 'Ultimi 10 anni', mesi: 120 },
  { id: 'tutto', etichetta: 'Tutto lo storico', mesi: null },
];

/**
 * La scala all'apertura della scheda (criterio 2): tutto lo storico, dal primo
 * carico a oggi. È la sola che non ritaglia nulla, quindi l'unica che non possa
 * nascondere un punto senza dirlo.
 */
export const SCALA_PREDEFINITA: ScalaTemporale = 'tutto';

/** La definizione di una scala; ripiega su «tutto lo storico» per un id ignoto. */
export function definizioneScala(scala: ScalaTemporale): DefinizioneScala {
  return (
    SCALE_TEMPORALI.find((definizione) => definizione.id === scala) ??
    // Ripiego deliberato sulla scala **più ampia**: un identificativo ignoto non
    // deve poter ritagliare via dei punti in silenzio.
    SCALE_TEMPORALI[SCALE_TEMPORALI.length - 1]
  );
}

/** Una finestra temporale, estremi **inclusi** (`da <= at <= a`), in unix ms. */
export interface FinestraTemporale {
  /** Inizio della finestra (unix ms), incluso. */
  da: number;
  /** Fine della finestra (unix ms), inclusa. */
  a: number;
}

/** Ingresso di `calcolaFinestra`. */
export interface CalcolaFinestraInput {
  /** La scala scelta dall'utente. */
  scala: ScalaTemporale;
  /** La serie **intera**, non ritagliata: serve solo alla scala «tutto». */
  punti: readonly PuntoSerie[];
  /** Istante corrente, come argomento e mai dall'orologio. */
  now: number | Date;
}

/**
 * I punti con istante e prezzo finiti: gli unici che possano entrare in un
 * calcolo. Generica sul tipo del punto, così il filtro non spoglia un
 * `PuntoValore` dei propri campi (US-039).
 */
function puntiValidi<P extends PuntoSerie>(punti: readonly P[]): P[] {
  return punti.filter((p) => Number.isFinite(p.at) && Number.isFinite(p.price));
}

/**
 * Retrocede un istante di `mesi` **mesi civili**, con clamp all'ultimo giorno del
 * mese di destinazione.
 *
 * Il clamp non è una raffinatezza: in JavaScript `setMonth(m - 1)` sul 31 marzo
 * produce il **3 marzo** e `setFullYear(y - 1)` sul 29 febbraio produce il **1º
 * marzo**, perché il giorno 31 (o 29) non esiste nel mese di destinazione e la
 * data trabocca in avanti. Senza clamp «ultimo mese» diventerebbe
 * silenziosamente «ultimi 28 giorni più tre» una volta l'anno — un difetto che
 * nessuno vede finché non gira il test nel giorno giusto.
 *
 * L'aritmetica è sui campi **locali** e non UTC perché `now` è un istante reale e
 * «un mese fa» è un mese fa nel calendario di chi guarda: è la stessa lettura
 * che il grafico usa per rendere l'estremo sinistro dell'asse (`dataIstante`).
 *
 * Il giorno così trovato viene poi àncorato alla **mezzanotte UTC**, esattamente
 * come `componiSerieTitolo` àncora la data civile di un carico, e non è un
 * dettaglio di comodità:
 *
 * - conservare l'ora di partenza produrrebbe una finestra che comincia alle
 *   09:00 del giorno D. Un carico datato proprio D sta a mezzanotte, cioè
 *   *prima* di quell'ora: cadrebbe fuori dal ritaglio mentre la barra
 *   dichiarerebbe la finestra «dal D». Il punto sparirebbe dal grafico e dal
 *   conteggio senza che nulla lo dica — il guasto silenzioso che ADR-003 vieta;
 * - troncare alla mezzanotte *locale* riparerebbe il caso a est di Greenwich e
 *   lo romperebbe a ovest, dove la mezzanotte locale del giorno D è posteriore
 *   alla sua mezzanotte UTC. L'ancoraggio UTC mette invece l'estremo esattamente
 *   sull'istante dei carichi di quel giorno, che gli estremi chiusi accolgono, in
 *   qualunque fuso giri il codice.
 *
 * Ne segue come si legge l'estremo: `finestra.da` è una **data civile** come
 * `loadDate`, non un istante reale, e chi la scrive deve leggerne i campi UTC.
 * Resta un margine dichiarato: una rilevazione registrata nelle prime ore locali
 * del giorno D, a est di Greenwich, cade poco prima dell'estremo. È il prezzo di
 * un confine unico per due nature diverse, ed è di ore su una finestra di mesi.
 */
function retrocediMesi(istante: number, mesi: number): number {
  const partenza = new Date(istante);
  const meseAssoluto = partenza.getFullYear() * 12 + partenza.getMonth() - mesi;
  const annoTarget = Math.floor(meseAssoluto / 12);
  const meseTarget = meseAssoluto - annoTarget * 12;

  // Ultimo giorno del mese di destinazione: `setFullYear(anno, mese + 1, 0)`
  // arretra di un giorno dal primo del mese successivo. Il mezzogiorno evita il
  // caso in cui la mezzanotte locale non esista (passaggio all'ora legale).
  const fineMese = new Date(2000, 0, 1, 12);
  fineMese.setFullYear(annoTarget, meseTarget + 1, 0);
  const giorno = Math.min(partenza.getDate(), fineMese.getDate());

  const risultato = new Date(istante);
  risultato.setFullYear(annoTarget, meseTarget, giorno);
  return Date.UTC(risultato.getFullYear(), risultato.getMonth(), risultato.getDate());
}

/**
 * La finestra temporale che una scala ritaglia sull'asse dei tempi.
 *
 * Funzione pura: `now` arriva come argomento, quindi l'esito non dipende
 * dall'orologio della macchina e il test è riproducibile.
 *
 * Per «tutto lo storico» la finestra **non è un caso a parte**: è il caso senza
 * ritaglio, e coincide esattamente con il dominio X che `calcolaScalaSerie`
 * calcola da sé quando nessuna finestra le viene passata — dal primo istante
 * d'archivio (o da adesso, se i punti sono tutti futuri) fino a oggi (o
 * all'ultimo punto, se un carico porta una data futura).
 */
export function calcolaFinestra({ scala, punti, now }: CalcolaFinestraInput): FinestraTemporale {
  const istanteOra = aIstante(now);
  const definizione = definizioneScala(scala);

  if (definizione.mesi === null) {
    const validi = puntiValidi(punti);
    const istanti = validi.map((p) => p.at);
    const primoIstante = istanti.length > 0 ? Math.min(...istanti) : istanteOra;
    const ultimoIstante = istanti.length > 0 ? Math.max(...istanti) : istanteOra;
    return { da: Math.min(primoIstante, istanteOra), a: Math.max(ultimoIstante, istanteOra) };
  }

  return { da: retrocediMesi(istanteOra, definizione.mesi), a: istanteOra };
}

/**
 * Quanto la finestra chiesta è coperta dai dati d'archivio.
 *
 * - `assente`: nella finestra non cade **alcun** punto;
 * - `parziale`: il primo punto d'archivio è **posteriore** all'inizio della
 *   finestra, cioè l'orizzonte chiesto supera la storia esistente;
 * - `piena`: la storia comincia prima della finestra, che è quindi coperta per
 *   quanto l'archivio possa coprirla.
 */
export type Copertura = 'piena' | 'parziale' | 'assente';

/**
 * Ingresso di `ritagliaSerie`.
 *
 * Generico sul tipo del punto (US-039): il ritaglio è un **filtro sugli
 * istanti** e non ha ragione di perdere i campi in più di un punto più ricco —
 * `PuntoValore` porta la quantità detenuta e il gradino, e ritagliarlo a
 * `PuntoSerie` obbligherebbe a una seconda funzione gemella.
 */
export interface RitagliaSerieInput<P extends PuntoSerie = PuntoSerie> {
  /** La serie intera, prodotta da `componiSerieTitolo` (o da `componiSerieValore`). */
  punti: readonly P[];
  /** La finestra prodotta da `calcolaFinestra`. */
  finestra: FinestraTemporale;
}

/** Esito del ritaglio: i punti visibili **e** il verdetto sulla copertura. */
export interface RitaglioSerie<P extends PuntoSerie = PuntoSerie> {
  /** I soli punti che cadono nella finestra, nell'ordine d'origine. */
  punti: P[];
  /** Il verdetto sulla finestra chiesta. */
  copertura: Copertura;
  /**
   * Istante del **primo punto d'archivio** (dell'intera serie, non del ritaglio):
   * è la data da cui i dati esistono davvero, e il criterio 5 la vuole
   * dichiarata. `null` quando la serie è vuota.
   */
  primoDatoDisponibile: number | null;
}

/**
 * Ritaglia la serie sulla finestra e dichiara quanto la finestra è coperta.
 *
 * **Nessun riporto dell'ultimo prezzo noto.** La tentazione classica è ancorare a
 * sinistra l'ultimo prezzo conosciuto perché «la linea deve partire da
 * qualcosa»: sarebbe un valore timbrato a un istante in cui non è stato
 * osservato, cioè la stessa cosa che ADR-003 vieta e che US-036 ha già rifiutato
 * per il punto sintetico a oggi. Finestra senza punti significa *dato non
 * disponibile*, punto.
 */
export function ritagliaSerie<P extends PuntoSerie>({
  punti,
  finestra,
}: RitagliaSerieInput<P>): RitaglioSerie<P> {
  const validi = puntiValidi(punti);
  const istanti = validi.map((p) => p.at);
  const primoDatoDisponibile = istanti.length > 0 ? Math.min(...istanti) : null;

  // Estremi **chiusi**: un punto esattamente sull'inizio o sulla fine della
  // finestra è dentro. Dichiararlo qui evita che ogni chiamante lo decida da sé.
  const ritagliati = validi.filter((p) => p.at >= finestra.da && p.at <= finestra.a);

  let copertura: Copertura;
  if (ritagliati.length === 0) {
    // `assente` ha la precedenza su `parziale`: una finestra vuota è vuota anche
    // quando l'archivio possiede punti prima del suo inizio.
    copertura = 'assente';
  } else if (primoDatoDisponibile !== null && primoDatoDisponibile > finestra.da) {
    copertura = 'parziale';
  } else {
    copertura = 'piena';
  }

  return { punti: ritagliati, copertura, primoDatoDisponibile };
}

/** Dominio del grafico: gli estremi degli assi, tutti finiti e con ampiezza non nulla. */
export interface ScalaSerie {
  /** Estremo sinistro dell'asse X (unix ms). */
  xMin: number;
  /** Estremo destro dell'asse X (unix ms). */
  xMax: number;
  /** Estremo inferiore dell'asse Y (prezzo). */
  yMin: number;
  /** Estremo superiore dell'asse Y (prezzo). */
  yMax: number;
}

/** Ingresso di `calcolaScalaSerie`. */
export interface CalcolaScalaInput {
  /** La serie prodotta da `componiSerieTitolo` (o da `componiSerieValore`). */
  punti: readonly PuntoSerie[];
  /**
   * Prezzo medio di carico: la riga di riferimento, sempre dentro il dominio Y.
   *
   * `null` significa **nessuna riga di riferimento** e non «riga nascosta»: è il
   * criterio 5 di US-039 reso vero *nel dominio*. Nella vista del valore della
   * posizione l'ordinata porta controvalori, e un prezzo per quota non vi
   * individua alcun livello: non entra quindi nemmeno nel calcolo degli estremi,
   * perché una scala allargata per accogliere una riga che nessuno disegna
   * schiaccerebbe la curva senza che nulla lo dica.
   */
  prezzoMedio: number | null;
  /**
   * Istante corrente, estremo destro dell'asse X. Arriva come **argomento** e
   * non dall'orologio, come già fa il server con `PositionsRoutesOptions.now`:
   * è ciò che rende la funzione pura e il grafico riproducibile in un test.
   * Accetta un `Date` (la forma che il server passa in giro) o direttamente
   * unix ms.
   */
  now: number | Date;
  /**
   * La finestra scelta dall'utente (US-037), quando c'è.
   *
   * Quando è presente e finita, `xMin`/`xMax` sono i suoi estremi: l'asse copre
   * **davvero** l'orizzonte chiesto, anche se i dati ne occupano una parte sola —
   * un asse che si accorciasse fino al primo dato riempirebbe la larghezza
   * disponibile lasciando intendere una copertura piena.
   *
   * Quando manca, la funzione si comporta esattamente come in US-036: il campo è
   * opzionale proprio perché quel comportamento non deve cambiare.
   *
   * **Contratto:** `punti` deve essere già ritagliato sulla finestra (l'esito di
   * `ritagliaSerie`). La funzione non ritaglia: passare la serie intera con una
   * finestra stretta dilaterebbe la scala dei prezzi su punti che nessuno vede,
   * e nulla lo segnalerebbe.
   */
  finestra?: FinestraTemporale;
  /**
   * Fissa `yMin` a **zero** (US-039), lasciando comunque un'ampiezza non nulla.
   *
   * Serve alla sola vista del valore della posizione, e la ragione è che quella
   * è una grandezza **assoluta**: tagliarne la base ingrandirebbe di nascosto
   * proprio il gradino del nuovo carico, cioè il fatto che quella vista esiste
   * per misurare onestamente. Sul prezzo unitario lo zero non serve — l'ordinata
   * resta ancorata alle quotazioni osservate, come in US-036 — e l'opzione è
   * assente per difetto perché quel comportamento non deve cambiare.
   */
  ancoraAZero?: boolean;
}

/**
 * Ampiezza X minima quando la serie non ne offre: un giorno per lato.
 * Un giorno perché è il passo naturale del dominio — i carichi sono date civili
 * e le rilevazioni al più giornaliere — quindi un punto solo si presenta
 * centrato nella sua giornata anziché schiacciato sul bordo.
 */
const MARGINE_X_MS = 24 * 60 * 60 * 1000;

/**
 * Ampiezza Y minima quando i prezzi sono tutti identici: il 5% del valore, così
 * il margine resta proporzionato sia a un ETF da 8 € sia a un titolo da 900 €.
 */
const MARGINE_Y_RELATIVO = 0.05;

/**
 * Minimo assoluto del margine Y. Serve al caso limite del prezzo 0, dove il
 * margine proporzionale sarebbe anch'esso 0 e l'ampiezza resterebbe nulla.
 */
const MARGINE_Y_MINIMO = 0.01;

/** Valore su cui centrare il dominio Y quando non c'è alcun prezzo utilizzabile. */
const PREZZO_DI_RIPIEGO = 0;

/** Normalizza l'istante corrente in unix ms, l'unità della serie. */
function aIstante(now: number | Date): number {
  const ms = now instanceof Date ? now.getTime() : now;
  // Un `Date` non valido (`getTime()` → NaN) o un numero non finito
  // avvelenerebbero l'intero asse X: si ripiega sull'unico istante certo.
  return Number.isFinite(ms) ? ms : Date.parse('1970-01-01T00:00:00Z');
}

/**
 * Calcola il dominio degli assi del grafico.
 *
 * Non lancia mai e non restituisce mai `NaN` o `Infinity`: una coordinata non
 * finita non produce un errore visibile ma un `path` SVG che non disegna nulla,
 * cioè un grafico *invisibile* — il guasto peggiore, perché sembra un dato
 * assente. Ogni caso degenere ha quindi una regola esplicita.
 */
export function calcolaScalaSerie({
  punti,
  prezzoMedio,
  now,
  finestra,
  ancoraAZero = false,
}: CalcolaScalaInput): ScalaSerie {
  const istanteOra = aIstante(now);

  // Si lavora solo su punti integri: un punto malformato arrivato da un chiamante
  // diverso da `componiSerieTitolo` non deve contaminare il dominio.
  const validi = puntiValidi(punti);

  // Il prezzo medio entra nel dominio Y **sempre**: la sua riga di riferimento
  // deve restare visibile anche quando cade fuori dall'intervallo dei prezzi
  // osservati (terzo caso degenere) — situazione ordinaria, per esempio con un
  // titolo che dopo il carico si è mosso in una sola direzione. Il `null` è il
  // caso opposto e non un caso degenere: nessuna riga da collocare, quindi
  // nessun estremo da allargare per accoglierla (US-039, criterio 5).
  const medioUtilizzabile = prezzoMedio !== null && Number.isFinite(prezzoMedio);

  // ─── Asse X ────────────────────────────────────────────────────────────────
  // L'origine è il **primo carico**: è lì che inizia la storia dell'utente con
  // il titolo. Se di carichi non ce n'è (posizione ancora senza righe, ma con
  // rilevazioni già registrate) si ripiega sul primo punto disponibile.
  const primoCarico = validi.find((p) => p.origin === 'carico');
  const primoPunto = validi[0];
  const inizio = primoCarico?.at ?? primoPunto?.at ?? istanteOra;

  // `xMax` è `now` anche quando l'ultimo punto è anteriore (criterio 2): il
  // silenzio recente è a sua volta un'informazione, e va mostrato come vuoto.
  // Il massimo con l'ultimo punto è solo una salvaguardia: l'inserimento
  // consente una data di carico futura, e senza di esso quel punto cadrebbe
  // fuori dal riquadro disegnabile.
  const ultimoPunto = validi.length > 0 ? Math.max(...validi.map((p) => p.at)) : istanteOra;
  // Salvaguardia simmetrica a quella su `xMax`: `priceHistory` è per **ISIN** e
  // non per posizione, quindi una rilevazione può precedere il primo carico —
  // registrata mentre il titolo stava in un altro portafoglio, oppure creata dal
  // backfill di US-009 dalla riga di cache. Senza questo minimo quei punti
  // cadrebbero a sinistra del riquadro disegnabile: fuori dal grafico e senza
  // alcun segnale. Nel caso ordinario (nessun punto anteriore al carico) `xMin`
  // resta il primo carico, come vuole il criterio 2.
  const primoIstante = validi.length > 0 ? Math.min(...validi.map((p) => p.at)) : istanteOra;

  // Con una finestra l'asse è quello chiesto dall'utente e non quello che i dati
  // suggeriscono. Gli estremi non finiti vengono ignorati invece che propagati:
  // una coordinata `NaN` non solleva eccezioni, produce un disegno invisibile.
  const finestraUtilizzabile =
    finestra !== undefined && Number.isFinite(finestra.da) && Number.isFinite(finestra.a)
      ? finestra
      : undefined;

  let xMin = finestraUtilizzabile?.da ?? Math.min(inizio, istanteOra, primoIstante);
  let xMax = finestraUtilizzabile?.a ?? Math.max(istanteOra, ultimoPunto);

  // Primo caso degenere: un solo punto (o serie vuota con `now` == inizio).
  // Ampiezza X nulla ⇒ divisione per zero nella scala ⇒ coordinate NaN.
  if (!(xMax > xMin)) {
    xMin -= MARGINE_X_MS;
    xMax += MARGINE_X_MS;
  }

  // ─── Asse Y ────────────────────────────────────────────────────────────────
  const prezzi = validi.map((p) => p.price);
  if (medioUtilizzabile) prezzi.push(prezzoMedio);

  // Serie vuota e prezzo medio inutilizzabile: dominio degenere ma **finito**,
  // centrato su un valore dichiarato. Meglio un grafico vuoto e in scala che
  // un'eccezione da gestire in ogni chiamante.
  let yMin = prezzi.length > 0 ? Math.min(...prezzi) : PREZZO_DI_RIPIEGO;
  let yMax = prezzi.length > 0 ? Math.max(...prezzi) : PREZZO_DI_RIPIEGO;

  // L'ancoraggio a zero abbassa la base, non la alza: `Math.min` e non
  // l'assegnazione secca, così un valore negativo — che la serie del valore non
  // produce, ma un chiamante futuro potrebbe — resta comunque dentro il dominio
  // invece di finire fuori dal riquadro disegnabile.
  if (ancoraAZero) yMin = Math.min(0, yMin);

  // Secondo caso degenere: prezzi tutti identici (tipico del titolo con un solo
  // carico e nessuna rilevazione, dove prezzo e prezzo medio coincidono).
  // Il margine è proporzionale al valore, con un minimo assoluto che copre il
  // prezzo 0 — dove la sola proporzione lascerebbe l'ampiezza a zero.
  if (!(yMax > yMin)) {
    const margine = Math.max(Math.abs(yMax) * MARGINE_Y_RELATIVO, MARGINE_Y_MINIMO);
    // Con l'ancoraggio il margine si aggiunge **solo in alto**: abbassare `yMin`
    // sotto lo zero contraddirebbe l'ancoraggio appena dichiarato, e la base
    // della grandezza assoluta tornerebbe a essere tagliata — di poco, in
    // silenzio, esattamente il difetto che l'opzione esiste per impedire.
    if (!ancoraAZero) yMin -= margine;
    yMax += margine;
  }

  return { xMin, xMax, yMin, yMax };
}
