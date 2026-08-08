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
