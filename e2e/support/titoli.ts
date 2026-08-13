/**
 * Anagrafiche note da seminare in cache quando un test *attraversa* la ricerca
 * titoli senza volerla mettere alla prova.
 *
 * Perché servono. `GET /api/securities/:isin` contatta la fonte reale — Borsa
 * Italiana e, come ripiego, un browser headless su MorningStar — ogni volta che
 * la riga in cache appartiene a una sessione di borsa precedente. Sono 8-12
 * secondi, oltre il budget di 30s del test, e l'esito dipende dall'ora in cui la
 * suite gira: la prima esecuzione della giornata paga il recupero, le successive
 * no. Esattamente il tipo di dipendenza dallo stato che US-029 elimina.
 *
 * **Un ISIN per file spec, mai condiviso — e da US-040 è un controllo, non
 * un'esortazione.** Playwright esegue i file in parallelo su worker distinti
 * (`fullyParallel: false` serializza solo dentro un file), e seminare-e-ripristinare
 * è per sua natura uno stack di undo: se due file si sovrappongono sulla stessa
 * chiave, l'ultimo a ripristinare torna allo stato intermedio lasciato dall'altro,
 * non a quello iniziale. Nessun ripristino condizionato può rimediare, perché
 * l'informazione su quale fosse lo stato originale è già andata persa. Assegnare a
 * ogni file il proprio ISIN elimina il problema per costruzione — la stessa logica
 * dei nomi univoci in `nomi.ts`.
 *
 * ## Come si dichiara una chiave
 *
 * Ogni costante di questo file porta il campo `file`: il nome del `*.spec.ts` che
 * la possiede, e l'unico autorizzato a seminarla o rimuoverla. Non è prosa
 * promossa a stringa — è il dato che `verifica-chiavi.ts` legge. Aggiungere una
 * costante la registra: il controllo deriva il registro dagli export del modulo,
 * quindi non esiste una seconda lista da tenere allineata e dimenticarsi di
 * registrarla è impossibile.
 *
 * Vale anche per le chiavi che un file **rimuove** invece di seminare
 * (`ISIN_SENZA_ANAGRAFICA_US_018` e simili): rimuovere e ripristinare è la stessa
 * pila di undo, e una scorciatoia che le sottraesse al controllo lascerebbe lo
 * stesso residuo. Più chiavi riservate allo stesso file non violano nulla: ciò che
 * la regola vieta è condividerle *fra* file.
 *
 * ## Quando è lecito `lettoDa`
 *
 * La regola vincola chi *scrive*, non chi legge — ma la lettura va dichiarata, con
 * `lettoDa`, altrimenti è indistinguibile da una svista. È il caso di
 * `US-027__dialog-elenco-portafogli.spec.ts`, che legge i campi di `TITOLO_US_027`
 * per servirli con `route.fulfill()` senza mai toccare l'archivio, e delle due
 * chiavi di solo stub (`ISIN_STUB_US_007`, `ISIN_STUB_US_008`).
 *
 * `lettoDa` è per chi non tocca l'archivio. Un file che iscrive posizioni su un
 * ISIN **non** rientra: la vista di riepilogo ne rileva il prezzo con una LEFT
 * JOIN, quindi la premessa esiste e va costruita — chiave propria, seminata dal
 * file. È esattamente il difetto che US-040 ha bonificato: US-011, US-012, US-013,
 * US-017, US-026 e US-031 ereditavano `IE00B4L5Y983` da US-025 e funzionavano solo
 * perché quella riga era già in archivio di sviluppo.
 *
 * ## Quando il controllo fallisce
 *
 * `npm run check:chiavi` (in `npm run check`, e di nuovo nel `globalSetup` di
 * Playwright) stampa la regola infranta e cosa fare:
 *
 * - **R1**, due proprietari sulla stessa chiave: assegnane una nuova a uno dei due.
 * - **R2**, un file nomina una chiave altrui: dagli la sua e falla seminare dal
 *   file, oppure — se non tocca mai l'archivio — aggiungilo ai `lettoDa`.
 * - **R3**, la stessa chiave inventata in due file: dichiarala qui con un
 *   proprietario.
 * - **R4**, riserva morta: il proprietario non esiste o non la nomina mai; togli la
 *   voce o correggi il proprietario.
 * - **R5**, letterale passato a un helper che scrive: dichiara la chiave qui e
 *   passa la costante.
 *
 * Gli altri scenari che passano dalla pagina di ricerca — US-007, US-008,
 * `demo__recupera-anagrafica-isin`, `fallback-morningstar` — non hanno bisogno di
 * un'anagrafica seminata perché intercettano `**\/api\/securities\/**` con
 * `route.fulfill()` e non arrivano mai al server; le loro chiavi sono comunque
 * dichiarate qui in fondo, così anche quella condivisione è sotto controllo. Da qui
 * una conseguenza da conoscere: nessun test della suite esercita più il recupero
 * dalla fonte reale. La copertura di quel percorso vive nei test unitari degli
 * adapter (`server/tests/`) e nello smoke test manuale
 * `server/scripts/morningstar-smoke.ts`.
 */
import type { CampiTitolo } from './archivio.js';

/**
 * Una chiave della cache prezzi con il file che la possiede.
 *
 * `file` non è un commento promosso a stringa: è il dato su cui poggia
 * `verifica-chiavi.ts`, che rifiuta due proprietari sulla stessa chiave e un file
 * che ne riferisce una altrui. Prima di US-040 l'appartenenza era affermata in
 * prosa («Riservato a …») e nessuno la verificava — e infatti due chiavi erano
 * condivise da anni.
 *
 * `lettoDa` elenca i file che possono *nominare* la chiave senza mai toccare
 * l'archivio: servirne i campi con `route.fulfill()`, digitarla in un campo di
 * ricerca intercettata. È il permesso esplicito per il caso legittimo, e resta
 * una riga che si rivede in code review — al contrario della lettura tacita, che
 * era indistinguibile da una svista.
 */
export interface ChiaveRiservata {
  /** L'ISIN, cioè la chiave della riga in `securities`. */
  isin: string;
  /** Il file di spec che semina o rimuove questa chiave, e l'unico che può farlo. */
  file: string;
  /** I file che nominano la chiave senza scrivere in archivio. */
  lettoDa?: string[];
}

/** Titolo con la sua anagrafica: quanto basta per seminarlo e poi cercarlo. */
export interface TitoloSeminabile extends ChiaveRiservata {
  campi: CampiTitolo;
}

/** Riservato a `US-025__aggiungi-titolo-a-portafoglio.spec.ts`. */
export const TITOLO_US_025: TitoloSeminabile = {
  isin: 'IE00B4L5Y983',
  file: 'US-025__aggiungi-titolo-a-portafoglio.spec.ts',
  campi: {
    name: 'Ishares Core Msci World Ucits Etf Acc',
    price: 128.46,
    ticker: 'SWDA',
    instrument_type: 'ETF',
    total_annual_fees: '0,20%',
    currency: 'USD',
    issuer: 'ISHARES III PLC',
    segment: 'ETF Indicizzati',
  },
};

/**
 * Riservato a `US-027__scorre-elenco-portafogli.spec.ts` (il solo file demo).
 *
 * Il file fratello `US-027__dialog-elenco-portafogli.spec.ts` importa la costante ma
 * non la semina: ne legge i campi per servirli con `route.fulfill()`, senza mai
 * toccare la cache. La regola vincola chi scrive, quindi la spec resta con un unico
 * ISIN seminabile.
 */
export const TITOLO_US_027: TitoloSeminabile = {
  isin: 'IE00B5BMR087',
  file: 'US-027__scorre-elenco-portafogli.spec.ts',
  lettoDa: ['US-027__dialog-elenco-portafogli.spec.ts'],
  campi: {
    name: 'Ishares Core S&P 500 Ucits Etf Usd Acc',
    price: 552.18,
    ticker: 'CSPX',
    instrument_type: 'ETF',
    total_annual_fees: '0,07%',
    currency: 'USD',
    issuer: 'ISHARES VII PLC',
    segment: 'ETF Indicizzati',
  },
};

/**
 * Riservato a `US-018__dettaglio-titolo.spec.ts` (il file demo).
 *
 * È l'unico titolo della suite seminato con `data_source` esplicito: la scheda
 * di dettaglio dichiara la provenienza (FR-021), e senza fissarla il timbro
 * dipenderebbe da quale fonte ha popolato la cache l'ultima volta.
 */
export const TITOLO_US_018: TitoloSeminabile = {
  isin: 'LU1781541179',
  file: 'US-018__dettaglio-titolo.spec.ts',
  campi: {
    name: 'Amundi S&P 500 Ii Ucits Etf Acc',
    price: 112.74,
    ticker: 'SP5H',
    instrument_type: 'ETF ARMONIZZATI',
    total_annual_fees: '0,05%',
    currency: 'EUR',
    issuer: 'AMUNDI INDEX SOLUTIONS',
    segment: 'ETF Indicizzati',
    dividend_policy: 'ad accumulazione',
    data_source: 'borsaitaliana',
  },
};

/**
 * Riservato a `US-018__dettaglio-titolo-dati-mancanti.spec.ts`.
 *
 * Quel file non lo semina: lo *rimuove* dalla cache per garantire l'assenza di
 * anagrafica che lo scenario deve dimostrare. Vale comunque la riserva di un
 * ISIN per file — rimuovere e ripristinare è lo stesso stack di undo del
 * seeding, e condividerlo lascerebbe lo stesso residuo.
 */
export const ISIN_SENZA_ANAGRAFICA_US_018: ChiaveRiservata = {
  isin: 'LU0908500753',
  file: 'US-018__dettaglio-titolo-dati-mancanti.spec.ts',
};

/**
 * Riservato a `US-030__aggiorna-dati-titolo.spec.ts` (il file demo).
 *
 * `data_source` e `price` sono espliciti perché lo scenario deve *vedere* la
 * fonte cambiare: parte da Borsa Italiana e da un prezzo vecchio, e dopo
 * l'aggiornamento entrambi devono risultare diversi. Il `fetched_at` non sta
 * qui: lo scenario lo fissa a una sessione di borsa passata, perché è quella
 * distanza a rendere l'aggiornamento lecito senza guardia.
 */
