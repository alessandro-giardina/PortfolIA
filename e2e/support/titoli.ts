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
 * **Un ISIN per file spec, mai condiviso.** Playwright esegue i file in parallelo
 * su worker distinti (`fullyParallel: false` serializza solo dentro un file), e
 * seminare-e-ripristinare è per sua natura uno stack di undo: se due file si
 * sovrappongono sulla stessa chiave, l'ultimo a ripristinare torna allo stato
 * intermedio lasciato dall'altro, non a quello iniziale. Nessun ripristino
 * condizionato può rimediare, perché l'informazione su quale fosse lo stato
 * originale è già andata persa. Assegnare a ogni file il proprio ISIN elimina il
 * problema per costruzione — la stessa logica dei nomi univoci in `nomi.ts`.
 *
 * La regola vincola chi *scrive*, non chi legge. `IE00B4L5Y983` resta letto anche
 * da US-011, US-012, US-013, US-017 e `US-026__apre-scheda-riepilogo`, che vi
 * iscrivono posizioni: la vista di riepilogo ne rileva il prezzo con una LEFT JOIN.
 * Oggi è innocuo perché i campi qui sotto coincidono con la riga già in archivio e
 * nessuna di quelle asserzioni guarda il valore corrente. Cambiare `price` in
 * questo file, però, cambierebbe ciò che quei test vedono: se un giorno servisse un
 * prezzo diverso, si assegni a US-025 un ISIN che nessun altro usa.
 *
 * Gli altri scenari che passano dalla pagina di ricerca — US-007, US-008,
 * `demo__recupera-anagrafica-isin`, `fallback-morningstar` — non hanno bisogno di
 * queste costanti perché intercettano `**\/api\/securities\/**` con `route.fulfill()`
 * e non arrivano mai al server. Da qui una conseguenza da conoscere: nessun test
 * della suite esercita più il recupero dalla fonte reale. La copertura di quel
 * percorso vive nei test unitari degli adapter (`server/tests/`) e nello smoke
 * test manuale `server/scripts/morningstar-smoke.ts`.
 */
import type { CampiTitolo } from './archivio.js';

/** Titolo con la sua anagrafica: quanto basta per seminarlo e poi cercarlo. */
export interface TitoloSeminabile {
  isin: string;
  campi: CampiTitolo;
}

/** Riservato a `US-025__aggiungi-titolo-a-portafoglio.spec.ts`. */
export const TITOLO_US_025: TitoloSeminabile = {
  isin: 'IE00B4L5Y983',
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
export const ISIN_SENZA_ANAGRAFICA_US_018 = 'LU0908500753';

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
export const ISIN_SENZA_PREZZO_US_032 = 'LU1650487413';

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
export const ISIN_MAI_RILEVATO_US_034 = 'LU1437016972';

/** Riservato a `US-026__schede-portafoglio.spec.ts`. */
export const TITOLO_US_026: TitoloSeminabile = {
  isin: 'IE00BMVB5R75',
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
export const ISIN_GUARDIA_US_035 = 'IE00B52VJ196';

/**
 * Riservato a `US-009__storico-prezzi.spec.ts` (il file demo).
 *
 * È il titolo di cui lo scenario dimostrativo semina due rilevazioni, in giorni
 * e a prezzi diversi. `price` coincide con l'osservazione più recente seminata
 * dalla spec: la scheda dichiara *quel* prezzo come attuale, e una divergenza
 * fra la cifra in cima allo storico e quella del cartellino sarebbe, per chi
 * guarda, un dato falso.
 */
export const TITOLO_US_009: TitoloSeminabile = {
  isin: 'IE00BFY0GT14',
  campi: {
    name: 'Spdr Msci World Ucits Etf',
    price: 128.46,
    ticker: 'SWRD',
    instrument_type: 'ETF ARMONIZZATI',
    total_annual_fees: '0,12%',
    currency: 'EUR',
    issuer: 'SPDR ETFS EUROPE I PLC',
    segment: 'ETF Indicizzati',
    dividend_policy: 'ad accumulazione',
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
 */
export const TITOLO_US_009_VARIANTI: TitoloSeminabile = {
  isin: 'IE00B3XXRP09',
  campi: {
    name: 'Vanguard S&P 500 Ucits Etf',
    price: 104.2,
    ticker: 'VUSA',
    instrument_type: 'ETF ARMONIZZATI',
    total_annual_fees: '0,07%',
    currency: 'EUR',
    issuer: 'VANGUARD FUNDS PLC',
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
];
