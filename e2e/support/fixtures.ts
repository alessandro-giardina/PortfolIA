/**
 * `test` esteso con la fixture `archivio`: il punto centrale di US-029.
 *
 * Perché una fixture e non un `try/finally`. Playwright esegue il teardown di una
 * fixture anche quando il test va in timeout, quando un'asserzione esplode o
 * quando il worker viene riavviato. Un blocco `finally`, in quei casi, non viene
 * mai raggiunto — ed è esattamente così che l'archivio di sviluppo ha accumulato
 * 57 portafogli residui prima di questa spec.
 *
 * La fixture registra ciò che il test crea o altera e lo smonta in coda:
 *  - i portafogli creati via API, per id;
 *  - i portafogli creati *dalla UI*, per nome — perché il test non ne conosce l'id;
 *  - lo stato precedente degli ISIN seminati o rimossi in cache, per ripristinarlo.
 */
import { test as base, expect } from '@playwright/test';
import {
  aggiungiPosizione,
  creaPortafoglio,
  elencaPortafogli,
  eliminaPortafoglio,
  type Portafoglio,
} from './api.js';
import {
  leggiOsservazioni,
  leggiTitolo,
  rimuoviOsservazioni,
  rimuoviTitolo,
  ripristinaOsservazioni,
  ripristinaTitoli,
  seminaOsservazioni,
  seminaTitolo,
  type CampiTitolo,
  type IstantaneaOsservazioni,
  type IstantaneaTitolo,
  type OsservazioneSeminabile,
  type RigaOsservazione,
  type RigaTitolo,
} from './archivio.js';
import { nomeUnico } from './nomi.js';

/** Superficie della fixture `archivio` esposta ai test. */
export interface GestoreArchivio {
  /**
   * Nome univoco per questa esecuzione, già registrato per la pulizia: usalo
   * quando è la UI a creare il portafoglio e il test non ne conosce l'id.
   */
  nomeUnico(prefisso: string): string;

  /** Crea un portafoglio via API con nome univoco e lo registra per la pulizia. */
  creaPortafoglio(prefisso: string): Promise<Portafoglio>;

  /** Registra un portafoglio creato altrove, perché venga rimosso in teardown. */
  adotta(portafoglio: Portafoglio | number): void;

  /**
   * Aggiunge un carico al portafoglio indicato e restituisce l'id della posizione.
   *
   * Non registra nulla per il teardown, ed è corretto così: le posizioni spariscono
   * in cascata con il portafoglio che le contiene. Vale però solo per i portafogli
   * che la fixture possiede — un carico aggiunto a un portafoglio non registrato
   * resterebbe in archivio.
   */
  aggiungiPosizione(
    portafoglioId: number,
    isin: string,
    dataCarico: string,
    prezzoCarico: number,
    quantita: number,
  ): Promise<number>;

  /** Semina un ISIN in cache con i campi indicati; lo stato precedente è ripristinato. */
  seminaTitolo(isin: string, campi: CampiTitolo): void;

  /** Rimuove un ISIN dalla cache; lo stato precedente è ripristinato. */
  rimuoviTitolo(isin: string): void;

  /**
   * Legge la riga in cache di un ISIN, o `undefined` se assente.
   *
   * È di sola lettura e non registra nulla per il teardown: serve ad asserire
   * che l'archivio sia rimasto com'era, non a modificarlo.
   */
  leggiTitolo(isin: string): RigaTitolo | undefined;

  /**
   * Semina lo storico osservato di un ISIN (US-009), sostituendo quanto risulta
   * ora; lo stato precedente è ripristinato in teardown.
   *
   * Seminare è l'unico modo corretto di mettere alla prova lo storico:
   * intercettare la rotta di dettaglio con `route.fulfill()` proverebbe solo che
   * il client sa disegnare una tabella, non che il server registra e ordina le
   * rilevazioni.
   */
  seminaOsservazioni(isin: string, osservazioni: OsservazioneSeminabile[]): void;

  /** Svuota lo storico di un ISIN; lo stato precedente è ripristinato. */
  rimuoviOsservazioni(isin: string): void;

  /**
   * Legge lo storico di un ISIN, dal più recente al più antico.
   *
   * Di sola lettura e senza registrazione per il teardown: serve ad asserire che
   * il server abbia (o non abbia) registrato una rilevazione.
   */
  leggiOsservazioni(isin: string): RigaOsservazione[];
}

