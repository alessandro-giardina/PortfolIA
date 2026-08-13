/**
 * Serie del **valore della posizione** di un singolo titolo (US-039, FR-017).
 *
 * Questa spec non aggiunge un secondo grafico: aggiunge una seconda *domanda*
 * sugli stessi punti. Gli istanti sono identici nelle due viste — sono i carichi
 * e le rilevazioni che US-036 ha già fuso in `componiSerieTitolo` — e cambia solo
 * che cosa si legge sull'ordinata: il prezzo di una quota, oppure il controvalore
 * delle quote **effettivamente detenute** a quella data.
 *
 * Da qui la prima decisione di struttura: la serie del valore si compone **dalla
 * serie del prezzo**, non da carichi e rilevazioni riletti una seconda volta. Due
 * composizioni indipendenti potrebbero divergere sull'ordine o sui punti
 * scartati, e le due viste mostrerebbero due storie diverse dello stesso titolo.
 *
 * Il difetto che il modulo esiste per rendere impossibile è **la quantità
 * retroattiva**: moltiplicare l'intera serie per la quantità posseduta *oggi* è
 * la scorciatoia ovvia, dà una curva plausibile e afferma una cosa falsa — che
 * nel 2021 si possedessero già le quote comprate nel 2023. Per questo la quantità
 * è una funzione dell'istante (`quantitaDetenutaA`) e non un numero unico
 * applicato a tutta la serie. Un difetto del genere non si vede a occhio: la
 * curva sbagliata è più liscia di quella giusta.
 *
 * Come i due moduli fratelli (`serieTitolo.ts`, `metricheTitolo.ts`) le funzioni
 * sono **pure**: nessuna rete, nessun archivio, nessun orologio.
 */

// `import type` e non un import a runtime: `types/index.ts` riesporta questo
// modulo, quindi un import di valori creerebbe un ciclo fra i due file.
import type { Position, Sale } from '../types/index.js';
import type { PuntoSerie } from './serieTitolo.js';
// Import a runtime **consentito**: `serieTitolo.ts` non importa a sua volta
// questo modulo, quindi non c'è ciclo. Ed è deliberato che la regola di lettura
// della data civile arrivi da lì e non venga riscritta qui.
import { istanteDataCivile } from './serieTitolo.js';

// ─── Le due viste ────────────────────────────────────────────────────────────

/**
 * Che cosa la curva misura: il prezzo di una quota oppure il controvalore delle
 * quote detenute.
 *
 * L'identificativo è stabile e finisce negli attributi che i test interrogano
 * (`data-vista`, `data-testid="vista-<id>"`): va scelto una volta e non più
 * cambiato.
 */
export type VistaGrafico = 'prezzo' | 'valore';

/** Una vista: identificativo, etichetta del bottone e didascalia dell'ordinata. */
export interface DefinizioneVista {
  /** L'identificativo stabile della vista. */
  id: VistaGrafico;
  /** L'etichetta del bottone, in italiano. */
  etichetta: string;
  /**
   * La didascalia dell'asse delle ordinate, in maiuscoletto, **senza** il
   * simbolo di valuta: quello lo antepone chi disegna, perché è un dato del
   * titolo e non della vista.
   */
  didascalia: string;
  /** Che cosa porta l'ordinata, in una frase leggibile sulla traversa. */
  ordinata: string;
}

/**
 * Le due viste, nell'ordine di lettura: prima la grandezza predefinita.
 *
 * Vivono nel dominio e non nel componente per la stessa ragione di
 * `SCALE_TEMPORALI`: quale sia la vista predefinita è un **fatto** del criterio 2,
 * non una preferenza della resa, e il test lo legge da qui invece di riscriverlo.
 */