export const TITOLO_US_030: TitoloSeminabile = {
  isin: 'IE00BK5BQT80',
  file: 'US-030__aggiorna-dati-titolo.spec.ts',
  campi: {
    name: 'Vanguard Ftse All-World Ucits Etf Usd Acc',
    price: 118.42,
    ticker: 'VWCE',
    instrument_type: 'ETF ARMONIZZATI',
    total_annual_fees: '0,22%',
    currency: 'EUR',
    issuer: 'VANGUARD FUNDS PLC',
    segment: 'ETF Indicizzati',
    dividend_policy: 'ad accumulazione',
    data_source: 'borsaitaliana',
  },
};

/**
 * Riservato a `US-030__aggiorna-dati-titolo-varianti.spec.ts`.
 *
 * Il file lo semina *e* lo rimuove, a seconda dello scenario: l'esito negativo
 * parte da una riga nota, la fonte non registrata da un cache miss. Entrambe le
 * direzioni sono lo stesso stack di undo, quindi vale la riserva per file — con
 * in più il vincolo che gli scenari girino in serie dentro il file, come già fa
 * Playwright (`fullyParallel: false`).
 */
export const TITOLO_US_030_VARIANTI: TitoloSeminabile = {
  isin: 'LU1681045370',
  file: 'US-030__aggiorna-dati-titolo-varianti.spec.ts',
  campi: {
    name: 'Amundi Msci Emerging Markets Ucits Etf Acc',
    price: 27.86,
    ticker: 'AEEM',
    instrument_type: 'ETF ARMONIZZATI',
    total_annual_fees: '0,20%',
    currency: 'EUR',
    issuer: 'AMUNDI INDEX SOLUTIONS',
    segment: 'ETF Indicizzati',
    dividend_policy: 'ad accumulazione',
    data_source: 'borsaitaliana',
  },
};

/**
 * Riservato a `US-032__prezzo-e-rilevamento.spec.ts` (il file demo).
 *
 * Il prezzo è esplicito perché lo scenario legge la colonna «Prezzo attuale»
 * della tabella di riepilogo e ne confronta il valore formattato. Il
 * `fetched_at` non sta qui: lo scenario lo fissa a un istante noto per poter
 * ricostruire la stringa attesa della colonna «Ultimo rilevamento» invece di
 * scriverla a mano.
 */
export const TITOLO_US_032: TitoloSeminabile = {
  isin: 'IE00BFY0GT14',
  file: 'US-032__prezzo-e-rilevamento.spec.ts',
  campi: {
    name: 'Spdr Msci World Ucits Etf',
    price: 137.92,
    ticker: 'SWRD',
    instrument_type: 'ETF ARMONIZZATI',
    total_annual_fees: '0,12%',
    currency: 'EUR',
    issuer: 'SSGA SPDR ETFS EUROPE I PLC',
    segment: 'ETF Indicizzati',
    dividend_policy: 'ad accumulazione',
  },
};

/**
 * Riservato a `US-032__prezzo-e-rilevamento-varianti.spec.ts`.
 *
 * Il file lo semina *e* lo rimuove, a seconda dello scenario: le due nuove
 * colonne a «–» partono da un cache miss (o da una riga senza prezzo), mentre
 * l'allineamento della riga di totale e l'attivazione da tastiera hanno bisogno
 * di una posizione valorizzata. Entrambe le direzioni sono la stessa pila di
 * undo, quindi vale comunque la riserva per file — con in più il vincolo che gli
 * scenari girino in serie dentro il file, come già fa Playwright
 * (`fullyParallel: false`).
 *
 * L'anagrafica seminata sta nello scenario e non qui: cambia da uno scenario
 * all'altro (con prezzo, con prezzo nullo) ed è la variabile che ciascuno mette
 * alla prova, quindi tenerla sotto gli occhi del test vale più della simmetria
 * con le altre costanti.
 */
export const ISIN_SENZA_PREZZO_US_032: ChiaveRiservata = {
  isin: 'LU1650487413',
  file: 'US-032__prezzo-e-rilevamento-varianti.spec.ts',
};

/**
 * Riservati a `US-034__rilevamento-obsoleto.spec.ts` (il file demo).
 *
 * Due titoli, perché lo scenario deve mostrare la *differenza*: uno seminato con
 * `fetched_at` fissato a una sessione di borsa passata, l'altro senza istante
 * esplicito — cioè adesso, per il default di `seminaTitolo`.
 *
 * Perché i due verdetti sono stabili a qualunque ora giri la suite: un
 * rilevamento «adesso» non può risultare obsoleto, perché
 * `classifyRefetch(now, now)` è `intra-session` a mercato aperto e `no-session`
 * altrimenti — mai `none`, l'unico esito che il server mappa su «obsoleto».
 * Simmetricamente, un istante fissato nel passato resta obsoleto per sempre,
 * perché il passato non si avvicina. Nessuno dei due scenari dipende dall'orario
 * di esecuzione.
 *
 * Seminare un `fetched_at` vecchio è sicuro qui: la vista di riepilogo legge la
 * cache con una LEFT JOIN e non attraversa mai `GET /api/securities/:isin`,
 * quindi la cautela sul timestamp stantio scritta in testa a questo file non si
 * applica (vale la stessa nota già registrata per US-032).
 */
export const TITOLO_US_034_OBSOLETO: TitoloSeminabile = {
  isin: 'IE00B3RBWM25',
  file: 'US-034__rilevamento-obsoleto.spec.ts',
  campi: {
    name: 'Vanguard Ftse All-World Ucits Etf Dist',
    price: 128.4,
    ticker: 'VWRL',
    instrument_type: 'ETF ARMONIZZATI',
    total_annual_fees: '0,22%',
    currency: 'EUR',
    issuer: 'VANGUARD FUNDS PLC',
    segment: 'ETF Indicizzati',
    dividend_policy: 'a distribuzione',
  },
};

/** Riservato a `US-034__rilevamento-obsoleto.spec.ts`: il titolo rilevato adesso. */
export const TITOLO_US_034_FRESCO: TitoloSeminabile = {
  isin: 'IE00BFNM3P36',
  file: 'US-034__rilevamento-obsoleto.spec.ts',
  campi: {
    name: 'Amundi Msci World Ucits Etf Acc',
    price: 96.75,
    ticker: 'MWRD',
    instrument_type: 'ETF ARMONIZZATI',
    total_annual_fees: '0,12%',
    currency: 'EUR',
    issuer: 'AMUNDI INDEX SOLUTIONS',
    segment: 'ETF Indicizzati',
    dividend_policy: 'ad accumulazione',
  },
};

/**
 * Riservato a `US-034__rilevamento-obsoleto-varianti.spec.ts`: il titolo
 * seminato adesso, che nello scenario «tutti allineati» non deve portare alcuna
 * marcatura.
 */
export const TITOLO_US_034_VARIANTI: TitoloSeminabile = {
  isin: 'IE00BK5BQV03',
  file: 'US-034__rilevamento-obsoleto-varianti.spec.ts',
  campi: {
    name: 'Vanguard S&P 500 Ucits Etf Usd Acc',
    price: 108.32,
    ticker: 'VUAA',
    instrument_type: 'ETF ARMONIZZATI',
    total_annual_fees: '0,07%',
    currency: 'EUR',
    issuer: 'VANGUARD FUNDS PLC',
    segment: 'ETF Indicizzati',
    dividend_policy: 'ad accumulazione',
  },
};

/**
 * Riservato a `US-034__rilevamento-obsoleto-varianti.spec.ts`: l'ISIN che quel
 * file *rimuove* dalla cache, per garantire il «mai rilevato» che lo scenario
 * deve dimostrare. Rimuovere e ripristinare è la stessa pila di undo del
 * seeding, quindi vale comunque la riserva per file.
 */
export const ISIN_MAI_RILEVATO_US_034: ChiaveRiservata = {
  isin: 'LU1437016972',
  file: 'US-034__rilevamento-obsoleto-varianti.spec.ts',
};

/** Riservato a `US-026__schede-portafoglio.spec.ts`. */
export const TITOLO_US_026: TitoloSeminabile = {
  isin: 'IE00BMVB5R75',
  file: 'US-026__schede-portafoglio.spec.ts',
  campi: {
    name: 'Vanguard Lifestrategy 80% Equity Ucits Etf',
    price: 43.3,
    ticker: 'V80A',
    instrument_type: 'ETF ATTIVI',
    total_annual_fees: '0,25%',
    issuer: 'VANGUARD FUNDS PLC',
  },
};

/**
 * Riservati a `US-035__aggiorna-obsoleti.spec.ts` (il file demo).
 *
 * Quattro titoli, e ciascuno serve a dimostrare una cosa diversa: **tre**
 * seminati con `fetched_at` all'indietro da adesso — la lista di lavoro della
 * corsa — e **uno** seminato senza istante esplicito, cioè adesso, che il lavoro
 * non deve mai chiedere alla fonte.
 *
 * Perché i verdetti sono stabili a qualunque ora giri la suite (stesso
 * argomento di US-034, ripetuto qui perché è la premessa dello scenario): un
 * rilevamento «adesso» non può risultare obsoleto, perché
 * `classifyRefetch(now, now)` è `intra-session` a mercato aperto e `no-session`
 * altrimenti — mai `none`, l'unico esito che il server mappa su «obsoleto».
 * Simmetricamente un istante fissato quattordici giorni indietro resta obsoleto
 * per sempre, perché il passato non si avvicina.
 *
 * I prezzi seminati qui sono quelli **di partenza**: lo scenario semina i valori
 * aggiornati nel gestore di rotta, un istante prima di servire la risposta stub,
 * com'è già il pattern di `US-030__aggiorna-dati-titolo-varianti.spec.ts`. È
 * l'unico modo per far cambiare la tabella senza contattare la rete reale, e
 * l'unico che riproduce ciò che il server avrebbe scritto.
 */
