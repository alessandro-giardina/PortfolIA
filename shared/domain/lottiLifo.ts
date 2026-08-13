/**
 * L'attribuzione **LIFO** dei lotti alle vendite (US-042, FR-022, FR-023,
 * FR-024, ADR-009).
 *
 * È il modulo che rende vera la tesi di ADR-009: **una vendita non tocca i
 * carichi**. Il registro conserva due specie di iscrizione — carichi e vendite —
 * e tutto ciò che di solito si «aggiorna» al momento della vendita (la quantità
 * residua del lotto, il costo attribuito, il prezzo medio del residuo) non è
 * memorizzato da nessuna parte: si ottiene **rigiocando il registro** dall'inizio
 * ogni volta che serve. Il costo è ricalcolare; il guadagno è che nessun valore
 * derivato può divergere dai fatti che lo generano, perché non esiste una seconda
 * copia da tenere allineata.
 *
 * LIFO è **un ordine**, e l'ordine è l'intero contenuto del criterio: si consumano
 * per primi i carichi con data più recente **fra quelli non successivi alla data
 * di vendita**. Quella restrizione non è un dettaglio difensivo — è la ragione per
 * cui una vendita antedatata può essere rifiutata pur essendoci quote a sufficienza
 * (criterio 5): le quote esistono, ma non a quella data.
 *
 * Come per `metricheTitolo.ts` e `serieTitolo.ts`, le funzioni sono **pure**:
 * nessuna rete, nessun archivio, nessun orologio. Le date sono confrontate come
 * stringhe ISO `YYYY-MM-DD`, formato in cui l'ordine lessicografico *è* l'ordine
 * cronologico — lo stesso motivo per cui `positions.load_date` e `sales.sale_date`
 * sono TEXT nello schema.
 */

// `import type` e non un import a runtime: `types/index.ts` riesporta questo
// modulo, quindi un import di valori creerebbe un ciclo fra i due file.
import type { Position, Sale } from '../types/index.js';

/**
 * Il carico, ridotto ai soli campi che l'attribuzione legge.
 *
 * L'`id` **fa parte del contratto** e non è un accessorio: due carichi dello
 * stesso giorno sono a pari merito nell'ordine LIFO, e senza un secondo criterio
 * l'esito dipenderebbe dall'ordine in cui l'archivio restituisce le righe — cioè
 * sarebbe instabile fra due letture identiche.
 */
export type CaricoLotto = Pick<Position, 'id' | 'loadDate' | 'loadPrice' | 'quantity'>;

/**
 * La vendita, ridotta ai soli campi che l'attribuzione legge.
 *
 * Da US-043 porta anche `salePrice`: US-042 lo teneva deliberatamente fuori
 * perché LIFO attribuisce un *costo*, non un ricavo, ma il P&L realizzato — che
 * è US-043 — nasce dal confronto fra i due, e deve nascere qui e non altrove:
 * `rigiocaRegistro` è l'unico punto che percorre le attribuzioni lotto per
 * lotto, quindi è l'unico punto in cui `costoAttribuito` e `ricavo` sono
 * disponibili insieme senza ricalcolare l'attribuzione una seconda volta.
 */
export type VenditaLotto = Pick<Sale, 'id' | 'saleDate' | 'quantity' | 'salePrice'>;

/** Ingresso di `rigiocaRegistro`: il registro di **un solo ISIN** in **un solo portafoglio**. */
export interface RegistroInput {
  /** I carichi dell'ISIN, in qualunque ordine: la funzione li ordina da sé. */
  carichi: readonly CaricoLotto[];
  /** Le vendite dell'ISIN, in qualunque ordine: la funzione le ordina da sé. */
  vendite: readonly VenditaLotto[];
}

