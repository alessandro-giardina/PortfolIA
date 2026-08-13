/**
 * Serie del **valore aggregato del portafoglio** nel tempo (US-019, EP-006).
 *
 * Il valore del portafoglio a una data è la somma, su tutti i titoli detenuti a
 * quella data, di quantità detenuta × ultimo prezzo **noto**. «Noto» ha un
 * significato preciso e letterale (ADR-010): una **rilevazione realmente
 * registrata** (`price_observations`), riportata in avanti fino alla data del
 * punto se necessario. Il prezzo di **carico** non conta mai come quotazione —
 * è il prezzo pagato, non un fatto di mercato osservato — ed è la ragione per
 * cui un titolo appena comprato e mai più rilevato resta permanentemente «non
 * valorizzato» in questo modulo, anche se il suo prezzo di carico esiste.
 *
 * Come i moduli fratelli (`serieTitolo.ts`, `serieValore.ts`) le funzioni sono
 * **pure**: nessuna rete, nessun archivio, nessun orologio. L'ingresso è quanto
 * `GET /api/portfolios/:id/series` (`PortfolioSeriesEntry[]`, TASK-05) già
 * restituisce; l'aggregazione fra titoli avviene qui, lato dominio condiviso.
 *
 * ## I due zeri
 *
 * Il modulo distingue due stati che si assomigliano a schermo ma non sono lo
 * stesso fatto:
 *
 * - **zero titoli detenuti** a una data ⇒ il portafoglio vale `0`, un valore
 *   **misurato**: un portafoglio vuoto vale zero, punto;
 * - **titoli detenuti ma nessuno valorizzato** ⇒ il totale è **non
 *   affermabile** (`null`), non zero: non sappiamo quanto valga, e scrivere `0`
 *   sarebbe un dato falso spacciato per un fatto.
 *
 * Un terzo caso, intermedio, esiste ed è diverso da entrambi: titoli detenuti,
 * *alcuni* valorizzati e altri no. Qui il totale non è `null` — è la somma dei
 * soli titoli valorizzati, una somma parziale che la resa dichiara come tale
 * (barrata, con il conteggio) invece di nasconderla o di spacciarla per il
 * totale vero.
 *
 * ## Copertura piena e parziale
 *
 * Un punto è a copertura **piena** quando ogni titolo detenuto in quel momento
 * ha un prezzo noto (vacuamente vero anche a zero titoli detenuti: «ogni
 * titolo detenuto», applicato all'insieme vuoto, non trova eccezioni). È
 * **parziale** altrimenti. Il tratto prima della prima copertura piena non va
 * disegnato come se il portafoglio valesse meno (criterio 6 di US-019): va
 * dichiarato parziale, con quanti titoli non sono ancora valorizzati.
 */

// `import type` e non un import a runtime: `types/index.ts` riesporta questo
// modulo con `export *`, quindi un import di valori qui creerebbe un ciclo fra
// i due file.
import type { Copertura, OriginePunto, PuntoSerie, RilevazioneSerie } from './serieTitolo.js';
// Import a runtime **consentito**: né `serieTitolo.ts` né `serieValore.ts`
// importano a loro volta questo modulo, quindi non c'è ciclo. La regola della
// data civile (`istanteDataCivile`) e quella della quantità detenuta
// (`quantitaDetenutaA`, US-045) vivono già altrove e non si riscrivono qui.
import { istanteDataCivile } from './serieTitolo.js';
import type { CaricoValore, VenditaValore } from './serieValore.js';
import { quantitaDetenutaA } from './serieValore.js';

// ─── Il perimetro: un titolo nel portafoglio ─────────────────────────────────

/**
 * Un titolo del perimetro del portafoglio: i soli campi con cui questo modulo
 * compone la serie aggregata. Ritaglio deliberato sui tipi già dichiarati da
 * `serieTitolo.ts`/`serieValore.ts` (`CaricoValore`, `VenditaValore`,
 * `RilevazioneSerie`) — nessun tipo gemello, nessuna seconda regola di lettura
 * dei carichi o delle rilevazioni.
 */