export const VISTE_GRAFICO: readonly DefinizioneVista[] = [
  {
    id: 'prezzo',
    etichetta: 'Prezzo unitario',
    didascalia: 'PER QUOTA',
    ordinata: 'prezzo di una singola quota',
  },
  {
    id: 'valore',
    etichetta: 'Valore della posizione',
    didascalia: 'CONTROVALORE DELLA POSIZIONE',
    ordinata: 'controvalore delle quote detenute a ciascuna data',
  },
];

/**
 * La vista all'apertura della scheda (criterio 2): il prezzo unitario.
 *
 * È la grandezza che esiste **sempre** — anche senza un solo carico — mentre il
 * valore della posizione esiste solo dove una posizione c'è.
 */
export const VISTA_PREDEFINITA: VistaGrafico = 'prezzo';

/** La definizione di una vista; ripiega sulla predefinita per un id ignoto. */
export function definizioneVista(vista: VistaGrafico): DefinizioneVista {
  return (
    VISTE_GRAFICO.find((definizione) => definizione.id === vista) ??
    // Ripiego deliberato sulla vista **del prezzo**: un identificativo ignoto non
    // deve poter mostrare controvalori senza che nulla lo dichiari.
    VISTE_GRAFICO[0]
  );
}

// ─── La quantità detenuta a una data ─────────────────────────────────────────

/** Il carico, ridotto ai tre soli campi che la serie del valore legge. */
export type CaricoValore = Pick<Position, 'loadDate' | 'loadPrice' | 'quantity'>;

/**
 * La vendita, ridotta ai due soli campi che la serie del valore legge: gemella
 * di `CaricoValore`, non l'attribuzione LIFO di `lottiLifo.ts` — qui la quantità
 * venduta va solo **sottratta** dalla quantità detenuta, senza sapere a quale
 * lotto di carico appartenga.
 */
export type VenditaValore = Pick<Sale, 'saleDate' | 'quantity'>;

/**
 * La quantità detenuta a un dato istante: la somma delle quantità dei carichi,
 * meno la somma delle quantità delle vendite, la cui data è **minore o uguale**
 * all'istante chiesto.
 *
 * L'estremo è **incluso**: il giorno stesso del carico (o della vendita) le quote
 * sono già tue (o non più tue), ed è il giorno in cui la curva del valore compie
 * il gradino. La data civile viene ancorata con `istanteDataCivile`, la stessa
 * funzione che `componiSerieTitolo` adopera per collocare il punto del carico
 * sull'asse: due letture diverse della stessa data farebbero cadere un carico o
 * una vendita dal lato sbagliato del proprio giorno, e il gradino comparirebbe
 * accanto — non sopra — al rombo che lo causa.
 *
 * I carichi e le vendite con data malformata o quantità non finita vengono
 * **ignorati**, non corretti: propagarli darebbe un `NaN` che si diffonderebbe a
 * tutta la serie e produrrebbe un tracciato invisibile, cioè un guasto
 * indistinguibile da un dato assente.
 *
 * Prima del primo carico la funzione restituisce `0`, e chi compone la serie deve
 * leggerlo come «la posizione non esisteva» e **non** come «la posizione valeva
 * zero»: `componiSerieValore` esclude quei punti invece di appiattirli sullo zero.
 * Dopo una vendita totale, invece, la funzione restituisce `0` per la posizione
 * che **esiste** e non vale più nulla: quel caso non va confuso col precedente, e
 * `componiSerieValore` lo distingue guardando se l'istante è caduto prima o dopo
 * la prima detenzione.
 */
export function quantitaDetenutaA(
  loads: readonly CaricoValore[],
  sales: readonly VenditaValore[],
  at: number,
): number {
  if (!Number.isFinite(at)) return 0;

  let quantita = 0;
  for (const carico of loads) {
    const istante = istanteDataCivile(carico.loadDate);
    if (!Number.isFinite(istante) || !Number.isFinite(carico.quantity)) continue;
    if (istante <= at) quantita += carico.quantity;
  }
  for (const vendita of sales) {
    const istante = istanteDataCivile(vendita.saleDate);
    if (!Number.isFinite(istante) || !Number.isFinite(vendita.quantity)) continue;
    if (istante <= at) quantita -= vendita.quantity;
  }
  return quantita;
}