/** Quote di un lotto attribuite a una singola vendita. */
export interface AttribuzioneLotto {
  /** `id` del carico consumato. */
  caricoId: number;
  /** Data del carico consumato (ISO `YYYY-MM-DD`). */
  loadDate: string;
  /** Prezzo unitario di quel carico. */
  loadPrice: number;
  /** Quote prelevate da questo lotto per questa vendita. */
  quantita: number;
  /** Costo attribuito da questo lotto: `loadPrice × quantita`. */
  costo: number;
}

/** Esito dell'attribuzione di una singola vendita. */
export interface VenditaAttribuita {
  /** `id` della vendita. */
  venditaId: number;
  /** Data della vendita (ISO `YYYY-MM-DD`). */
  saleDate: string;
  /** Quote vendute, come iscritte a registro. */
  quantita: number;
  /** I lotti consumati, **nell'ordine in cui LIFO li ha consumati**. */
  attribuzioni: AttribuzioneLotto[];
  /** Somma dei costi attribuiti: Σ(`loadPrice × quantita`) sulle attribuzioni. */
  costoAttribuito: number;
  /** Ricavo della vendita: `salePrice × quantita` (US-043). */
  ricavo: number;
  /**
   * P&L realizzato di questa vendita: `ricavo − costoAttribuito` (US-043,
   * criterio 2).
   *
   * Calcolato qui, all'atto del rigioco, e **mai** dal prezzo corrente: è
   * l'unico modo in cui il congelamento del criterio 2 può essere vero per
   * costruzione. Una funzione che lo ricalcolasse da `currentPrice` lo farebbe
   * dipendere dalla rilevazione più recente, cioè esattamente ciò che il
   * criterio vieta.
   */
  pnlRealizzato: number;
  /**
   * Quote che nessun lotto ha potuto coprire.
   *
   * È `0` su ogni registro coerente, ed è l'unico modo in cui questa funzione
   * segnala un'incoerenza: non lancia e non inventa lotti. Un valore positivo
   * significa che il registro contiene una vendita non copribile — cosa che
   * `verificaVendita` esiste per impedire in scrittura, e che qui va comunque
   * rappresentata perché un archivio scritto da una versione precedente, o a mano,
   * deve poter essere letto senza far cadere una pagina.
   */
  scoperto: number;
}

/** Stato di un lotto dopo che tutte le vendite del registro sono state attribuite. */
export interface ResiduoLotto {
  /** `id` del carico. */
  caricoId: number;
  /** Data del carico (ISO `YYYY-MM-DD`). */
  loadDate: string;
  /** Prezzo unitario del carico. */
  loadPrice: number;
  /** Quantità **nominale** del carico, come iscritta a registro: mai modificata. */
  quantita: number;
  /** Quote non ancora consumate da alcuna vendita. Fra `0` e `quantita`. */
  quantitaResidua: number;
  /** Quote consumate da una o più vendite: `quantita − quantitaResidua`. */
  quantitaConsumata: number;
}

