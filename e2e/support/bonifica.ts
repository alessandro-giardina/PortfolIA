/**
 * `globalSetup` della suite: rimuove i portafogli residui prima che i test partano.
 *
 * La fixture `archivio` copre il caso normale — teardown eseguito anche su timeout
 * o asserzione fallita. Resta scoperto un caso: il run ucciso con SIGKILL, quando
 * nemmeno il teardown può girare. Questa bonifica è la rete sotto quel caso.
 *
 * Riconosce solo i nomi generati da `nomeUnico`, quindi non tocca i residui
 * anteriori a US-029: quelli sono già stati rimossi una volta per tutte dalla
 * prima esecuzione della suite, e le euristiche che servivano a trovarli sono
 * state tolte perché il loro raggio d'azione era pericolosamente ampio (vedi sotto).
 *
 * La rimozione passa dall'API, non da SQL diretto: la cancellazione a cascata delle
 * posizioni è dichiarata come vincolo di schema, e `PRAGMA foreign_keys` non è
 * attivo di default su una connessione SQLite esterna. Cancellare le righe a mano
 * lascerebbe posizioni orfane.
 *
 * La bonifica non fa mai fallire il run: se il server non risponde, avvisa e cede
 * il passo ai test, che falliranno da soli con un messaggio più utile.
 */
import { BASE_API, elencaPortafogli, eliminaPortafoglio, type Portafoglio } from './api.js';
import { MARCATORE_E2E } from './nomi.js';

/**
 * Un portafoglio è residuo della suite se porta il marcatore di `nomeUnico`.
 *
 * Il criterio è deliberatamente stretto. Questa funzione cancella righe vere
 * dall'archivio di sviluppo, in silenzio e a cascata sulle posizioni: l'unico
 * errore che non ci si può permettere è cancellare il portafoglio di una persona.
 * Riconoscere per euristica i residui anteriori a US-029 — un nome contenente
 * `Date.now()`, o il nome fisso "Conto Unico" — è stato utile una volta sola, per
 * la bonifica iniziale dei 57 residui storici, ed è ormai a valore zero: ogni nome
 * generato da qui in avanti porta il marcatore. Restava però il rischio permanente
 * di far sparire un "Conto Unico" scritto da un utente, o un nome con un IBAN
 * dentro. Quelle regole sono state tolte a bonifica avvenuta.
 */
export function eResiduoDiTest(portafoglio: Portafoglio): boolean {
  return MARCATORE_E2E.test(portafoglio.name);
}

/** Attende che il server risponda su /health, entro `tentativi` secondi. */
async function attendiServer(tentativi = 20): Promise<boolean> {
  for (let i = 0; i < tentativi; i += 1) {
    try {
      const res = await fetch(`${BASE_API}/health`);
      if (res.ok) return true;
    } catch {
      /* non ancora pronto */
    }
    await new Promise((risolvi) => setTimeout(risolvi, 500));
  }
  return false;
}

export default async function bonifica(): Promise<void> {
  if (!(await attendiServer())) {
    console.warn(`[e2e] bonifica saltata: ${BASE_API} non raggiungibile.`);
    return;
  }

  try {
    const residui = (await elencaPortafogli()).filter(eResiduoDiTest);
    if (residui.length === 0) return;

    for (const portafoglio of residui) {
      await eliminaPortafoglio(portafoglio.id);
    }
    console.log(`[e2e] bonifica: rimossi ${residui.length} portafogli residui.`);
  } catch (causa) {
    console.warn(`[e2e] bonifica non completata: ${String(causa)}`);
  }
}