/**
 * L'istante della **prima detenzione**: la data del primo carico valido.
 *
 * `null` quando di carichi validi non ce n'è, ed è il caso in cui la serie del
 * valore non esiste per nessuna finestra.
 */
export function primaDetenzione(loads: readonly CaricoValore[]): number | null {
  let primo: number | null = null;
  for (const carico of loads) {
    const istante = istanteDataCivile(carico.loadDate);
    if (!Number.isFinite(istante) || !Number.isFinite(carico.quantity)) continue;
    if (primo === null || istante < primo) primo = istante;
  }
  return primo;
}

// ─── Il gradino e i punti del valore ─────────────────────────────────────────

/**
 * Il gradino verticale prodotto da un nuovo carico: due punti sullo **stesso**
 * istante, il valore con la quantità precedente e quello con la quantità nuova.
 *
 * La loro differenza è, alla cifra, il denaro versato — non è un'approssimazione
 * né una convenzione grafica: è un'identità, ed è ciò che rende il criterio 4
 * dimostrabile con un conto invece che con un'ispezione a occhio.
 */
export interface GradinoCarico {
  /** Istante del carico (unix ms), comune ai due capi. */
  at: number;
  /** Prezzo di carico del giorno: il prezzo unitario di entrambi i capi. */
  prezzoCarico: number;
  /** Quantità detenuta **prima** del carico. */
  quantitaPrima: number;
  /** Quantità detenuta **dopo** il carico. */
  quantitaDopo: number;
  /** Quote aggiunte dal carico: `quantitaDopo − quantitaPrima`. */
  quoteAggiunte: number;
  /** Controvalore del capo basso: `prezzoCarico × quantitaPrima`. */
  valorePrima: number;
  /** Controvalore del capo alto: `prezzoCarico × quantitaDopo`. */
  valoreDopo: number;
  /**
   * L'altezza del gradino, cioè il **capitale versato**: `valoreDopo −
   * valorePrima`, che per costruzione vale `prezzoCarico × quoteAggiunte`.
   *
   * Si calcola come differenza dei due capi, e non come prodotto, perché è la
   * cifra che il disegno *misura*: dichiarare accanto alla quota un numero
   * ottenuto per un'altra strada lo esporrebbe a divergere dall'ultimo bit in
   * virgola mobile proprio nel punto in cui il grafico promette un'identità.
   *
   * Un solo caso la separa dal denaro effettivamente speso: più carichi nello
   * stesso giorno a **prezzi diversi**. Lì i capi si misurano al prezzo del primo
   * punto della giornata, e i carichi successivi restano visibili come punti a
   * sé — la serie non nasconde nulla, ma la cifra del gradino è l'altezza del
   * salto, non la somma degli scontrini.
   */
  capitaleVersato: number;
}

/** Quale capo del gradino è un punto: quello ante-carico o quello post-carico. */
export type CapoGradino = 'ante' | 'post';

/**
 * Un punto della serie del valore.
 *
 * Estende `PuntoSerie` e ne **conserva il nome `price`** per il campo
 * dell'ordinata, che qui porta il controvalore della posizione: è il campo che la
 * proiezione legge e su cui `ritagliaSerie` e `calcolaScalaSerie` lavorano, e un
 * secondo nome sdoppierebbe quelle funzioni in due varianti gemelle. Il
 * significato è dichiarato sul tipo e non resta mai ambiguo a schermo — la
 * didascalia dell'asse, i `<title>` dei punti e gli attributi `data-*` dicono
 * tutti che quella cifra è un controvalore.
 */