export const TITOLI_US_035_OBSOLETI: TitoloSeminabile[] = [
  {
    isin: 'IE00B4L5YC18',
    file: 'US-035__aggiorna-obsoleti.spec.ts',
    campi: {
      name: 'Ishares Core Msci Emerging Markets Imi Ucits Etf',
      price: 31.2,
      ticker: 'EIMI',
      instrument_type: 'ETF ARMONIZZATI',
      total_annual_fees: '0,18%',
      currency: 'EUR',
      issuer: 'ISHARES VI PLC',
      segment: 'ETF Indicizzati',
      dividend_policy: 'ad accumulazione',
    },
  },
  {
    isin: 'LU0290358497',
    file: 'US-035__aggiorna-obsoleti.spec.ts',
    campi: {
      name: 'Xtrackers Ii Eur Overnight Rate Swap Ucits Etf',
      price: 142.5,
      ticker: 'XEON',
      instrument_type: 'ETF ARMONIZZATI',
      total_annual_fees: '0,10%',
      currency: 'EUR',
      issuer: 'XTRACKERS II',
      segment: 'ETF Indicizzati',
      dividend_policy: 'ad accumulazione',
    },
  },
  {
    isin: 'IE00B3XXRP09',
    file: 'US-035__aggiorna-obsoleti.spec.ts',
    campi: {
      name: 'Vanguard S&P 500 Ucits Etf Usd Dist',
      price: 88.4,
      ticker: 'VUSA',
      instrument_type: 'ETF ARMONIZZATI',
      total_annual_fees: '0,07%',
      currency: 'EUR',
      issuer: 'VANGUARD FUNDS PLC',
      segment: 'ETF Indicizzati',
      dividend_policy: 'a distribuzione',
    },
  },
];

/**
 * Riservato a `US-035__aggiorna-obsoleti.spec.ts`: il titolo rilevato adesso.
 *
 * Non entra nella lista di lavoro, e il gestore di rotta della demo fa fallire
 * il test se qualcuno lo chiede comunque alla fonte — è il criterio «nessuna
 * richiesta parte per un titolo rilevato nella sessione corrente» reso
 * eseguibile invece che dichiarato.
 */
export const TITOLO_US_035_FRESCO: TitoloSeminabile = {
  isin: 'IE00BJ0KDQ92',
  file: 'US-035__aggiorna-obsoleti.spec.ts',
  campi: {
    name: 'Xtrackers Msci World Ucits Etf 1c',
    price: 96.1,
    ticker: 'XDWD',
    instrument_type: 'ETF ARMONIZZATI',
    total_annual_fees: '0,19%',
    currency: 'EUR',
    issuer: 'XTRACKERS IE PLC',
    segment: 'ETF Indicizzati',
    dividend_policy: 'ad accumulazione',
  },
};

/**
 * Riservati a `US-035__aggiorna-obsoleti-varianti.spec.ts`.
 *
 * Tre titoli da rendere obsoleti: bastano a coprire l'interruzione (uno
 * concluso, uno in volo, uno mai interrogato) e il doppio avvio. Il file li
 * semina e li ripristina in ogni scenario; gli scenari girano in serie dentro
 * il file (`fullyParallel: false`), quindi la pila di undo resta consistente.
 */
export const TITOLI_US_035_VARIANTI: TitoloSeminabile[] = [
  {
    isin: 'IE00BGV5VN51',
    file: 'US-035__aggiorna-obsoleti-varianti.spec.ts',
    campi: {
      name: 'Xtrackers S&P 500 Equal Weight Ucits Etf 1c',
      price: 76.3,
      ticker: 'XDEW',
      instrument_type: 'ETF ARMONIZZATI',
      total_annual_fees: '0,20%',
      currency: 'EUR',
      issuer: 'XTRACKERS IE PLC',
      segment: 'ETF Indicizzati',
      dividend_policy: 'ad accumulazione',
    },
  },
  {
    isin: 'IE00BDBRDM35',
    file: 'US-035__aggiorna-obsoleti-varianti.spec.ts',
    campi: {
      name: 'Ishares Core Global Aggregate Bond Ucits Etf',
      price: 4.68,
      ticker: 'AGGH',
      instrument_type: 'ETF ARMONIZZATI',
      total_annual_fees: '0,10%',
      currency: 'EUR',
      issuer: 'ISHARES III PLC',
      segment: 'ETF Indicizzati',
      dividend_policy: 'ad accumulazione',
    },
  },
  {
    isin: 'IE00BF4RFH31',
    file: 'US-035__aggiorna-obsoleti-varianti.spec.ts',
    campi: {
      name: 'Ishares Msci World Small Cap Ucits Etf',
      price: 6.94,
      ticker: 'WSML',
      instrument_type: 'ETF ARMONIZZATI',
      total_annual_fees: '0,35%',
      currency: 'EUR',
      issuer: 'ISHARES III PLC',
      segment: 'ETF Indicizzati',
      dividend_policy: 'ad accumulazione',
    },
  },
];

/**
 * Riservato a `US-035__aggiorna-obsoleti-varianti.spec.ts`: il titolo rilevato
 * adesso, che regge sia lo scenario «nessun titolo da aggiornare» sia il
 * portafoglio d'arrivo dell'interruzione per cambio di conto.
 */
export const TITOLO_US_035_VARIANTI_FRESCO: TitoloSeminabile = {
  isin: 'LU1737652237',
  file: 'US-035__aggiorna-obsoleti-varianti.spec.ts',
  campi: {
    name: 'Amundi Index Msci World Ucits Etf Dr',
    price: 54.7,
    ticker: 'MWRD',
    instrument_type: 'ETF ARMONIZZATI',
    total_annual_fees: '0,18%',
    currency: 'EUR',
    issuer: 'AMUNDI INDEX SOLUTIONS',
    segment: 'ETF Indicizzati',
    dividend_policy: 'ad accumulazione',
  },
};

/**
 * Riservato a `US-035__aggiorna-obsoleti-varianti.spec.ts`: la crepa dichiarata
 * dell'equivalenza «obsoleto ⟺ la guardia lascia passare».
 *
 * Va seminato con **prezzo nullo e `fetched_at` di adesso**. La vista arricchita
 * lo classifica `never-fetched` — l'istante è nullo quando manca il prezzo —
 * quindi entra nella lista di lavoro; ma per la guardia di buona cittadinanza
 * quella riga è recentissima, e `GET /api/securities/:isin` risponde 200 con
 * `confirmation` **senza contattare la fonte**. Il ciclo lo registra fra i non
 * aggiornati invece di ripetere con `?force=true`, che il criterio vieta.
 *
 * Lo scenario non intercetta la rotta: la guardia che risponde è quella del
 * server, e proprio perché risponde dall'archivio nessuna fonte reale viene
 * contattata.
 */
export const ISIN_GUARDIA_US_035: ChiaveRiservata = {
  isin: 'IE00B52VJ196',
  file: 'US-035__aggiorna-obsoleti-varianti.spec.ts',
};

/**
 * Riservato a `US-009__storico-prezzi.spec.ts` (il file demo).
 *
 * È il titolo di cui lo scenario dimostrativo semina due rilevazioni, in giorni
 * e a prezzi diversi. `price` coincide con l'osservazione più recente seminata
 * dalla spec: la scheda dichiara *quel* prezzo come attuale, e una divergenza
 * fra la cifra in cima allo storico e quella del cartellino sarebbe, per chi
 * guarda, un dato falso.
 *
 * Fino a US-040 questo file seminava `IE00BFY0GT14`, la stessa chiave di
 * `TITOLO_US_032`: due file su worker paralleli che si ripristinavano a vicenda
 * lo stato sbagliato. La chiave è ora esclusiva, e il prezzo è rimasto quello che
 * lo scenario asserisce.
 */
export const TITOLO_US_009: TitoloSeminabile = {
  isin: 'IE00B0M62Q58',
  file: 'US-009__storico-prezzi.spec.ts',
  campi: {
    name: 'Ishares Msci World Ucits Etf Dist',
    price: 128.46,
    ticker: 'IWRD',
    instrument_type: 'ETF ARMONIZZATI',
    total_annual_fees: '0,50%',
    currency: 'EUR',
    issuer: 'ISHARES PLC',
    segment: 'ETF Indicizzati',
    dividend_policy: 'a distribuzione',
    data_source: 'borsaitaliana',
  },
};

/**
 * Riservato a `US-009__storico-prezzi-varianti.spec.ts`.
 *
 * Regge tre scenari sullo stesso ISIN — una sola osservazione, due prezzi
 * diversi nello stesso giorno, fonte non registrata — perché sono varianti dello
 * stesso storico e ciascuno lo semina da capo. `data_source` resta esplicito per
 * la stessa ragione di US-018: senza fissarlo, il timbro dipenderebbe da quale
 * fonte ha popolato la cache per ultima.
 *
 * Fino a US-040 questo file seminava `IE00B3XXRP09`, che è anche il terzo titolo
 * di `TITOLI_US_035_OBSOLETI`: una collisione mai dichiarata, identica a quella
 * fra US-009 e US-032. La chiave è ora esclusiva e il quartetto narrativo di
 * US-035 è rimasto intatto.
 */
export const TITOLO_US_009_VARIANTI: TitoloSeminabile = {
  isin: 'IE00B02KXK85',
  file: 'US-009__storico-prezzi-varianti.spec.ts',
  campi: {
    name: 'Ishares Msci Emerging Markets Ucits Etf Dist',
    price: 104.2,
    ticker: 'IEEM',
    instrument_type: 'ETF ARMONIZZATI',
    total_annual_fees: '0,75%',
    currency: 'EUR',
    issuer: 'ISHARES PLC',
    segment: 'ETF Indicizzati',
    dividend_policy: 'a distribuzione',
    data_source: 'borsaitaliana',
  },
};

/**
 * Riservato a `US-036__grafico-titolo.spec.ts` (il file demo).
 *
 * È il titolo su cui lo scenario dimostrativo costruisce il grafico: due carichi
 * a prezzi diversi e due rilevazioni seminate in giorni diversi, cioè i quattro
 * punti che la curva deve mostrare insieme alla linea del prezzo medio ponderato
 * di carico. Il grafico ha bisogno di *entrambe* le sorgenti perché è proprio il
 * loro incrocio a raccontare se si è comprato sopra o sotto il mercato.
 *
 * `price` coincide con l'osservazione più recente che la spec semina, per la
 * stessa ragione registrata su US-009: la scheda dichiara quella cifra come
 * prezzo attuale e la riporta anche in cima allo storico, quindi una divergenza
 * fra il cartellino e l'ultimo punto del grafico sarebbe, per chi guarda, un dato
 * falso — e nessuna asserzione la coglierebbe, perché ogni pezzo resterebbe
 * coerente con sé stesso.
 *
 * `data_source` è esplicito per la ragione di US-018: la scheda dichiara la
 * provenienza, e senza fissarla il timbro dipenderebbe da quale fonte ha popolato
 * la cache per ultima.
 */