export interface TitoloPortafoglio {
  /** Codice ISIN normalizzato. */
  isin: string;
  /** Denominazione ufficiale del titolo; `null` se non disponibile. */
  name: string | null;
  /** I carichi di questo ISIN nel portafoglio. */
  loads: readonly CaricoValore[];
  /** Le vendite di questo ISIN nel portafoglio. */
  sales: readonly VenditaValore[];
  /**
   * Le rilevazioni di prezzo dell'ISIN. L'ordine non è rilevante per questo
   * modulo: `prezzoNotoA` le scandisce tutte e ne trova il massimo istante non
   * successivo alla data chiesta, quindi non richiede un ordinamento a monte.
   */
  priceHistory: readonly RilevazioneSerie[];
}

// ─── Il prezzo noto a una data ────────────────────────────────────────────────

/**
 * Provenienza del prezzo usato per un titolo a una data:
 *
 * - `'del-giorno'`: esiste una rilevazione registrata **in quella data stessa**;
 * - `'riportato'`: la rilevazione più recente non successiva alla data è
 *   **anteriore**, e viene riportata in avanti fino al punto;
 * - `'nessuno'`: non esiste alcuna rilevazione non successiva alla data — il
 *   titolo è detenuto ma non valorizzabile. Il prezzo di carico non è un
 *   ripiego: non conta mai come quotazione (ADR-010).
 */
export type StatoPrezzo = 'del-giorno' | 'riportato' | 'nessuno';

/**
 * L'ultimo prezzo noto di un titolo a una data, con la sua provenienza.
 *
 * Unione discriminata su `stato`: i campi numerici sono garantiti presenti
 * (e finiti) esattamente quando `stato` non è `'nessuno'`, così chi consuma il
 * valore non ha bisogno di un cast — un `if (prezzo.stato !== 'nessuno')`
 * restringe il tipo e apre `prezzo.prezzo` come `number`.
 */
export type PrezzoNoto =
  | { stato: 'nessuno'; prezzo: null; osservatoA: null; etaGiorni: null }
  | { stato: 'del-giorno'; prezzo: number; osservatoA: number; etaGiorni: 0 }
  | { stato: 'riportato'; prezzo: number; osservatoA: number; etaGiorni: number };

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Il giorno **UTC** di un istante, ancorato a mezzanotte: base per la
 * differenza in giorni civili fra una rilevazione e la data del punto.
 *
 * Si ancora in UTC per la stessa ragione di `istanteDataCivile`: gli istanti
 * che arrivano a questo modulo per i carichi e le vendite sono già ancorati in
 * UTC da quella funzione, e questa àncora recupera esattamente lo stesso
 * giorno indipendentemente dal fuso di chi esegue il codice. Per una
 * rilevazione (istante reale, non data civile) il margine è lo stesso già
 * dichiarato altrove nel dominio (`retrocediMesi`): un'osservazione registrata
 * nelle prime o nelle ultime ore locali di una giornata, vicino al confine
 * UTC, può leggersi come il giorno adiacente rispetto alla resa *locale* dello
 * storico prezzi (US-009) — un margine di ore su un'età in giorni.
 */