/** Esito completo del rigioco del registro di un ISIN. */
export interface RegistroRigiocato {
  /**
   * I lotti con il loro residuo, in ordine di registro — `(loadDate, id)`
   * crescente — cioè l'ordine in cui i carichi si leggono, **non** quello in cui
   * LIFO li consuma. L'ordine di consumo si legge dalle `attribuzioni`.
   */
  lotti: ResiduoLotto[];
  /** Le vendite attribuite, in ordine `(saleDate, id)` crescente. */
  vendite: VenditaAttribuita[];
  /** Σ delle quote caricate: Σ(`quantita`) sui lotti. */
  quantitaCaricata: number;
  /** Σ delle quote vendute: Σ(`quantita`) sulle vendite. */
  quantitaVenduta: number;
  /**
   * Σ delle quote non consumate: Σ(`quantitaResidua`) sui lotti.
   *
   * **Non è mai negativa**, per costruzione e non per controllo: nasce da una
   * sottrazione limitata dal residuo di ciascun lotto, quindi il criterio 4
   * («la quantità residua non è mai negativa») è vero anche su un archivio
   * incoerente. Su un registro coerente — `scopertoTotale === 0` — coincide con
   * `quantitaCaricata − quantitaVenduta`, che è la forma in cui il criterio la
   * enuncia.
   */
  quantitaResidua: number;
  /** Σ(`loadPrice × quantitaResidua`) sui lotti: il costo delle quote ancora detenute. */
  costoResiduo: number;
  /** Σ(`costoAttribuito`) sulle vendite: il costo delle quote uscite. */
  costoAttribuito: number;
  /**
   * Σ(`pnlRealizzato`) sulle vendite: il P&L **già incassato**, congelato
   * all'atto di ciascuna iscrizione (US-043, criterio 2).
   *
   * `0` — misurato, non assente — su un registro senza vendite: nessuna
   * vendita significa nessun realizzato, non un dato che manca.
   */
  pnlRealizzato: number;
  /**
   * Σ(`ricavo`) sulle vendite: l'incasso complessivo di tutte le vendite
   * attribuite (US-044).
   *
   * `0` — misurato, non assente — su un registro senza vendite, per la stessa
   * ragione di `pnlRealizzato`: è la cifra che alimenta la colonna «Incasso»
   * della sezione «Posizioni chiuse», e non dipende dal prezzo corrente.
   */
  ricavoTotale: number;
  /** Σ(`scoperto`) sulle vendite: `0` su ogni registro coerente. */
  scopertoTotale: number;
}

/** Ordine di **registro**: `(data, id)` crescente. */
function perData<T extends { readonly id: number }>(
  data: (voce: T) => string,
): (a: T, b: T) => number {
  return (a, b) => (data(a) < data(b) ? -1 : data(a) > data(b) ? 1 : a.id - b.id);
}

/**
 * Rigioca il registro di un ISIN attribuendo ogni vendita ai lotti secondo LIFO.
 *
 * Due ordini distinti, e nessuno dei due è arbitrario:
 *
 * - le **vendite** si attribuiscono in ordine cronologico `(saleDate, id)`
 *   crescente, perché una vendita può consumare soltanto ciò che le precedenti
 *   hanno lasciato. Attribuirle in un altro ordine darebbe residui per lotto
 *   diversi a parità di registro;
 * - i **lotti** si consumano in ordine `(loadDate, id)` **decrescente** — LIFO —
 *   fra i soli lotti con `loadDate <= saleDate`. Il pari merito fra due carichi
 *   dello stesso giorno è sciolto dall'`id`, cioè dall'ordine di iscrizione: è
 *   l'unico criterio già presente nei dati che non dipenda da come l'archivio
 *   restituisce le righe.
 *
 * La funzione **non lancia mai**. Una vendita non copribile lascia il suo
 * `scoperto` valorizzato e non intacca i lotti oltre il loro residuo: le viste di
 * lettura restano leggibili anche su un archivio incoerente, e la scrittura è
 * chiusa a monte da `verificaVendita`.
 */