export const TITOLO_US_036: TitoloSeminabile = {
  isin: 'IE00B4K48X80',
  file: 'US-036__grafico-titolo.spec.ts',
  campi: {
    name: 'Ishares Core Msci Europe Ucits Etf Eur Acc',
    price: 84.15,
    ticker: 'SMEA',
    instrument_type: 'ETF ARMONIZZATI',
    total_annual_fees: '0,12%',
    currency: 'EUR',
    issuer: 'ISHARES III PLC',
    segment: 'ETF Indicizzati',
    dividend_policy: 'ad accumulazione',
    data_source: 'borsaitaliana',
  },
};

/**
 * Riservato a `US-036__grafico-titolo-varianti.spec.ts`.
 *
 * Regge tre scenari sullo stesso ISIN — un solo carico e nessuna rilevazione,
 * due carichi di quantità diverse, nessuna richiesta verso
 * `**\/api\/securities\/**` — perché sono varianti dello stesso grafico e
 * ciascuno si costruisce la propria premessa: il file semina il titolo, e
 * *rimuove o sostituisce* le osservazioni prima di contare i punti. Rimuovere e
 * ripristinare è la stessa pila di undo del seeding, quindi vale comunque la
 * riserva per file; gli scenari girano in serie dentro il file
 * (`fullyParallel: false`), quindi la pila resta consistente.
 *
 * Il `price` è la cifra che la scheda mostra sul cartellino ed è quindi anche il
 * riferimento dello scenario a storico vuoto, dove il grafico ha un punto solo.
 * Quando invece uno scenario semina osservazioni, deve tenere la più recente su
 * questo stesso valore: la divergenza fra cima dello storico e cartellino non
 * farebbe fallire nulla — ogni pezzo resterebbe coerente con sé stesso — ma
 * mostrerebbe un dato falso, che è esattamente ciò che la demo dovrebbe
 * smentire.
 *
 * Lo scenario che conta le richieste di pagina ha bisogno che il titolo sia già
 * in cache *e* rilevato adesso (il default di `seminaTitolo`): è la sola premessa
 * sotto cui zero chiamate a `**\/api\/securities\/**` significano «il grafico si
 * disegna con i dati che la pagina ha già» e non «la guardia ha risposto no».
 */
export const TITOLO_US_036_VARIANTI: TitoloSeminabile = {
  isin: 'IE00B8GKDB10',
  file: 'US-036__grafico-titolo-varianti.spec.ts',
  campi: {
    name: 'Vanguard Ftse All-World High Dividend Yield Ucits Etf',
    price: 62.4,
    ticker: 'VHYL',
    instrument_type: 'ETF ARMONIZZATI',
    total_annual_fees: '0,29%',
    currency: 'EUR',
    issuer: 'VANGUARD FUNDS PLC',
    segment: 'ETF Indicizzati',
    dividend_policy: 'a distribuzione',
    data_source: 'borsaitaliana',
  },
};

/**
 * Riservato a `US-037__scala-temporale-grafico.spec.ts` (lo scenario dimostrativo).
 *
 * Lo scenario semina carichi e rilevazioni di quest'anno e poi cambia scala
 * temporale: «ultimo mese» deve restringere il tracciato, «ultimi 10 anni» deve
 * dichiarare da quando la copertura comincia davvero. Il `price` è la cifra che
 * la scheda mostra sul cartellino, e la rilevazione più recente seminata va
 * tenuta su questo stesso valore — divergere non farebbe fallire nulla, ma
 * mostrerebbe un dato falso proprio nel filmato che dovrebbe smentirlo.
 *
 * Il titolo va seminato con `fetched_at` di **adesso** (il default di
 * `seminaTitolo`): è la guardia di buona cittadinanza a impedire un recupero
 * reale, e un recupero registrerebbe un'osservazione a oggi che cambierebbe il
 * conteggio dei punti sotto i piedi del test.
 */
export const TITOLO_US_037: TitoloSeminabile = {
  isin: 'LU1681043599',
  file: 'US-037__scala-temporale-grafico.spec.ts',
  campi: {
    name: 'Amundi Index Solutions Msci World Ucits Etf',
    price: 94.2,
    ticker: 'CW8',
    instrument_type: 'ETF ARMONIZZATI',
    total_annual_fees: '0,38%',
    currency: 'EUR',
    issuer: 'AMUNDI INDEX SOLUTIONS',
    segment: 'ETF Indicizzati',
    dividend_policy: 'ad accumulazione',
    data_source: 'borsaitaliana',
  },
};

/**
 * Riservato a `US-037__scala-temporale-varianti.spec.ts`.
 *
 * Regge tre scenari sullo stesso ISIN — finestra priva di dati, scala
 * predefinita a ogni apertura, zero richieste al server cambiando scala —
 * perché sono varianti dello stesso selettore e ciascuno si costruisce la
 * propria premessa con `seminaOsservazioni`, che *sostituisce* lo storico.
 *
 * Qui il seme con `fetched_at` di adesso non è una comodità ma una **premessa
 * dello scenario**: un recupero reale registrerebbe un'osservazione a oggi, che
 * da sola riempirebbe la finestra «ultimo mese» e smonterebbe in silenzio proprio
 * il caso che il criterio 4 mette alla prova.
 */
export const TITOLO_US_037_VARIANTI: TitoloSeminabile = {
  isin: 'IE00BKM4GZ66',
  file: 'US-037__scala-temporale-varianti.spec.ts',
  campi: {
    name: 'Ishares Core Msci Em Imi Ucits Etf',
    price: 41.86,
    ticker: 'EIMI',
    instrument_type: 'ETF ARMONIZZATI',
    total_annual_fees: '0,18%',
    currency: 'EUR',
    issuer: 'BLACKROCK ASSET MANAGEMENT IRELAND LTD',
    segment: 'ETF Indicizzati',
    dividend_policy: 'ad accumulazione',
    data_source: 'borsaitaliana',
  },
};

/**
 * Il **secondo** titolo di `US-037__scala-temporale-varianti.spec.ts`.
 *
 * Serve a un solo scenario, quello del criterio 2: la scala scelta su un titolo
 * non deve sopravvivere all'apertura della scheda di un *altro* titolo. Senza
 * una seconda anagrafica quello scenario non è scrivibile — riaprire la stessa
 * scheda proverebbe qualcos'altro.
 *
 * Due ISIN riservati allo stesso file non violano la regola un-ISIN-per-file:
 * ciò che quella regola vieta è **condividere una chiave fra file**, perché il
 * seeding è uno stack di undo e due file in parallelo si ripristinerebbero a
 * vicenda lo stato sbagliato. Qui entrambe le chiavi appartengono a un solo
 * file, che gira in serie con sé stesso.
 */
export const TITOLO_US_037_SECONDO: TitoloSeminabile = {
  isin: 'IE00BYZK4552',
  file: 'US-037__scala-temporale-varianti.spec.ts',
  campi: {
    name: 'Ishares Automation & Robotics Ucits Etf',
    price: 132.74,
    ticker: 'RBOT',
    instrument_type: 'ETF ARMONIZZATI',
    total_annual_fees: '0,40%',
    currency: 'EUR',
    issuer: 'BLACKROCK ASSET MANAGEMENT IRELAND LTD',
    segment: 'ETF Indicizzati',
    dividend_policy: 'ad accumulazione',
    data_source: 'borsaitaliana',
  },
};

/**
 * Riservato a `US-038__metriche-titolo.spec.ts` (lo scenario dimostrativo).
 *
 * Lo scenario iscrive **due carichi a prezzi e quantità diversi** — perché la
 * media ponderata e quella aritmetica coincidono a quantità uguali, e un titolo
 * a quantità uguali non dimostrerebbe la ponderazione — e semina rilevazioni
 * distribuite sull'ultimo anno, così che cambiando scala la variazione di
 * periodo cambi capi mentre il P&L da carico resta immobile.
 *
 * Il `price` è la cifra che la scheda mostra sul cartellino ed entra nel P&L: la
 * rilevazione più recente seminata va tenuta su questo stesso valore, per la
 * ragione già registrata su US-009 e US-036 — divergere non farebbe fallire
 * nulla, ma mostrerebbe un dato falso proprio nel filmato che dovrebbe smentirlo.
 *
 * Il titolo va seminato con `fetched_at` di **adesso** (il default di
 * `seminaTitolo`): è la guardia di buona cittadinanza a impedire un recupero
 * reale, e un recupero registrerebbe un'osservazione a oggi che cambierebbe il
 * conteggio delle rilevazioni comprese sotto i piedi del test.
 */
export const TITOLO_US_038: TitoloSeminabile = {
  isin: 'IE00BYX2JD69',
  file: 'US-038__metriche-titolo.spec.ts',
  campi: {
    name: 'Vanguard Esg Global All Cap Ucits Etf Acc',
    price: 128.46,
    ticker: 'V3AA',
    instrument_type: 'ETF ARMONIZZATI',
    total_annual_fees: '0,24%',
    currency: 'EUR',
    issuer: 'VANGUARD FUNDS PLC',
    segment: 'ETF Indicizzati',
    dividend_policy: 'ad accumulazione',
    data_source: 'borsaitaliana',
  },
};

/**
 * Riservato a `US-038__metriche-titolo-varianti.spec.ts`.
 *
 * Regge tre scenari sullo stesso ISIN — una sola rilevazione in finestra, due
 * rilevazioni allo stesso prezzo, più carichi e una sola rilevazione — perché
 * sono varianti della stessa bilancia e ciascuno si costruisce la propria
 * premessa con `seminaOsservazioni`, che *sostituisce* lo storico.
 *
 * Anche qui il seme con `fetched_at` di adesso è una **premessa dello scenario**
 * e non una comodità: un recupero reale registrerebbe un'osservazione a oggi che
 * da sola porterebbe a due le rilevazioni comprese, smontando in silenzio proprio
 * il caso del criterio 4.
 */
export const TITOLO_US_038_VARIANTI: TitoloSeminabile = {
  isin: 'IE00BZ163L38',
  file: 'US-038__metriche-titolo-varianti.spec.ts',
  campi: {
    name: 'Vanguard Usd Corporate Bond Ucits Etf',
    price: 51.2,
    ticker: 'VDCP',
    instrument_type: 'ETF ARMONIZZATI',
    total_annual_fees: '0,09%',
    currency: 'EUR',
    issuer: 'VANGUARD FUNDS PLC',
    segment: 'ETF Indicizzati',
    dividend_policy: 'a distribuzione',
    data_source: 'borsaitaliana',
  },
};