function giornoUTC(at: number): number {
  const d = new Date(at);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Trova l'ultimo prezzo **noto** di un titolo a una data: l'ultima rilevazione
 * effettivamente registrata (`priceHistory`) non successiva a `at`, riportata
 * in avanti se necessario. Non guarda mai `loads`: il prezzo di carico non è
 * una quotazione (ADR-010, e vedi la nota di modulo su «noto»).
 *
 * Restituisce `{ stato: 'nessuno', ... }` quando nessuna rilevazione precede o
 * coincide con `at` — compreso il caso di `at` non finito, che altrimenti
 * propagherebbe un confronto sempre falso e un risultato indistinguibile da
 * «nessun prezzo» solo per fortuna.
 */
export function prezzoNotoA(titolo: TitoloPortafoglio, at: number): PrezzoNoto {
  if (!Number.isFinite(at)) return { stato: 'nessuno', prezzo: null, osservatoA: null, etaGiorni: null };

  let migliore: { osservatoA: number; prezzo: number } | null = null;
  for (const rilevazione of titolo.priceHistory) {
    if (!Number.isFinite(rilevazione.observedAt) || !Number.isFinite(rilevazione.price)) continue;

    // `observedAt` è in unix secondi (come in `componiSerieTitolo`): conversione
    // esplicita ai millisecondi, l'unità di `at`.
    const osservatoA = rilevazione.observedAt * 1000;
    if (osservatoA > at) continue; // mai una rilevazione successiva alla data del punto

    if (migliore === null || osservatoA > migliore.osservatoA) {
      migliore = { osservatoA, prezzo: rilevazione.price };
    }
  }

  if (migliore === null) return { stato: 'nessuno', prezzo: null, osservatoA: null, etaGiorni: null };

  // Non può risultare negativo: `migliore.osservatoA <= at` per costruzione, e
  // il troncamento a giorno UTC è monotono.
  const etaGiorni = Math.round((giornoUTC(at) - giornoUTC(migliore.osservatoA)) / MS_PER_DAY);

  if (etaGiorni <= 0) {
    return { stato: 'del-giorno', prezzo: migliore.prezzo, osservatoA: migliore.osservatoA, etaGiorni: 0 };
  }
  return { stato: 'riportato', prezzo: migliore.prezzo, osservatoA: migliore.osservatoA, etaGiorni };
}

// ─── Le date d'evento del portafoglio ────────────────────────────────────────

/** Un evento del perimetro: la data e l'origine con precedenza più alta a pari data. */
interface EventoPortafoglio {
  at: number;
  origin: OriginePunto;
}

/**
 * Precedenza a pari data per l'origine del punto **aggregato**: gemella di
 * quella privata di `componiSerieTitolo`, e non importata da lì perché quella
 * non è esportata — il criterio (il carico è il fatto anteriore della
 * giornata, la rilevazione il più recente) è lo stesso, applicato qui
 * all'origine con precedenza più alta fra *tutti* i titoli che hanno un
 * evento nella stessa data, non a un solo titolo.
 */
const PRECEDENZA_ORIGINE_PORTAFOGLIO: Record<OriginePunto, number> = {
  carico: 0,
  vendita: 1,
  rilevazione: 2,
};

/**
 * Raccoglie, deduplica e ordina le date d'evento di tutti i titoli del
 * perimetro, con l'origine di precedenza più alta osservata in ciascuna data.
 * Nucleo privato condiviso da `dateEventoPortafoglio` (che ne scarta
 * l'origine) e da `componiSerieValorePortafoglio` (che la usa per il punto
 * aggregato): un solo giro sui titoli, non due regole che potrebbero
 * divergere.
 */
function eventiPortafoglio(titoli: readonly TitoloPortafoglio[]): EventoPortafoglio[] {
  const mappa = new Map<number, OriginePunto>();

  const registra = (at: number, origin: OriginePunto): void => {
    if (!Number.isFinite(at)) return; // data malformata: scartata, non propagata
    const esistente = mappa.get(at);
    if (
      esistente === undefined ||
      PRECEDENZA_ORIGINE_PORTAFOGLIO[origin] > PRECEDENZA_ORIGINE_PORTAFOGLIO[esistente]
    ) {
      mappa.set(at, origin);
    }
  };

  for (const titolo of titoli) {
    for (const carico of titolo.loads) {
      if (!Number.isFinite(carico.quantity)) continue;
      registra(istanteDataCivile(carico.loadDate), 'carico');
    }
    for (const vendita of titolo.sales) {
      if (!Number.isFinite(vendita.quantity)) continue;
      registra(istanteDataCivile(vendita.saleDate), 'vendita');
    }
    for (const rilevazione of titolo.priceHistory) {
      if (!Number.isFinite(rilevazione.price) || !Number.isFinite(rilevazione.observedAt)) continue;
      registra(rilevazione.observedAt * 1000, 'rilevazione');
    }
  }

  return [...mappa.entries()]
    .map(([at, origin]) => ({ at, origin }))
    .sort((a, b) => a.at - b.at);
}

/**
 * L'elenco ordinato e **deduplicato** delle date d'evento del portafoglio: un
 * punto per ogni carico, vendita o rilevazione di qualunque titolo del
 * perimetro, nessun punto dove non cade alcun evento, nessun punto duplicato
 * per eventi coincidenti nello stesso istante (anche fra titoli diversi).
 */
export function dateEventoPortafoglio(titoli: readonly TitoloPortafoglio[]): number[] {
  return eventiPortafoglio(titoli).map((evento) => evento.at);
}

// ─── Il punto aggregato e la serie ───────────────────────────────────────────

/** Il contributo di un singolo titolo a un punto della serie del portafoglio. */
export interface ContributoTitolo {
  /** Codice ISIN normalizzato. */
  isin: string;
  /** Denominazione ufficiale del titolo; `null` se non disponibile. */
  name: string | null;
  /** Quantità detenuta a questo punto (sempre `> 0`: un titolo non detenuto non compare fra i contributi). */
  quantita: number;
  /** Il prezzo usato per questo contributo, con la sua provenienza. */
  prezzo: PrezzoNoto;
  /**
   * Il controvalore del contributo: `quantita * prezzo.prezzo`. `null`
   * quando `prezzo.stato` è `'nessuno'` — il titolo è detenuto ma non
   * valorizzabile, e `null` lo dice senza inventare uno zero.
   */
  valore: number | null;
}

/**
 * Un punto della serie aggregata del valore del portafoglio.
 *
 * Estende `PuntoSerie` per riusare `at`/`origin` e la generica di
 * `ritagliaSerie`/`calcolaScalaSerie` (US-036). Il campo `price` che
 * `PuntoSerie` richiede porta lo stesso numero di `valoreTotale` quando questo
 * è affermabile, e `0` quando non lo è (`valoreTotale === null`): serve solo a
 * restare un `number` finito per quelle funzioni generiche, e **non** è la
 * fonte di verità sul valore — chi legge questo punto deve leggere
 * `valoreTotale` (e `copertura`), non `price` da solo, altrimenti un totale
 * «non affermabile» si confonderebbe con un vero zero misurato (i due zeri
 * di cui parla la nota di modulo).
 */
export interface PuntoPortafoglio extends PuntoSerie {
  /**
   * Il controvalore totale del portafoglio in questo punto.
   *
   * - `0` quando **zero titoli sono detenuti**: valore misurato, un fatto;
   * - `null` quando ci sono titoli detenuti ma **nessuno** è valorizzato: non
   *   affermabile, non zero;
   * - la somma dei soli titoli valorizzati (parziale o piena secondo
   *   `copertura`) in ogni altro caso.
   */
  valoreTotale: number | null;
  /** I contributi dei soli titoli detenuti a questo punto (quantità `> 0`). */
  contributi: ContributoTitolo[];
  /** Quanti titoli detenuti sono su un prezzo rilevato quel giorno stesso. */
  suPrezzoDelGiorno: number;
  /** Quanti titoli detenuti sono su una quotazione riportata da un giorno precedente. */
  suPrezzoRiportato: number;
  /** Quanti titoli detenuti non hanno alcun prezzo noto. */
  nonValorizzati: number;
  /**
   * Copertura del punto: `'piena'` quando ogni titolo detenuto ha un prezzo
   * noto (vacuamente vero anche a zero titoli detenuti — vedi la nota di
   * modulo), altrimenti `'parziale'`. Non assume mai `'assente'`: un punto
   * nasce solo su una data d'evento realmente accaduta.
   */
  copertura: Copertura;
}

/** La serie aggregata completa del valore del portafoglio. */
export interface SerieValorePortafoglio {
  /** I punti della serie, in ordine crescente per data. */
  punti: PuntoPortafoglio[];
  /**
   * Istante del primo punto a copertura piena; `null` se la serie non la
   * raggiunge mai. Prima di questo istante il tratto va dichiarato parziale
   * (criterio 6 di US-019), non disegnato come se il portafoglio valesse
   * meno.
   */
  primaCoperturaPiena: number | null;
}

/**
 * Compone la serie aggregata del valore del portafoglio da un elenco di
 * titoli. Per ogni data d'evento (`dateEventoPortafoglio`): la quantità
 * detenuta di ciascun titolo viene letta con `quantitaDetenutaA` (US-045), che
 * non retroagisce — i carichi e le vendite successivi alla data non contano —
 * e il prezzo con `prezzoNotoA`. Un titolo con quantità non positiva non è
 * detenuto a quella data e non entra nel perimetro del punto.
 */
export function componiSerieValorePortafoglio(
  titoli: readonly TitoloPortafoglio[],
): SerieValorePortafoglio {
  const eventi = eventiPortafoglio(titoli);
  const punti: PuntoPortafoglio[] = [];
  let primaCoperturaPiena: number | null = null;

  for (const evento of eventi) {
    const contributi: ContributoTitolo[] = [];
    let suPrezzoDelGiorno = 0;
    let suPrezzoRiportato = 0;
    let nonValorizzati = 0;
    let sommaConosciuta = 0;

    for (const titolo of titoli) {
      const quantita = quantitaDetenutaA(titolo.loads, titolo.sales, evento.at);
      // Non finita o non positiva: il titolo non è detenuto a questa data, e
      // non entra nel perimetro del punto (né fra i contributi né nei conteggi).
      if (!Number.isFinite(quantita) || quantita <= 0) continue;

      const prezzo = prezzoNotoA(titolo, evento.at);
      let valore: number | null = null;
      if (prezzo.stato !== 'nessuno') {
        const candidato = quantita * prezzo.prezzo;
        if (Number.isFinite(candidato)) valore = candidato;
      }

      if (valore === null) {
        nonValorizzati += 1;
      } else {
        sommaConosciuta += valore;
        if (prezzo.stato === 'del-giorno') suPrezzoDelGiorno += 1;
        else suPrezzoRiportato += 1;
      }

      contributi.push({ isin: titolo.isin, name: titolo.name, quantita, prezzo, valore });
    }

    const copertura: Copertura = nonValorizzati === 0 ? 'piena' : 'parziale';

    // I due zeri (vedi nota di modulo): zero titoli detenuti è un valore
    // misurato; titoli detenuti e tutti non valorizzati è "non affermabile".
    // Il caso intermedio (alcuni valorizzati, altri no) resta la somma
    // parziale dei soli titoli valorizzati — mai `null`, perché quella somma
    // esiste ed è scrivibile, solo non completa.
    const valoreTotale =
      contributi.length === 0 ? 0 : nonValorizzati === contributi.length ? null : sommaConosciuta;

    if (primaCoperturaPiena === null && copertura === 'piena') {
      primaCoperturaPiena = evento.at;
    }

    punti.push({
      at: evento.at,
      // Vedi il commento su `PuntoPortafoglio.price`: qui solo per restare un
      // `number` finito, mai la fonte di verità.
      price: valoreTotale ?? 0,
      origin: evento.origin,
      valoreTotale,
      contributi,
      suPrezzoDelGiorno,
      suPrezzoRiportato,
      nonValorizzati,
      copertura,
    });
  }

  return { punti, primaCoperturaPiena };
}

// ─── La copertura del perimetro sulla finestra ritagliata (US-020) ───────────

/**
 * Il verdetto sulla **seconda** dimensione della copertura di un aggregato.
 *
 * Per un singolo titolo la copertura è una domanda sola — la finestra chiesta è
 * coperta dall'archivio, oppure no — ed è quella che `ritagliaSerie` già
 * risponde (`Copertura`). Per un portafoglio le domande sono due e
 * **indipendenti**: quanta parte della finestra l'archivio possiede *nel tempo*,
 * e quanti dei titoli *detenuti* erano valorizzati alle date che l'archivio
 * copre. Possono essere una piena e l'altra parziale, e nessuna delle due si
 * deduce dall'altra.
 *
 * Il terzo esito è `'senza-oggetto'` e **non** `'piena'`. Con zero punti in
 * finestra l'affermazione «ogni titolo detenuto ha un prezzo noto» è vera solo
 * *vacuamente*: non c'è alcuna data su cui contare i titoli valorizzati, quindi
 * non è stato guardato nulla. Scritta a schermo, «piena» si leggerebbe come una
 * rassicurazione sopra un riquadro che non mostra niente — cioè il guasto
 * silenzioso che ADR-003 vieta.
 */
export type VerdettoPerimetro = 'piena' | 'parziale' | 'senza-oggetto';

/** Quanto il perimetro è coperto **dentro la finestra ritagliata**. */
export interface CoperturaPerimetro {
  /** Il verdetto sulla seconda dimensione. */
  verdetto: VerdettoPerimetro;
  /**
   * Istante del primo punto **della finestra** a copertura piena; `null` quando
   * la finestra non ne contiene alcuno. È il confine da cui campire la zona a
   * perimetro incompleto: relativo alla finestra, mai globale (vedi
   * `coperturaPerimetroFinestra`).
   */
  primaCoperturaPiena: number | null;
  /** Quanti punti della finestra sono a copertura piena. */
  puntiPieni: number;
  /** Quanti punti della finestra hanno almeno un titolo detenuto non valorizzato. */
  puntiParziali: number;
}

/**
 * Misura la copertura del perimetro **sui soli punti ritagliati**, non sulla
 * serie intera.
 *
 * Il calcolo è deliberatamente relativo alla finestra, e non un riuso della
 * `primaCoperturaPiena` che `componiSerieValorePortafoglio` calcola sulla serie
 * completa, per due ragioni che sono entrambe casi reali e non ipotesi:
 *
 * - la copertura piena globale può cadere **prima** di `finestra.da`. Su una
 *   scala stretta quel confine è fuori campo: campire la zona fino a lì
 *   significherebbe disegnare un tratto incompleto che nella finestra non
 *   esiste, e dichiarare «completo dal …» una data che l'asse non mostra;
 * - la copertura può **regredire**. Un titolo iscritto a registro e mai
 *   rilevato entra nel perimetro alla sua data di carico e rende parziali i
 *   punti successivi, dopo un tratto che era pieno. Un valore globale calcolato
 *   una volta sola non tornerebbe mai indietro, e sopra una finestra aperta sul
 *   tratto regredito affermerebbe una copertura che lì non c'è più.
 *
 * Funzione pura: nessun orologio, nessuna finestra da ricalcolare — riceve i
 * punti che `ritagliaSerie` ha già selezionato e non ne scarta né aggiunge
 * alcuno.
 */
export function coperturaPerimetroFinestra(
  punti: readonly PuntoPortafoglio[],
): CoperturaPerimetro {
  let puntiPieni = 0;
  let puntiParziali = 0;
  let primaCoperturaPiena: number | null = null;

  for (const punto of punti) {
    if (punto.copertura === 'piena') {
      puntiPieni += 1;
      if (primaCoperturaPiena === null) primaCoperturaPiena = punto.at;
    } else {
      puntiParziali += 1;
    }
  }

  const verdetto: VerdettoPerimetro =
    punti.length === 0 ? 'senza-oggetto' : puntiParziali === 0 ? 'piena' : 'parziale';

  return { verdetto, primaCoperturaPiena, puntiPieni, puntiParziali };
}