export interface PuntoValore extends PuntoSerie {
  /** Le quote detenute a questo istante: il fattore che moltiplica il prezzo. */
  quantita: number;
  /** Il prezzo unitario da cui il controvalore discende: `price / quantita`. */
  prezzoUnitario: number;
  /** Il gradino di cui il punto è un capo; `null` per i punti ordinari. */
  gradino: GradinoCarico | null;
  /** Quale capo del gradino, quando `gradino` non è nullo. */
  capo: CapoGradino | null;
}

/** Perché la serie del valore è vuota, quando lo è. */
export type RagioneSerieValoreVuota =
  /** Nessun carico registrato: non c'è quantità da moltiplicare. */
  | 'senza-carichi'
  /** Ci sono carichi, ma la serie del prezzo non offre punti dalla prima detenzione in poi. */
  | 'senza-punti';

/** Ingresso di `componiSerieValore`. */
export interface ComponiSerieValoreInput {
  /**
   * La serie del prezzo **intera**, come `componiSerieTitolo` la produce: già
   * ordinata e non ritagliata.
   *
   * **Contratto:** il ritaglio si applica *dopo*, mai prima. Calcolare le
   * quantità sui soli carichi caduti in finestra rifarebbe il difetto della
   * retroattività in forma ritagliata — una finestra che comincia dopo il primo
   * carico ne dimenticherebbe le quote, e la curva partirebbe più in basso di
   * quanto la posizione valesse davvero.
   */
  punti: readonly PuntoSerie[];
  /** I carichi che compongono la posizione: si passa `detail.loads`. */
  loads: readonly CaricoValore[];
  /**
   * Le vendite che hanno scaricato la posizione: si passa `detail.sales`. Come
   * per `loads`, la serie **intera**: il ritaglio si applica dopo, non prima.
   */
  sales: readonly VenditaValore[];
}

/** Esito della composizione: i punti **e** i fatti che la resa deve dichiarare. */
export interface SerieValore {
  /** I punti del valore, nell'ordine della serie del prezzo da cui discendono. */
  punti: PuntoValore[];
  /** I gradini contenuti nella serie, dal più antico al più recente. */
  gradini: GradinoCarico[];
  /**
   * Quanti punti della serie del prezzo sono stati **esclusi** perché anteriori
   * alla prima detenzione. Vanno dichiarati sotto il tracciato: una posizione che
   * non esiste non è una posizione che vale zero.
   */
  puntiEsclusi: number;
  /** L'istante del primo carico valido; `null` senza alcun carico. */
  primaDetenzione: number | null;
  /** La quantità detenuta alla fine della serie. */
  quantitaFinale: number;
  /** Perché la serie è vuota; `null` quando non lo è. */
  ragioneVuota: RagioneSerieValoreVuota | null;
}

/**
 * Rimisura la serie del prezzo come controvalore della posizione.
 *
 * Tre conseguenze sono deliberate e non vanno «sistemate»:
 *
 * - **il primo carico non è un gradino, è l'origine.** Prima di esso la posizione
 *   non esisteva, e un punto a valore 0 il giorno prima schiaccerebbe per sempre
 *   il dominio Y sullo zero, comprimendo ogni movimento successivo per mostrare
 *   un salto che è solo l'inizio della storia;
 * - **i punti anteriori alla prima detenzione sono esclusi, non azzerati.**
 *   `priceHistory` è per **ISIN** e non per posizione: una rilevazione può
 *   precedere il primo carico — registrata mentre il titolo stava in un altro
 *   portafoglio, o creata dal backfill di US-009 dalla riga di cache. A quella
 *   data la quantità detenuta è 0, ma «la posizione valeva zero» è
 *   un'affermazione, non un'assenza. Il loro numero viene contato e dichiarato;
 * - **la serie non si riordina.** Si costruisce con una sola passata sulla serie
 *   del prezzo, già ordinata; riordinare con il comparatore di
 *   `componiSerieTitolo` scioglierebbe il pari merito fra i due capi di un
 *   gradino secondo il prezzo, che oggi dà l'ordine giusto solo per coincidenza
 *   (un carico aggiunge sempre quantità, quindi il valore sale).
 */