/**
 * Riservato a `US-039__vista-valore-posizione.spec.ts` (scenario dimostrativo).
 *
 * Regge il caso della spec: **due carichi a prezzi e quantità diversi**, il
 * secondo dei quali produce il gradino verticale che la vista del valore deve
 * dichiarare come capitale versato. Le quantità sono diverse perché il gradino
 * dimostra qualcosa solo se la quantità *cambia*: a quantità nulla aggiunta non
 * ci sarebbe salto da misurare.
 *
 * Il `price` è la cifra che la scheda mostra sul cartellino: la rilevazione più
 * recente seminata va tenuta su questo stesso valore, per la ragione già
 * registrata su US-009, US-036 e US-038 — divergere non farebbe fallire nulla, e
 * mostrerebbe un dato falso proprio nel filmato che dovrebbe smentirlo.
 *
 * Seme con `fetched_at` di **adesso** (il default di `seminaTitolo`): è la
 * guardia di buona cittadinanza a impedire un recupero reale, e un recupero
 * registrerebbe un'osservazione a oggi che sposterebbe l'ultimo punto della
 * curva del valore sotto i piedi del test.
 */
export const TITOLO_US_039: TitoloSeminabile = {
  isin: 'IE00BFMXXD54',
  file: 'US-039__vista-valore-posizione.spec.ts',
  campi: {
    name: 'Vanguard Sp 500 Ucits Etf Usd Accumulating',
    price: 128.46,
    ticker: 'VUAA',
    instrument_type: 'ETF ARMONIZZATI',
    total_annual_fees: '0,07%',
    currency: 'EUR',
    issuer: 'VANGUARD FUNDS PLC',
    segment: 'ETF Indicizzati',
    dividend_policy: 'ad accumulazione',
    data_source: 'borsaitaliana',
  },
};

/**
 * Riservato a `US-039__vista-valore-varianti.spec.ts`.
 *
 * Regge tre premesse diverse sullo stesso ISIN — quantità non retroattiva,
 * rilevazioni anteriori al primo carico, titolo senza alcun carico — perché sono
 * varianti della stessa commutazione e ciascuna si costruisce la propria
 * premessa con `seminaOsservazioni`, che *sostituisce* lo storico.
 *
 * Il caso «senza alcun carico» è la ragione per cui questo ISIN non può essere
 * condiviso con il file dimostrativo: là il titolo ha due carichi, qui in uno
 * scenario non ne ha nessuno, e il portafoglio che li ospita è diverso per
 * costruzione.
 */
export const TITOLO_US_039_VARIANTI: TitoloSeminabile = {
  isin: 'IE00BG0J4C88',
  file: 'US-039__vista-valore-varianti.spec.ts',
  campi: {
    name: 'Ishares Global Aggregate Bond Ucits Etf',
    price: 43.7,
    ticker: 'AGGH',
    instrument_type: 'ETF ARMONIZZATI',
    total_annual_fees: '0,10%',
    currency: 'EUR',
    issuer: 'ISHARES VI PUBLIC LIMITED COMPANY',
    segment: 'ETF Indicizzati',
    dividend_policy: 'ad accumulazione',
    data_source: 'borsaitaliana',
  },
};

/**
 * Il **secondo** titolo di `US-039__vista-valore-varianti.spec.ts`.
 *
 * Serve a un solo scenario, quello del criterio 2: la vista scelta su un titolo
 * non deve sopravvivere all'apertura della scheda di un *altro* titolo. Senza
 * una seconda anagrafica quello scenario non è scrivibile — riaprire la stessa
 * scheda proverebbe qualcos'altro.
 *
 * Due ISIN riservati allo stesso file non violano la regola un-ISIN-per-file:
 * ciò che quella regola vieta è **condividere una chiave fra file**, perché il
 * seeding è uno stack di undo e due file in parallelo si ripristinerebbero a
 * vicenda lo stato sbagliato. Qui entrambe le chiavi appartengono a un solo
 * file, che gira in serie con sé stesso.
 */
export const TITOLO_US_039_SECONDO: TitoloSeminabile = {
  isin: 'LU2089238039',
  file: 'US-039__vista-valore-varianti.spec.ts',
  campi: {
    name: 'Amundi Msci Emerging Markets Ucits Etf Acc',
    price: 27.94,
    ticker: 'AEEM',
    instrument_type: 'ETF ARMONIZZATI',
    total_annual_fees: '0,20%',
    currency: 'EUR',
    issuer: 'AMUNDI INDEX SOLUTIONS',
    segment: 'ETF Indicizzati',
    dividend_policy: 'ad accumulazione',
    data_source: 'borsaitaliana',
  },
};

/**
 * Riservati a `US-011__aggiungi-posizione.spec.ts`.
 *
 * Due chiavi perché il file ne digita due nel campo di ricerca: il primo carico
 * dello scenario dimostrativo e quello della persistenza. Fino a US-040 erano due
 * letterali presi in prestito da altri file — `IE00B4L5Y983` di US-025 e
 * `IE00B3RBWM25` di US-034 — e funzionavano solo perché quelle righe erano già in
 * archivio di sviluppo: la premessa era ereditata, non costruita.
 *
 * Il file le semina entrambe con `fetched_at` di **adesso** (il default di
 * `seminaTitolo`), e non è una comodità: senza riga fresca in cache la guardia di
 * buona cittadinanza lascia passare, `GET /api/securities/:isin` contatta Borsa
 * Italiana e poi il browser headless su MorningStar — 8-12 secondi, oltre il
 * budget del test e dipendenti dall'ora del run.
 */
export const TITOLO_US_011: TitoloSeminabile = {
  isin: 'LU0274208692',
  file: 'US-011__aggiungi-posizione.spec.ts',
  campi: {
    name: 'Xtrackers Msci World Ucits Etf 1c',
    price: 89.42,
    ticker: 'XMWO',
    instrument_type: 'ETF ARMONIZZATI',
    total_annual_fees: '0,19%',
    currency: 'EUR',
    issuer: 'XTRACKERS',
    segment: 'ETF Indicizzati',
    dividend_policy: 'ad accumulazione',
  },
};

/** Il **secondo** titolo di `US-011__aggiungi-posizione.spec.ts`: quello della persistenza. */
export const TITOLO_US_011_SECONDO: TitoloSeminabile = {
  isin: 'IE00B3VVMM84',
  file: 'US-011__aggiungi-posizione.spec.ts',
  campi: {
    name: 'Vanguard Ftse Emerging Markets Ucits Etf',
    price: 115.2,
    ticker: 'VFEM',
    instrument_type: 'ETF ARMONIZZATI',
    total_annual_fees: '0,22%',
    currency: 'EUR',
    issuer: 'VANGUARD FUNDS PLC',
    segment: 'ETF Indicizzati',
    dividend_policy: 'a distribuzione',
  },
};

/**
 * Riservati a `US-012__carichi-multipli.spec.ts`.
 *
 * Due chiavi perché lo scenario multi-ISIN deve mostrare **due righe distinte**
 * nella tabella aggregata: con una chiave sola quel criterio non è scrivibile. La
 * prima è anche quella che lo scenario dimostrativo digita nel campo di ricerca,
 * quindi vale la stessa cautela sul `fetched_at` registrata su US-011.
 */
export const TITOLO_US_012: TitoloSeminabile = {
  isin: 'IE00B810Q511',
  file: 'US-012__carichi-multipli.spec.ts',
  campi: {
    name: 'Vanguard Ftse Japan Ucits Etf',
    price: 90.2,
    ticker: 'VJPN',
    instrument_type: 'ETF ARMONIZZATI',
    total_annual_fees: '0,15%',
    currency: 'EUR',
    issuer: 'VANGUARD FUNDS PLC',
    segment: 'ETF Indicizzati',
    dividend_policy: 'a distribuzione',
  },
};

/** Il **secondo** titolo di `US-012__carichi-multipli.spec.ts`: la seconda riga aggregata. */
export const TITOLO_US_012_SECONDO: TitoloSeminabile = {
  isin: 'IE00B945VV12',
  file: 'US-012__carichi-multipli.spec.ts',
  campi: {
    name: 'Vanguard Ftse Developed Europe Ucits Etf',
    price: 115.5,
    ticker: 'VEUR',
    instrument_type: 'ETF ARMONIZZATI',
    total_annual_fees: '0,10%',
    currency: 'EUR',
    issuer: 'VANGUARD FUNDS PLC',
    segment: 'ETF Indicizzati',
    dividend_policy: 'a distribuzione',
  },
};

/**
 * Riservati a `US-013__modifica-rimuovi-posizione.spec.ts`.
 *
 * Due chiavi perché lo scenario dimostrativo iscrive due carichi e poi ne
 * *rimuove* uno: il criterio è che la riga sparisca dalla tabella aggregata, e con
 * una chiave sola sparirebbe l'intera tabella invece della sola riga. Entrambe
 * sono digitate nel campo di ricerca, quindi vale la cautela sul `fetched_at`
 * registrata su US-011.
 */
export const TITOLO_US_013: TitoloSeminabile = {
  isin: 'IE00BZ163G84',
  file: 'US-013__modifica-rimuovi-posizione.spec.ts',
  campi: {
    name: 'Vanguard Eur Corporate Bond Ucits Etf',
    price: 89.0,
    ticker: 'VECP',
    instrument_type: 'ETF ARMONIZZATI',
    total_annual_fees: '0,09%',
    currency: 'EUR',
    issuer: 'VANGUARD FUNDS PLC',
    segment: 'ETF Indicizzati',
    dividend_policy: 'a distribuzione',
  },
};

/** Il **secondo** titolo di `US-013__modifica-rimuovi-posizione.spec.ts`: quello rimosso. */
export const TITOLO_US_013_SECONDO: TitoloSeminabile = {
  isin: 'IE00BZ163K21',
  file: 'US-013__modifica-rimuovi-posizione.spec.ts',
  campi: {
    name: 'Vanguard Eur Eurozone Government Bond Ucits Etf',
    price: 115.0,
    ticker: 'VETY',
    instrument_type: 'ETF ARMONIZZATI',
    total_annual_fees: '0,07%',
    currency: 'EUR',
    issuer: 'VANGUARD FUNDS PLC',
    segment: 'ETF Indicizzati',
    dividend_policy: 'a distribuzione',
  },
};