export const test = base.extend<{ archivio: GestoreArchivio }>({
  // Playwright ispeziona il testo della funzione e pretende che il primo parametro
  // sia un pattern di destrutturazione, anche quando la fixture non consuma nulla:
  // è così che deduce le dipendenze fra fixture. Da qui il `{}` vuoto.
  // eslint-disable-next-line no-empty-pattern
  archivio: async ({}, use) => {
    const idRegistrati: number[] = [];
    const nomiRegistrati: string[] = [];
    const istantanee: IstantaneaTitolo[] = [];
    const istantaneeOsservazioni: IstantaneaOsservazioni[] = [];

    /**
     * Registra l'esito di un'operazione sulla cache. Lo stato *precedente* resta
     * quello della prima operazione sull'ISIN — è lì che si deve tornare — mentre
     * lo stato *lasciato* è sempre quello dell'ultima, perché è quello che il
     * ripristino condizionato dovrà riconoscere in archivio.
     */
    const registraIstantanea = (nuova: IstantaneaTitolo): void => {
      const esistente = istantanee.find((i) => i.isin === nuova.isin);
      if (esistente === undefined) {
        istantanee.push(nuova);
      } else {
        esistente.lasciata = nuova.lasciata;
      }
    };

    /**
     * Registra l'esito di un'operazione sullo storico di un ISIN. Solo la
     * *prima* istantanea è conservata: è quella che porta lo stato originale, e
     * ogni operazione successiva sullo stesso ISIN parte già da uno stato
     * prodotto da questo test.
     */
    const registraIstantaneaOsservazioni = (nuova: IstantaneaOsservazioni): void => {
      if (!istantaneeOsservazioni.some((i) => i.isin === nuova.isin)) {
        istantaneeOsservazioni.push(nuova);
      }
    };

    /** Genera un nome univoco e lo registra per la pulizia per nome. */
    const prenotaNome = (prefisso: string): string => {
      const nome = nomeUnico(prefisso);
      nomiRegistrati.push(nome);
      return nome;
    };

    const gestore: GestoreArchivio = {
      nomeUnico: prenotaNome,
      async creaPortafoglio(prefisso) {
        const portafoglio = await creaPortafoglio(prenotaNome(prefisso));
        idRegistrati.push(portafoglio.id);
        return portafoglio;
      },
      adotta(portafoglio) {
        idRegistrati.push(typeof portafoglio === 'number' ? portafoglio : portafoglio.id);
      },
      aggiungiPosizione,
      seminaTitolo(isin, campi) {
        registraIstantanea(seminaTitolo(isin, campi));
      },
      rimuoviTitolo(isin) {
        registraIstantanea(rimuoviTitolo(isin));
      },
      leggiTitolo,
      seminaOsservazioni(isin, osservazioni) {
        registraIstantaneaOsservazioni(seminaOsservazioni(isin, osservazioni));
      },
      rimuoviOsservazioni(isin) {
        registraIstantaneaOsservazioni(rimuoviOsservazioni(isin));
      },
      leggiOsservazioni,
    };

    await use(gestore);

    // ─── Teardown — raggiunto anche su timeout o asserzione fallita ───────────
    // Ogni passo è isolato: il fallimento di una rimozione non deve impedire le
    // successive, né il ripristino della cache.
    for (const id of [...idRegistrati].reverse()) {
      try {
        await eliminaPortafoglio(id);
      } catch {
        /* già rimosso dal test, o server non raggiungibile: nulla da fare */
      }
    }

    // I portafogli nati dalla UI non hanno un id noto al test: si riconoscono dal
    // nome univoco prenotato. Il confronto è "contiene" e non "uguale" perché uno
    // scenario può averlo rinominato (US-006 aggiunge "-Rinominato").
    // Due passate, non una: se il test è morto in timeout *durante* la POST che
    // crea il portafoglio, la riga può non essere ancora committata quando la
    // prima passata interroga l'elenco — proprio nello scenario per cui la
    // fixture esiste. La seconda passata, poco dopo, la trova.
    if (nomiRegistrati.length > 0) {
      for (let passata = 0; passata < 2; passata += 1) {
        if (passata > 0) await new Promise((risolvi) => setTimeout(risolvi, 500));
        try {
          const rimasti = await elencaPortafogli();
          for (const portafoglio of rimasti) {
            if (nomiRegistrati.some((nome) => portafoglio.name.includes(nome))) {
              await eliminaPortafoglio(portafoglio.id);
            }
          }
        } catch {
          /* server non raggiungibile in teardown: la bonifica al run successivo rimedia */
        }
      }
    }

    try {
      ripristinaTitoli(istantanee);
    } catch {
      /* archivio bloccato: meglio un residuo in cache che un teardown che esplode */
    }

    try {
      ripristinaOsservazioni(istantaneeOsservazioni);
    } catch {
      /* come sopra: la bonifica al run successivo rimedia */
    }
  },
});

export { expect };