export function rigiocaRegistro({ carichi, vendite }: RegistroInput): RegistroRigiocato {
  // Il residuo vive in una mappa e non sui lotti: i lotti in ingresso sono
  // `readonly`, e mutarli farebbe di questa funzione pura una funzione che
  // riscrive i carichi del chiamante — esattamente ciò che ADR-009 vieta al
  // modello di dati, e che sarebbe assurdo consentire al codice che lo attua.
  const residuo = new Map<number, number>(carichi.map((c) => [c.id, c.quantity]));

  // Due letture dello **stesso** ordine, calcolate una volta sola: il registro si
  // legge dal primo carico, LIFO lo consuma dall'ultimo. Derivare la seconda
  // invertendo la prima rende impossibile che i due ordini si scollino — due
  // `sort` indipendenti potrebbero sciogliere diversamente il pari merito.
  const ordineRegistro = [...carichi].sort(perData<CaricoLotto>((c) => c.loadDate));
  const ordineLifo = [...ordineRegistro].reverse();

  const attribuite: VenditaAttribuita[] = [];

  for (const vendita of [...vendite].sort(perData<VenditaLotto>((v) => v.saleDate))) {
    let daCoprire = vendita.quantity;
    const attribuzioni: AttribuzioneLotto[] = [];
    let costoAttribuito = 0;

    for (const carico of ordineLifo) {
      if (daCoprire <= 0) break;
      // Il lotto caricato **dopo** la data di vendita non esisteva ancora
      // all'operazione: non è attribuibile, e non lo diventa perché servirebbe.
      if (carico.loadDate > vendita.saleDate) continue;

      const disponibile = residuo.get(carico.id) ?? 0;
      if (disponibile <= 0) continue;

      const presa = Math.min(disponibile, daCoprire);
      residuo.set(carico.id, disponibile - presa);
      daCoprire -= presa;

      const costo = carico.loadPrice * presa;
      costoAttribuito += costo;
      attribuzioni.push({
        caricoId: carico.id,
        loadDate: carico.loadDate,
        loadPrice: carico.loadPrice,
        quantita: presa,
        costo,
      });
    }

    const ricavo = vendita.salePrice * vendita.quantity;

    attribuite.push({
      venditaId: vendita.id,
      saleDate: vendita.saleDate,
      quantita: vendita.quantity,
      attribuzioni,
      costoAttribuito,
      ricavo,
      pnlRealizzato: ricavo - costoAttribuito,
      scoperto: Math.max(0, daCoprire),
    });
  }

  const lotti: ResiduoLotto[] = ordineRegistro.map((carico) => {
    const quantitaResidua = residuo.get(carico.id) ?? 0;
    return {
      caricoId: carico.id,
      loadDate: carico.loadDate,
      loadPrice: carico.loadPrice,
      quantita: carico.quantity,
      quantitaResidua,
      quantitaConsumata: carico.quantity - quantitaResidua,
    };
  });

  // `costoResiduo` si somma per lotto e non come `prezzoMedio × residuo`: la media
  // è un quoziente, e ricostruire da essa il costo di un residuo parziale
  // aggiungerebbe un arrotondamento a un valore che i lotti conoscono esatto. Da
  // qui l'identità `costoAttribuito + costoResiduo = costo dei carichi`, che i
  // mockup mostrano a schermo e che i test verificano.
  const costoResiduo = lotti.reduce((somma, l) => somma + l.loadPrice * l.quantitaResidua, 0);

  return {
    lotti,
    vendite: attribuite,
    quantitaCaricata: lotti.reduce((somma, l) => somma + l.quantita, 0),
    quantitaVenduta: attribuite.reduce((somma, v) => somma + v.quantita, 0),
    quantitaResidua: lotti.reduce((somma, l) => somma + l.quantitaResidua, 0),
    costoResiduo,
    costoAttribuito: attribuite.reduce((somma, v) => somma + v.costoAttribuito, 0),
    pnlRealizzato: attribuite.reduce((somma, v) => somma + v.pnlRealizzato, 0),
    ricavoTotale: attribuite.reduce((somma, v) => somma + v.ricavo, 0),
    scopertoTotale: attribuite.reduce((somma, v) => somma + v.scoperto, 0),
  };
}

/**
 * Le quote **vendibili a una data**: la somma dei residui dei soli lotti con
 * `loadDate <= data`, estremo **incluso**.
 *
 * L'inclusione dell'estremo è la regola contabile, non una comodità: un titolo
 * comprato e rivenduto lo stesso giorno è un'operazione ordinaria, e un `<`
 * stretto la renderebbe impossibile da iscrivere. `perLotto` non serve: il
 * registro rigiocato porta già data e residuo di ogni lotto, quindi la funzione
 * non ha bisogno dei carichi originali.
 */