/**
 * Riservato a `US-017__visualizza-tabella-titoli.spec.ts`.
 *
 * Qui l'ISIN entra solo dalle posizioni iscritte via API e nessuna asserzione
 * guarda il prezzo — ma la riga di riepilogo lo rileva con una LEFT JOIN sulla
 * cache, quindi la premessa va comunque costruita invece che ereditata dalla riga
 * che un altro file ha lasciato in archivio.
 */
export const TITOLO_US_017: TitoloSeminabile = {
  isin: 'IE00B6R52259',
  file: 'US-017__visualizza-tabella-titoli.spec.ts',
  campi: {
    name: 'Ishares Msci Acwi Ucits Etf',
    price: 92.31,
    ticker: 'SSAC',
    instrument_type: 'ETF ARMONIZZATI',
    total_annual_fees: '0,20%',
    currency: 'EUR',
    issuer: 'ISHARES III PLC',
    segment: 'ETF Indicizzati',
    dividend_policy: 'ad accumulazione',
  },
};

/**
 * Riservato a `US-026__apre-scheda-riepilogo.spec.ts` (il file demo).
 *
 * Il file fratello `US-026__schede-portafoglio.spec.ts` ha la sua chiave in
 * `TITOLO_US_026`: sono due file, e Playwright li esegue su worker paralleli.
 */
export const TITOLO_US_026_RIEPILOGO: TitoloSeminabile = {
  isin: 'IE00B3YLTY66',
  file: 'US-026__apre-scheda-riepilogo.spec.ts',
  campi: {
    name: 'Spdr Msci Acwi Imi Ucits Etf',
    price: 78.64,
    ticker: 'IMIE',
    instrument_type: 'ETF ARMONIZZATI',
    total_annual_fees: '0,17%',
    currency: 'EUR',
    issuer: 'SSGA SPDR ETFS EUROPE II PLC',
    segment: 'ETF Indicizzati',
    dividend_policy: 'ad accumulazione',
  },
};

/**
 * Riservato a `US-031__larghezza-foglio.spec.ts` (il file demo).
 *
 * Lo scenario misura geometrie e non numeri, ma la riga di riepilogo che ospita
 * quelle geometrie legge comunque il prezzo dalla cache: la premessa va costruita.
 */
export const TITOLO_US_031_LARGHEZZA: TitoloSeminabile = {
  isin: 'IE00B52MJY50',
  file: 'US-031__larghezza-foglio.spec.ts',
  campi: {
    name: 'Ishares Core Msci Pacific Ex-Japan Ucits Etf',
    price: 96.85,
    ticker: 'CPXJ',
    instrument_type: 'ETF ARMONIZZATI',
    total_annual_fees: '0,20%',
    currency: 'EUR',
    issuer: 'ISHARES III PLC',
    segment: 'ETF Indicizzati',
    dividend_policy: 'ad accumulazione',
  },
};

/** Riservato a `US-031__soglie-responsive.spec.ts`: stessa ragione del file fratello. */
export const TITOLO_US_031_SOGLIE: TitoloSeminabile = {
  isin: 'IE00B1FZS467',
  file: 'US-031__soglie-responsive.spec.ts',
  campi: {
    name: 'Ishares Global Infrastructure Ucits Etf',
    price: 34.12,
    ticker: 'INFR',
    instrument_type: 'ETF ARMONIZZATI',
    total_annual_fees: '0,65%',
    currency: 'EUR',
    issuer: 'ISHARES PLC',
    segment: 'ETF Indicizzati',
    dividend_policy: 'a distribuzione',
  },
};

/**
 * Riservati a `US-014__valore-totale-portafoglio.spec.ts`: una chiave che il file
 * semina, una che rimuove.
 *
 * Solo le chiavi, senza anagrafica: i campi cambiano da uno scenario all'altro —
 * prezzo noto contro cache miss — e sono precisamente la variabile che ciascuno
 * mette alla prova, quindi tenerli sotto gli occhi del test vale più della
 * simmetria con le altre costanti (stessa scelta di `ISIN_SENZA_PREZZO_US_032`).
 *
 * Fino a US-040 erano due letterali locali, e uno dei due — `IE00BJRHVJ28` — è
 * anche il segnaposto mostrato in `client/src/pages/PortfolioDetailPage.tsx`:
 * un `toContainText` su quell'ISIN poteva essere soddisfatto dal testo di esempio
 * invece che dal dato. Le chiavi qui sotto sono diverse da entrambi i segnaposto
 * del client.
 */
export const ISIN_CON_PREZZO_US_014: ChiaveRiservata = {
  isin: 'IE00BKM4H197',
  file: 'US-014__valore-totale-portafoglio.spec.ts',
};

/** L'ISIN che US-014 *rimuove* dalla cache, per garantire il cache miss dello scenario. */
export const ISIN_SENZA_PREZZO_US_014: ChiaveRiservata = {
  isin: 'IE00BLRPRL42',
  file: 'US-014__valore-totale-portafoglio.spec.ts',
};

/**
 * Le due chiavi che la suite usa solo come **dato di stub**, mai in archivio.
 *
 * Nessuno dei file coinvolti tocca la cache: intercettano `**\/api\/securities\/**`
 * con `route.fulfill()` e la richiesta non arriva mai al server. La condivisione è
 * quindi innocua — ma prima di US-040 era anche tacita, cioè indistinguibile da
 * una svista. Dichiararla la rende una riga che si rivede in code review, e mette
 * le due chiavi sotto il controllo insieme a tutte le altre.
 *
 * Le costanti non sono importate dai file: quelli continuano a portare il
 * letterale, che è ciò che l'utente digita nel campo di ricerca ed è più leggibile
 * lì. Il controllo risolve comunque i letterali, quindi la dichiarazione vincola.
 */
export const ISIN_STUB_US_007: ChiaveRiservata = {
  isin: 'IE00BMVB5S82',
  file: 'US-007__ricerca-isin.spec.ts',
  lettoDa: ['demo__recupera-anagrafica-isin.spec.ts'],
};

/** L'ISIN di stub condiviso fra US-008 e lo scenario di ripiego su MorningStar. */
export const ISIN_STUB_US_008: ChiaveRiservata = {
  isin: 'IE00BJRHVJ28',
  file: 'US-008__trasparenza-dati.spec.ts',
  lettoDa: ['fallback-morningstar.spec.ts'],
};
/**
 * Riservato a `US-042__registra-vendita-lifo.spec.ts` (scenario dimostrativo).
 *
 * Regge il caso della spec: **due carichi a prezzi e quantità diversi**, perché
 * l'attribuzione LIFO è dimostrabile solo così. A prezzi uguali LIFO e FIFO danno
 * lo stesso prezzo medio del residuo, e lo scenario passerebbe su
 * un'implementazione sbagliata; a quantità uguali la media ponderata e quella
 * aritmetica coincidono, e il ricalcolo del residuo non si distinguerebbe.
 *
 * Il seme porta `fetched_at` di adesso (il default di `seminaTitolo`) ed è la
 * guardia che impedisce un recupero reale dalla fonte: la pagina di dettaglio
 * legge il prezzo con una LEFT JOIN, e senza il seme un recupero a freddo
 * costerebbe 8-12 secondi non deterministici.
 */
export const TITOLO_US_042: TitoloSeminabile = {
  isin: 'LU1392261811',
  file: 'US-042__registra-vendita-lifo.spec.ts',
  campi: {
    name: 'Vanguard Ftse All World Ucits Etf Acc',
    price: 124.5,
    ticker: 'VWCE',
    instrument_type: 'ETF ARMONIZZATI',
    total_annual_fees: '0,22%',
    currency: 'EUR',
    issuer: 'VANGUARD FUNDS PLC',
    segment: 'ETF Indicizzati',
    dividend_policy: 'ad accumulazione',
    data_source: 'borsaitaliana',
  },
};

/**
 * Riservato a `US-042__vendita-rifiuti.spec.ts`.
 *
 * Non può condividere la chiave con il file dimostrativo, e la ragione è la
 * regola stessa: i due file girano su worker distinti, e seminare-e-ripristinare
 * è uno stack di undo — l'ultimo a ripristinare tornerebbe allo stato intermedio
 * lasciato dall'altro. Qui inoltre le premesse sono *opposte* a quelle dello
 * scenario dimostrativo: là la vendita riesce, qui i tre rifiuti pretendono un
 * registro in cui nessuna vendita è ancora andata a buon fine.
 */
export const TITOLO_US_042_RIFIUTI: TitoloSeminabile = {
  isin: 'IE00BMVB5M96',
  file: 'US-042__vendita-rifiuti.spec.ts',
  campi: {
    name: 'Vanguard Ftse All World Ucits Etf Dist',
    price: 108.2,
    ticker: 'VWRL',
    instrument_type: 'ETF ARMONIZZATI',
    total_annual_fees: '0,22%',
    currency: 'EUR',
    issuer: 'VANGUARD FUNDS PLC',
    segment: 'ETF Indicizzati',
    dividend_policy: 'a distribuzione',
    data_source: 'borsaitaliana',
  },
};

/**
 * Riservato a `US-043__mostra-pnl-realizzato-e-latente.spec.ts` (scenario
 * dimostrativo).
 *
 * Regge lo stesso scenario dei mockup e di `TITOLO_US_042`: **due carichi a
 * prezzi diversi**, perché senza quella differenza LIFO e FIFO attribuirebbero
 * lo stesso costo e il P&L realizzato non distinguerebbe i due criteri. Non può
 * condividere la chiave con `TITOLO_US_042` (stessa ragione di
 * `TITOLO_US_042_RIFIUTI`): sono file diversi su worker potenzialmente
 * paralleli, e seminare-e-ripristinare è uno stack di undo per ISIN.
 *
 * Il seme porta `fetched_at` **non** di adesso ma di qualche sessione di borsa
 * fa: lo scenario deve poter premere «Aggiorna dati» dalla scheda titolo e
 * vedere l'aggiornamento riuscire al primo colpo, senza che la guardia di
 * buona cittadinanza lo blocchi — è esattamente la premessa che
 * `TITOLO_US_030` usa per lo stesso comando.
 */