export function componiSerieValore({ punti, loads, sales }: ComponiSerieValoreInput): SerieValore {
  const inizio = primaDetenzione(loads);
  const puntiValore: PuntoValore[] = [];
  const gradini: GradinoCarico[] = [];
  let puntiEsclusi = 0;

  // La quantità applicata al punto **precedente**: è il capo basso di un
  // eventuale gradino. Comincia a zero perché prima del primo carico non si
  // possiede nulla, ed è proprio quello zero a dire che il primo carico apre la
  // serie invece di farla saltare.
  let quantitaPrecedente = 0;

  for (const punto of punti) {
    // Un punto malformato non entra e non viene contato fra gli esclusi: non è
    // «fuori dalla posizione», è inutilizzabile — e `ritagliaSerie` lo
    // scarterebbe comunque.
    if (!Number.isFinite(punto.at) || !Number.isFinite(punto.price)) continue;

    // Prima della prima detenzione la quantità non è zero: **non esiste**. Il
    // punto viene escluso e contato, mai portato a valore zero.
    if (inizio === null || punto.at < inizio) {
      puntiEsclusi += 1;
      continue;
    }

    // Dopo la prima detenzione la quantità **è** zero quando una vendita totale
    // l'ha svuotata, e uno zero legittimo non va confuso con un dato malformato:
    // solo il secondo va escluso. Il punto a quantità zero entra in `puntiValore`
    // con `price: 0` più sotto, invece di sparire dal tracciato o farlo saltare.
    const quantita = quantitaDetenutaA(loads, sales, punto.at);
    if (!Number.isFinite(quantita)) {
      puntiEsclusi += 1;
      continue;
    }

    // Un gradino nasce quando la quantità **cresce** su un punto di carico e una
    // posizione c'era già: il primo carico (quantità precedente nulla) è
    // l'origine della serie, non un salto.
    if (punto.origin === 'carico' && quantitaPrecedente > 0 && quantita > quantitaPrecedente) {
      const valorePrima = punto.price * quantitaPrecedente;
      const valoreDopo = punto.price * quantita;
      const gradino: GradinoCarico = {
        at: punto.at,
        prezzoCarico: punto.price,
        quantitaPrima: quantitaPrecedente,
        quantitaDopo: quantita,
        quoteAggiunte: quantita - quantitaPrecedente,
        valorePrima,
        valoreDopo,
        capitaleVersato: valoreDopo - valorePrima,
      };
      gradini.push(gradino);

      // I due capi, allo **stesso istante** e nell'ordine di lettura: prima il
      // valore della posizione precedente al prezzo del giorno, poi quello della
      // posizione accresciuta. Fra i due non passa un solo giorno, quindi il
      // tratto che li unisce è pieno e non tratteggiato: non c'è nulla che
      // l'archivio ignori.
      puntiValore.push({
        at: punto.at,
        price: valorePrima,
        origin: punto.origin,
        quantita: quantitaPrecedente,
        prezzoUnitario: punto.price,
        gradino,
        capo: 'ante',
      });
      puntiValore.push({
        at: punto.at,
        price: valoreDopo,
        origin: punto.origin,
        quantita,
        prezzoUnitario: punto.price,
        gradino,
        capo: 'post',
      });
    } else {
      puntiValore.push({
        at: punto.at,
        price: punto.price * quantita,
        origin: punto.origin,
        quantita,
        prezzoUnitario: punto.price,
        gradino: null,
        capo: null,
      });
    }

    quantitaPrecedente = quantita;
  }

  let ragioneVuota: RagioneSerieValoreVuota | null = null;
  if (puntiValore.length === 0) ragioneVuota = inizio === null ? 'senza-carichi' : 'senza-punti';

  return {
    punti: puntiValore,
    gradini,
    puntiEsclusi,
    primaDetenzione: inizio,
    quantitaFinale: quantitaPrecedente,
    ragioneVuota,
  };
}