export function quantitaDisponibileA(registro: RegistroRigiocato, data: string): number {
  return registro.lotti
    .filter((lotto) => lotto.loadDate <= data)
    .reduce((somma, lotto) => somma + lotto.quantitaResidua, 0);
}

/**
 * Esito della verifica di una vendita **prima** di iscriverla.
 *
 * I due rifiuti sono **valori distinti e non un booleano con un testo**: i
 * criteri 4 e 5 chiedono due messaggi diversi perché la correzione è diversa —
 * la quantità nel primo caso, la data nel secondo — e un chiamante che ricevesse
 * un solo `false` sarebbe costretto a ricostruire da sé quale premessa è saltata.
 */
export type EsitoVerificaVendita =
  | {
      esito: 'ok';
      /** Quote disponibili alla data indicata: la vendita ne chiede al massimo tante. */
      disponibileAllaData: number;
    }
  | {
      /**
       * Le quote non ci sono, a nessuna data: la quantità chiesta supera la
       * giacenza residua complessiva. Si corregge la **quantità**.
       */
      esito: 'quantita-eccedente';
      disponibileAllaData: number;
      /** Giacenza residua complessiva, ignorando le date: Σ residui dei lotti. */
      disponibileTotale: number;
      messaggio: string;
    }
  | {
      /**
       * Le quote ci sono, ma **non a quella data**: una parte è stata caricata
       * dopo. Si corregge la **data** (o, in alternativa, la quantità).
       */
      esito: 'anteriore-al-carico';
      disponibileAllaData: number;
      disponibileTotale: number;
      messaggio: string;
    };

/** Ingresso di `verificaVendita`: il registro esistente e la vendita che si vorrebbe iscrivere. */
export interface VerificaVenditaInput extends RegistroInput {
  /** Data della vendita da iscrivere (ISO `YYYY-MM-DD`). */
  saleDate: string;
  /** Quote che si vorrebbero vendere. */
  quantita: number;
}

/** Formatta un intero di quote con il separatore delle migliaia italiano. */
function quote(n: number): string {
  return n.toLocaleString('it-IT');
}

/**
 * Verifica se una vendita può essere iscritta, e in caso contrario **perché**.
 *
 * L'ordine dei due controlli è l'ordine in cui vanno letti, e non è
 * intercambiabile. Quando la quantità supera la giacenza *complessiva* il
 * problema è la quantità, e resterebbe tale a qualunque data: dirlo per primo
 * evita di mandare l'utente a correggere una data che non c'entra. Solo quando la
 * giacenza complessiva basterebbe, ma quella *alla data* no, la causa è
 * l'antedatazione — ed è il criterio 5.
 *
 * Nessun controllo di formato vive qui: data ISO, prezzo positivo e quantità
 * intera sono validazioni della rotta, che le esegue prima di arrivare a questa
 * funzione. Qui si decide solo ciò che dipende dallo **stato del registro**.
 */
export function verificaVendita({
  carichi,
  vendite,
  saleDate,
  quantita,
}: VerificaVenditaInput): EsitoVerificaVendita {
  const registro = rigiocaRegistro({ carichi, vendite });
  const disponibileTotale = registro.quantitaResidua;
  const disponibileAllaData = quantitaDisponibileA(registro, saleDate);

  if (quantita > disponibileTotale) {
    return {
      esito: 'quantita-eccedente',
      disponibileAllaData,
      disponibileTotale,
      messaggio:
        `Non è possibile vendere ${quote(quantita)} quote: al ${saleDate} la quantità disponibile è ` +
        `${quote(disponibileAllaData)}. Nessuna iscrizione è stata registrata: correggere la quantità, ` +
        `oppure verificare che i carichi mancanti siano stati iscritti.`,
    };
  }

  if (quantita > disponibileAllaData) {
    return {
      esito: 'anteriore-al-carico',
      disponibileAllaData,
      disponibileTotale,
      messaggio:
        `Al ${saleDate} risultano disponibili ${quote(disponibileAllaData)} quote, non ` +
        `${quote(quantita)}: i carichi successivi a quella data non possono essere consumati da questa ` +
        `operazione. Le quote esistono, ma non a quella data: correggere la data di vendita, oppure la quantità.`,
    };
  }

  return { esito: 'ok', disponibileAllaData };
}