export const TITOLO_US_043: TitoloSeminabile = {
  isin: 'IE00BFY0GT22',
  file: 'US-043__mostra-pnl-realizzato-e-latente.spec.ts',
  campi: {
    name: 'Vanguard Ftse All World Ucits Etf Acc',
    price: 12.5,
    ticker: 'VWCE',
    instrument_type: 'ETF ARMONIZZATI',
    total_annual_fees: '0,22%',
    currency: 'EUR',
    issuer: 'VANGUARD FUNDS PLC',
    segment: 'ETF Indicizzati',
    dividend_policy: 'ad accumulazione',
    data_source: 'borsaitaliana',
  },
};

/**
 * Riservato a `US-043__mostra-pnl-realizzato-e-latente-varianti.spec.ts`: la
 * posizione venduta per intero.
 *
 * Il file sorello del demo — stessa coppia `US-026__*` per la ragione già
 * documentata in `CLAUDE.md`: `launchOptions.slowMo` non si può scoppiare a un
 * solo `describe`, quindi gli scenari senza video vivono in un file proprio.
 * Serve al criterio 3: dopo la vendita dell'intera quantità residua il quadro
 * deve mostrare P&L latente € 0,00 — zero *misurato* — e non «dato non
 * disponibile», anche con il prezzo corrente ancora in cache.
 */
export const TITOLO_US_043_VENDUTO_INTERO: TitoloSeminabile = {
  isin: 'IE00BFY0GT30',
  file: 'US-043__mostra-pnl-realizzato-e-latente-varianti.spec.ts',
  campi: {
    name: 'Vanguard Ftse All World Ucits Etf Dist',
    price: 12.9,
    ticker: 'VWRL',
    instrument_type: 'ETF ARMONIZZATI',
    total_annual_fees: '0,22%',
    currency: 'EUR',
    issuer: 'VANGUARD FUNDS PLC',
    segment: 'ETF Indicizzati',
    dividend_policy: 'a distribuzione',
    data_source: 'borsaitaliana',
  },
};

/**
 * Riservato a `US-043__mostra-pnl-realizzato-e-latente-varianti.spec.ts`: il
 * secondo titolo, caricato senza prezzo corrente in cache.
 *
 * Serve al solo scenario del prezzo mancante: il quadro del risultato deve
 * dichiarare il totale e la percentuale come parziali/assenti senza inventare
 * un rapporto, e questo richiede un ISIN che non risulti mai in `securities`.
 * Riservare due chiavi allo stesso file non viola la regola un-ISIN-per-file:
 * quella regola vieta di *condividerle fra file*, non di averne due proprie.
 */
export const TITOLO_US_043_SENZA_PREZZO: ChiaveRiservata = {
  isin: 'IE00BMVB5T24',
  file: 'US-043__mostra-pnl-realizzato-e-latente-varianti.spec.ts',
};

/**
 * Riservato a `US-044__posizioni-chiuse.spec.ts` (demo, con video): il
 * titolo che lo scenario vende per intero.
 *
 * Due carichi a prezzi diversi (altrimenti LIFO e FIFO attribuirebbero lo
 * stesso costo) e una vendita che ne esaurisce l'intero residuo: è l'ISIN
 * che il video deve mostrare uscire dalla tabella dei posseduti ed entrare
 * in «Posizioni chiuse».
 */
export const TITOLO_US_044: TitoloSeminabile = {
  isin: 'IE00BFY0GT48',
  file: 'US-044__posizioni-chiuse.spec.ts',
  campi: {
    name: 'Amundi Msci World Ucits Etf Acc',
    price: 12.5,
    ticker: 'CW8',
    instrument_type: 'ETF ARMONIZZATI',
    total_annual_fees: '0,38%',
    currency: 'EUR',
    issuer: 'AMUNDI ASSET MANAGEMENT',
    segment: 'ETF Indicizzati',
    dividend_policy: 'ad accumulazione',
    data_source: 'borsaitaliana',
  },
};

/**
 * Riservato a `US-044__posizioni-chiuse.spec.ts`: il secondo titolo dello
 * stesso scenario, posseduto normalmente e mai venduto — il contrappunto
 * che dimostra come il valore attuale totale continui a comprendere le sole
 * posizioni aperte.
 */
export const TITOLO_US_044_POSSEDUTO: TitoloSeminabile = {
  isin: 'IE00BFY0GT55',
  file: 'US-044__posizioni-chiuse.spec.ts',
  campi: {
    name: 'iShares Core Eur Corp Bond Ucits Etf',
    price: 65.0,
    ticker: 'IEAC',
    instrument_type: 'ETF ARMONIZZATI',
    total_annual_fees: '0,20%',
    currency: 'EUR',
    issuer: 'BLACKROCK ASSET MANAGEMENT IRELAND',
    segment: 'ETF Obbligazionari',
    dividend_policy: 'ad accumulazione',
    data_source: 'borsaitaliana',
  },
};

/**
 * Riservato a `US-044__posizioni-chiuse-varianti.spec.ts`: il titolo che i
 * casi limite chiudono e poi, nel primo scenario, riaprono con un nuovo
 * carico.
 */
export const TITOLO_US_044_VARIANTI: TitoloSeminabile = {
  isin: 'IE00BFY0GT63',
  file: 'US-044__posizioni-chiuse-varianti.spec.ts',
  campi: {
    name: 'Xtrackers Msci Emerging Markets Ucits Etf',
    price: 13.45,
    ticker: 'XMME',
    instrument_type: 'ETF ARMONIZZATI',
    total_annual_fees: '0,18%',
    currency: 'EUR',
    issuer: 'DWS INVESTMENT S.A.',
    segment: 'ETF Indicizzati',
    dividend_policy: 'ad accumulazione',
    data_source: 'borsaitaliana',
  },
};

/**
 * Riservato a `US-044__posizioni-chiuse-varianti.spec.ts`: il secondo
 * titolo chiuso, che nello scenario «due posizioni chiuse» compare accanto
 * a `TITOLO_US_044_VARIANTI` con cifre proprie.
 */
export const TITOLO_US_044_VARIANTI_SECONDO: TitoloSeminabile = {
  isin: 'IE00BFY0GT71',
  file: 'US-044__posizioni-chiuse-varianti.spec.ts',
  campi: {
    name: 'SPDR S&P 500 Ucits Etf',
    price: 48.2,
    ticker: 'SPY5',
    instrument_type: 'ETF ARMONIZZATI',
    total_annual_fees: '0,03%',
    currency: 'EUR',
    issuer: 'STATE STREET GLOBAL ADVISORS EUROPE',
    segment: 'ETF Indicizzati',
    dividend_policy: 'ad accumulazione',
    data_source: 'borsaitaliana',
  },
};

/**
 * Riservato a `US-045__grafico-riflette-vendite.spec.ts` (scenario dimostrativo).
 *
 * Regge il caso della spec: **un carico di 1.000 quote** e, più tardi, **una
 * vendita parziale di 400**, con tre rilevazioni di prezzo — una prima della
 * vendita, due dopo — che devono mostrare il controvalore moltiplicato per la
 * quantità detenuta *a quella data* e non per la quantità di oggi. Un solo
 * lotto è deliberato: con un solo carico il prezzo medio ponderato del residuo
 * resta identico a quello del lotto, e la vista «prezzo unitario» — che la
 * spec promette invariata — non ha alcuna complicazione LIFO a cui reagire.
 *
 * `price` coincide con l'ultima rilevazione che lo scenario semina, per la
 * stessa ragione registrata su US-009, US-036, US-038 e US-039: divergere fra
 * il cartellino e l'ultimo punto del grafico non farebbe fallire nulla, ma
 * mostrerebbe un dato falso proprio nel filmato che dovrebbe dimostrare il
 * contrario.
 *
 * Il seme porta `fetched_at` di **adesso** (il default di `seminaTitolo`): è
 * la guardia di buona cittadinanza a impedire un recupero reale dalla fonte,
 * che costerebbe 8-12 secondi non deterministici e sposterebbe l'ultimo punto
 * della curva sotto i piedi del test.
 */
export const TITOLO_US_045: TitoloSeminabile = {
  isin: 'IE00BFY0GT89',
  file: 'US-045__grafico-riflette-vendite.spec.ts',
  campi: {
    name: 'Amundi Ftse All-World Ucits Etf Acc',
    price: 58.3,
    ticker: 'AWLD',
    instrument_type: 'ETF ARMONIZZATI',
    total_annual_fees: '0,18%',
    currency: 'EUR',
    issuer: 'AMUNDI INDEX SOLUTIONS',
    segment: 'ETF Indicizzati',
    dividend_policy: 'ad accumulazione',
    data_source: 'borsaitaliana',
  },
};

/**
 * Riservato a `US-045__grafico-riflette-vendite-varianti.spec.ts`.
 *
 * Non può condividere la chiave con `TITOLO_US_045` (stessa ragione già
 * registrata per `TITOLO_US_042_RIFIUTI` e `TITOLO_US_043_VENDUTO_INTERO`):
 * sono file diversi su worker potenzialmente paralleli, e seminare le stesse
 * rilevazioni sarebbe uno stack di undo condiviso.
 *
 * Regge due scenari, entrambi costruiti attorno a una **vendita totale** — non
 * parziale, com'è invece il caso del file dimostrativo — perché è la vendita
 * totale a mettere alla prova ciò che il file demo non tocca: che i punti a
 * quantità zero restino *presenti* nel tracciato (data-valore="0",
 * data-quantita="0") invece di essere silenziosamente esclusi, e che un nuovo
 * carico registrato dopo l'azzeramento riapra la serie da capo — senza
 * gradino, perché `componiSerieValore` tratta un carico come gradino solo se
 * la quantità precedente è positiva — invece di accatastarsi sulla posizione
 * venduta.
 *
 * Ogni scenario semina le proprie rilevazioni con `seminaOsservazioni`, che
 * *sostituisce* lo storico: girano in serie dentro il file
 * (`fullyParallel: false`), quindi la pila di undo resta consistente.
 *
 * `price` coincide con l'ultima rilevazione che ciascuno scenario semina, per
 * la stessa ragione registrata su `TITOLO_US_045`: divergere fra il
 * cartellino e l'ultimo punto del grafico non farebbe fallire nulla, ma
 * mostrerebbe un dato falso.
 *
 * Il seme porta `fetched_at` di **adesso** (il default di `seminaTitolo`):
 * stessa guardia di buona cittadinanza già documentata su `TITOLO_US_045`.
 */