/** Ingresso di `residuoPerIsin`. */
export interface ResiduoPerIsinInput extends RegistroInput {
  /**
   * Prezzo corrente dall'archivio; `null` quando non è in cache. Sta qui e non
   * in una seconda funzione perché le tre viste aggregate — riepilogo, riepilogo
   * arricchito e dettaglio — ne hanno bisogno della stessa aritmetica, e due
   * copie di una formula nullable divergono senza che alcun test lo veda (è la
   * lezione di `calcolaPnlDaCarico`, US-038).
   */
  currentPrice?: number | null;
}

/**
 * La posizione **residua** per un ISIN: ciò che resta dopo le vendite.
 *
 * È il sostituto di `calcolaPnlDaCarico` per le viste aggregate, e ne conserva
 * deliberatamente la forma dei campi — `totalQuantity`, `avgLoadPrice`,
 * `totalLoadValue`, `currentValue`, `difference`, `differencePercent` — perché a
 * registro senza vendite deve restituire **esattamente** gli stessi numeri: il
 * passaggio dall'aggregazione SQL al dominio non deve muovere un centesimo su
 * nessuna posizione esistente.
 */
export interface ResiduoPosizione {
  /** Σ delle quote caricate: la quantità nominale iscritta a registro. */
  loadedQuantity: number;
  /** Σ delle quote vendute. */
  soldQuantity: number;
  /** Quantità **residua**: `loadedQuantity − soldQuantity` su un registro coerente, mai negativa. */
  totalQuantity: number;
  /**
   * Prezzo medio ponderato dei **soli lotti non consumati**, `null` a residuo 0.
   *
   * `null` e non `0`: a residuo nullo non esiste un residuo su cui calcolare una
   * media, e «0,0000» affermerebbe di aver comprato a zero (ADR-003). È l'unico
   * campo che diventa nullable per effetto delle vendite, ed è per questo che i
   * tre punti di resa mostrano il trattino invece di una cifra.
   */
  avgLoadPrice: number | null;
  /**
   * Controvalore di carico del residuo: `avgLoadPrice × totalQuantity`, e `0` a
   * residuo 0.
   *
   * Qui lo zero è **misurato, non inventato**: zero quote costano zero, e il
   * titolo contribuisce zero al valore del portafoglio. È la stessa distinzione
   * che `calcolaVariazionePeriodo` fa fra lo zero come misura e lo zero al posto
   * dell'assenza.
   */
  totalLoadValue: number;
  /** Valore attuale: `currentPrice × totalQuantity`, `null` senza prezzo corrente. */
  currentValue: number | null;
  /** Differenza: `currentValue − totalLoadValue`, `null` senza prezzo corrente. */
  difference: number | null;
  /** Differenza in percentuale sul controvalore di carico, `null` se non calcolabile. */
  differencePercent: number | null;
  /**
   * P&L **realizzato**: `registro.pnlRealizzato` (US-043, criterio 2).
   *
   * Mai `null`: un registro senza vendite ha realizzato `0` — misurato, non
   * assente — ed è la stessa distinzione di `totalLoadValue`. Non dipende dal
   * prezzo corrente, ed è per questo che non cambia al sopraggiungere di una
   * nuova rilevazione.
   */
  realizedPnl: number;
  /**
   * P&L **latente**: pari a `difference`, con una sola eccezione — a residuo
   * nullo vale `0` anche quando `currentPrice` è `null` (US-043, criterio 3).
   *
   * Non è un alias di `difference`: `difference` è `null` quando manca il
   * prezzo corrente *a prescindere dal residuo*, mentre qui lo zero a residuo
   * nullo è **misurato** — zero quote non hanno nulla in sospeso sul mercato,
   * che il prezzo corrente sia noto o non lo sia.
   */
  latentPnl: number | null;
  /**
   * Costo di **tutti** i carichi, lotti già venduti inclusi: `registro.costoAttribuito
   * + registro.costoResiduo` (US-043, criterio 5).
   *
   * È la base della percentuale del P&L totale, e deve restare il costo
   * complessivo e non il solo costo residuo: altrimenti la stessa identica
   * vendita a prezzo di mercato farebbe saltare la percentuale per il solo
   * fatto di essere avvenuta, senza che nulla di reale sia cambiato.
   */
  totalLoadCost: number;
  /**
   * P&L **totale**: `realizedPnl + latentPnl`, `null` quando `latentPnl` lo è
   * (US-043, criterio 1).
   */
  totalPnl: number | null;
  /**
   * Incasso complessivo: `registro.ricavoTotale` (US-044).
   *
   * Mai `null`, `0` — misurato — senza vendite: stessa disciplina di
   * `realizedPnl`, di cui è l'altro addendo (`ricavo − costoAttribuito =
   * pnlRealizzato`). Alimenta la colonna «Incasso» di «Posizioni chiuse».
   */
  soldRevenue: number;
  /** Il registro rigiocato, per chi deve mostrare il residuo lotto per lotto. */
  registro: RegistroRigiocato;
}

/**
 * La posizione residua di un ISIN, con i valori correnti quando il prezzo c'è.
 *
 * **L'ordine delle operazioni non si «semplifica».** `totalLoadValue` è
 * `avgLoadPrice × totalQuantity` e `difference` è `currentValue − totalLoadValue`:
 * sono le formule *letterali* che le tre viste avevano in linea prima di US-042,
 * e riscriverle in forma raccolta cambierebbe l'ultimo bit in virgola mobile
 * proprio nel caso — registro senza vendite — in cui la regressione pretende
 * l'identità cifra per cifra. Vale la stessa avvertenza scritta in
 * `calcolaPnlDaCarico`, per la stessa ragione.
 */
export function residuoPerIsin({
  carichi,
  vendite,
  currentPrice = null,
}: ResiduoPerIsinInput): ResiduoPosizione {
  const registro = rigiocaRegistro({ carichi, vendite });
  const totalQuantity = registro.quantitaResidua;

  const avgLoadPrice = totalQuantity > 0 ? registro.costoResiduo / totalQuantity : null;
  const totalLoadValue = avgLoadPrice !== null ? avgLoadPrice * totalQuantity : 0;

  const currentValue = currentPrice !== null ? currentPrice * totalQuantity : null;
  const difference = currentValue !== null ? currentValue - totalLoadValue : null;
  // La percentuale è definita solo su un controvalore di carico non nullo:
  // dividere per zero produrrebbe Infinity, cioè un numero inventato.
  const differencePercent =
    difference !== null && totalLoadValue !== 0 ? (difference / totalLoadValue) * 100 : null;

  // Zero **misurato**, non un alias di `difference`: a residuo nullo non c'è
  // nulla in sospeso sul mercato, prezzo corrente noto o non noto (criterio 3).
  const latentPnl = totalQuantity === 0 ? 0 : difference;

  const realizedPnl = registro.pnlRealizzato;
  const totalLoadCost = registro.costoAttribuito + registro.costoResiduo;
  const totalPnl = latentPnl !== null ? realizedPnl + latentPnl : null;
  const soldRevenue = registro.ricavoTotale;

  return {
    loadedQuantity: registro.quantitaCaricata,
    soldQuantity: registro.quantitaVenduta,
    totalQuantity,
    avgLoadPrice,
    totalLoadValue,
    currentValue,
    difference,
    differencePercent,
    realizedPnl,
    latentPnl,
    totalLoadCost,
    totalPnl,
    soldRevenue,
    registro,
  };
}