export const TITOLO_US_045_VARIANTI: TitoloSeminabile = {
  isin: 'IE00BFY0GT97',
  file: 'US-045__grafico-riflette-vendite-varianti.spec.ts',
  campi: {
    name: 'Lyxor Msci World Ucits Etf Acc',
    price: 47.1,
    ticker: 'LYWD',
    instrument_type: 'ETF ARMONIZZATI',
    total_annual_fees: '0,30%',
    currency: 'EUR',
    issuer: 'LYXOR INTERNATIONAL ASSET MANAGEMENT',
    segment: 'ETF Indicizzati',
    dividend_policy: 'ad accumulazione',
    data_source: 'borsaitaliana',
  },
};

/**
 * Riservato a `US-019__grafico-portafoglio.spec.ts` (scenario dimostrativo): il
 * primo dei due titoli del grafico del valore di portafoglio (`docs/mockups/US-019`).
 *
 * Il mockup descrive questo titolo con l'ISIN `IE00B4L5Y983` — ma quella chiave è
 * già di `TITOLO_US_025`, e la regola un-ISIN-per-file vieta di condividerla. Qui
 * l'anagrafica del mockup (Ishares Core MSCI World) resta, l'ISIN cambia.
 *
 * `price` coincide con la rilevazione più recente che lo scenario semina — il
 * 10.VIII.2026 a € 128,4600 del mockup — per la stessa ragione già registrata su
 * US-009, US-036, US-038, US-039 e US-045: divergere fra il cartellino e l'ultimo
 * punto del grafico non farebbe fallire nulla, ma mostrerebbe un dato falso.
 *
 * Il seme porta `fetched_at` di **adesso** (il default di `seminaTitolo`): il
 * criterio 3 dello scenario promette un solo giro di richieste verso il server, e
 * una riga di cache non fresca farebbe scattare la guardia di buona cittadinanza
 * verso Borsa Italiana e poi il browser headless su MorningStar — 8-12 secondi non
 * deterministici, oltre il budget del test.
 */
export const TITOLO_US_019: TitoloSeminabile = {
  isin: 'IE00BFY0GU03',
  file: 'US-019__grafico-portafoglio.spec.ts',
  campi: {
    name: 'Ishares Core Msci World Ucits Etf Acc',
    price: 128.46,
    ticker: 'SWDA',
    instrument_type: 'ETF',
    total_annual_fees: '0,20%',
    currency: 'USD',
    issuer: 'ISHARES III PLC',
    segment: 'ETF Indicizzati',
  },
};

/**
 * Riservato a `US-019__grafico-portafoglio.spec.ts`: il **secondo** titolo dello
 * scenario dimostrativo, quello con le date di rilevazione che non coincidono con
 * il primo — la condizione normale dello storico rado di ADR-008 che il mockup
 * mette in scena.
 *
 * Stessa ragione di `TITOLO_US_019` per la scelta dell'ISIN: il mockup usa
 * `IE00BK5BQT80`, già di `TITOLO_US_030`.
 *
 * `price` coincide con l'unica rilevazione che lo scenario semina per questo
 * titolo — il 3.VI.2026 a € 74,5000 del mockup — ed è anche la cifra che
 * definisce il punto dimostrativo (€ 16.636,00 a copertura piena).
 */
export const TITOLO_US_019_SECONDO: TitoloSeminabile = {
  isin: 'IE00BFY0GU11',
  file: 'US-019__grafico-portafoglio.spec.ts',
  campi: {
    name: 'Vanguard Ftse All-World Ucits Etf Usd Acc',
    price: 74.5,
    ticker: 'VWCE',
    instrument_type: 'ETF ARMONIZZATI',
    total_annual_fees: '0,22%',
    currency: 'EUR',
    issuer: 'VANGUARD FUNDS PLC',
    segment: 'ETF Indicizzati',
    dividend_policy: 'ad accumulazione',
    data_source: 'borsaitaliana',
  },
};

/**
 * Riservato a `US-019__grafico-portafoglio-varianti.spec.ts`: il titolo che regge
 * gli scenari a copertura non piena — conto con carichi e nessuna rilevazione,
 * verifica del giro unico di richieste, vendita totale a metà storico
 * (`docs/mockups/US-019/copertura-parziale.html` e le varianti che quella pagina
 * non mostra).
 *
 * Una sola chiave basta: gli scenari girano in serie dentro il file
 * (`fullyParallel: false`, come già `TITOLO_US_030_VARIANTI` e
 * `TITOLO_US_036_VARIANTI`), e ciascuno si costruisce la propria premessa con
 * `seminaOsservazioni`, che *sostituisce* lo storico — la pila di undo resta
 * consistente.
 *
 * `price` è la cifra che il cartellino del titolo mostra e va tenuta coerente con
 * la rilevazione più recente che lo scenario in corso semina, per la stessa
 * ragione registrata su `TITOLO_US_019`.
 *
 * Il seme porta `fetched_at` di **adesso** (il default di `seminaTitolo`): stessa
 * guardia di buona cittadinanza già documentata su `TITOLO_US_019`, e qui in più
 * la premessa esatta dello scenario «un solo giro di richieste».
 */
export const TITOLO_US_019_VARIANTI: TitoloSeminabile = {
  isin: 'IE00BFY0GT06',
  file: 'US-019__grafico-portafoglio-varianti.spec.ts',
  campi: {
    name: 'Amundi Prime Global Ucits Etf Acc',
    price: 71.4,
    ticker: 'PRAW',
    instrument_type: 'ETF ARMONIZZATI',
    total_annual_fees: '0,05%',
    currency: 'EUR',
    issuer: 'AMUNDI INDEX SOLUTIONS',
    segment: 'ETF Indicizzati',
    dividend_policy: 'ad accumulazione',
    data_source: 'borsaitaliana',
  },
};

/**
 * Riservato a `US-019__grafico-portafoglio-varianti.spec.ts`: l'ISIN che quel
 * file *rimuove* dalla cache per il caso (a) di
 * `docs/mockups/US-019/copertura-parziale.html` — un titolo **detenuto e mai
 * rilevato**, che tiene l'intera finestra a copertura parziale.
 *
 * Rimuovere e ripristinare è la stessa pila di undo del seeding (stessa nota di
 * `ISIN_MAI_RILEVATO_US_034` e `ISIN_SENZA_ANAGRAFICA_US_018`), quindi vale
 * comunque la riserva per file. Non entra in `ISIN_CON_OSSERVAZIONI_E2E`: non
 * viene mai seminato in `securities`, quindi non c'è alcuna riga da cui il
 * backfill d'avvio possa generare un'osservazione.
 */
export const ISIN_MAI_RILEVATO_US_019: ChiaveRiservata = {
  isin: 'LU1955812646',
  file: 'US-019__grafico-portafoglio-varianti.spec.ts',
};

/**
 * Gli ISIN su cui la suite semina osservazioni di prezzo (US-009, US-036, US-037,
 * US-038, US-039).
 *
 * Serve alla bonifica di `globalSetup`, che è la rete sotto il run ucciso con
 * SIGKILL: senza teardown, lo storico seminato resterebbe in archivio e il run
 * successivo troverebbe righe in più dove asserisce un conteggio esatto.
 *
 * L'elenco è esplicito e non euristico, per la stessa ragione per cui la
 * bonifica dei portafogli riconosce solo il marcatore di `nomeUnico`: qui si
 * cancellano righe vere dall'archivio di sviluppo, e l'unico errore che non ci si
 * può permettere è cancellare un'osservazione dell'utente.
 */
export const ISIN_CON_OSSERVAZIONI_E2E: readonly string[] = [
  TITOLO_US_009.isin,
  TITOLO_US_009_VARIANTI.isin,
  TITOLO_US_036.isin,
  TITOLO_US_036_VARIANTI.isin,
  TITOLO_US_037.isin,
  TITOLO_US_037_VARIANTI.isin,
  // Il secondo titolo di US-037 non viene seminato di osservazioni da alcuno
  // scenario, ma resta in elenco: il backfill d'avvio (US-009) ne creerebbe una
  // dalla riga di cache lasciata da un run precedente, e la bonifica deve poterla
  // togliere.
  TITOLO_US_037_SECONDO.isin,
  TITOLO_US_038.isin,
  TITOLO_US_038_VARIANTI.isin,
  TITOLO_US_039.isin,
  TITOLO_US_039_VARIANTI.isin,
  // Stessa ragione del secondo titolo di US-037: nessuno scenario vi semina
  // osservazioni, ma il backfill d'avvio ne creerebbe una dalla riga di cache
  // lasciata da un run precedente, e la bonifica deve poterla togliere.
  TITOLO_US_039_SECONDO.isin,
  // I due titoli di US-042: come sopra, nessuno scenario vi semina osservazioni,
  // ma il seme in cache basta al backfill d'avvio per crearne una.
  TITOLO_US_042.isin,
  TITOLO_US_042_RIFIUTI.isin,
  // Stessa ragione: il seme in cache di TITOLO_US_043 e di
  // TITOLO_US_043_VENDUTO_INTERO basta al backfill d'avvio per crearne una.
  // TITOLO_US_043_SENZA_PREZZO non entra: non viene mai seminato in
  // `securities`, quindi non c'è alcuna riga da cui il backfill possa
  // generare un'osservazione.
  TITOLO_US_043.isin,
  TITOLO_US_043_VENDUTO_INTERO.isin,
  // Stessa ragione per i quattro titoli di US-044: il seme in cache basta al
  // backfill d'avvio per crearne un'osservazione.
  TITOLO_US_044.isin,
  TITOLO_US_044_POSSEDUTO.isin,
  TITOLO_US_044_VARIANTI.isin,
  TITOLO_US_044_VARIANTI_SECONDO.isin,
  // TITOLO_US_045: le tre rilevazioni che il file semina esplicitamente.
  TITOLO_US_045.isin,
  // TITOLO_US_045_VARIANTI: le rilevazioni che ciascuno dei due scenari
  // semina esplicitamente, sostituendosi l'uno con l'altro fra un test e il
  // successivo dello stesso file.
  TITOLO_US_045_VARIANTI.isin,
  // I due titoli di US-019 e quello delle sue varianti: il seme in cache
  // basta al backfill d'avvio per crearne un'osservazione.
  TITOLO_US_019.isin,
  TITOLO_US_019_SECONDO.isin,
  TITOLO_US_019_VARIANTI.isin,
];
