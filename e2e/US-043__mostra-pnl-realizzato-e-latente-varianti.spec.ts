/**
 * US-043: mostrare il P&L realizzato congelato accanto al P&L latente — casi
 * limite, senza video.
 *
 * File sorello del demo `US-043__mostra-pnl-realizzato-e-latente.spec.ts`, per
 * la stessa ragione della coppia `US-026__*`: `launchOptions.slowMo` non si può
 * scoppiare a un solo `describe` (forza un nuovo worker), quindi il file che
 * registra il video resta unico e gli scenari che non lo richiedono vivono qui,
 * con la configurazione di default (`video: 'off'`).
 *
 * Due premesse, riprese da `docs/mockups/US-043/casi-limite.html`:
 *
 * - **caso II — venduto per intero.** Il residuo è zero, e il P&L latente deve
 *   valere € 0,00 — zero *misurato*, non «dato non disponibile» — anche perché
 *   qui il prezzo corrente resta in cache (a differenza del mockup, dove è
 *   assente): il criterio 3 vale a prescindere dal prezzo, ed è proprio questo
 *   che lo scenario deve isolare;
 * - **caso III — prezzo mancante su una posizione ancora detenuta.** Il quadro
 *   deve dichiararsi parziale — totale e percentuale — senza inventare un
 *   rapporto fra un numeratore parziale e una base intera (ADR-003).
 *
 * Titoli seminati: TITOLO_US_043_VENDUTO_INTERO e TITOLO_US_043_SENZA_PREZZO,
 * riservati a questo file (regola un-ISIN-per-file in e2e/support/titoli.ts).
 * Il secondo non viene mai seminato in `securities`: è il cache-miss garantito
 * che il caso III richiede.
 */
import { test, expect } from './support/fixtures.js';
import { registraVendita } from './support/api.js';
import { TITOLO_US_043_SENZA_PREZZO, TITOLO_US_043_VENDUTO_INTERO } from './support/titoli.js';

const ISIN_VENDUTO = TITOLO_US_043_VENDUTO_INTERO.isin;
const ISIN_SENZA_PREZZO = TITOLO_US_043_SENZA_PREZZO.isin;
const GIORNO_IN_MS = 24 * 60 * 60 * 1000;

/** La data civile di `giorni` fa, in `YYYY-MM-DD` UTC — stessa ragione del file demo. */
function dataCivileIndietro(giorni: number): string {
  const d = new Date(Date.now() - giorni * GIORNO_IN_MS);
  const mese = String(d.getUTCMonth() + 1).padStart(2, '0');
  const giorno = String(d.getUTCDate()).padStart(2, '0');
  return `${d.getUTCFullYear()}-${mese}-${giorno}`;
}

/** Cifra con due decimali all'italiana, es. "1.620,00" — come la scrive il quadro. */
function importo(valore: number): string {
  return valore.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

test('venduto per intero: il P&L latente è € 0,00 misurato, e il realizzato coincide col totale', async ({
  page,
  archivio,
}) => {
  archivio.seminaTitolo(ISIN_VENDUTO, TITOLO_US_043_VENDUTO_INTERO.campi);
  const portafoglio = await archivio.creaPortafoglio('US043-Venduto-Intero');

  // Due carichi a prezzi diversi (altrimenti LIFO e FIFO coinciderebbero) e
  // due scarichi che esauriscono l'intero residuo.
  await archivio.aggiungiPosizione(portafoglio.id, ISIN_VENDUTO, dataCivileIndietro(1200), 9.8, 600);
  await archivio.aggiungiPosizione(portafoglio.id, ISIN_VENDUTO, dataCivileIndietro(500), 11.5, 400);
  await registraVendita(portafoglio.id, ISIN_VENDUTO, dataCivileIndietro(60), 12.5, 400);
  await registraVendita(portafoglio.id, ISIN_VENDUTO, dataCivileIndietro(10), 12.9, 600);

  // Realizzato: (5.000,00 − 4.600,00) + (7.740,00 − 5.880,00) = 400,00 + 1.860,00 = 2.260,00.
  const REALIZZATO_TOTALE = 12.5 * 400 - 11.5 * 400 + (12.9 * 600 - 9.8 * 600);

  await page.goto(`/portfolio/${portafoglio.id}`);

  const quadro = page.getByTestId('quadro-risultato');
  await expect(quadro).toBeVisible({ timeout: 8000 });

  const latente = page.getByTestId('pnl-latente');
  const realizzato = page.getByTestId('pnl-realizzato');
  const totale = page.getByTestId('pnl-totale');

  // Zero misurato: la cifra c'è, vale zero, e porta la classe che lo dichiara
  // (non un trattino, non la classe `dato-mancante`).
  await expect(latente).toContainText('0,00');
  await expect(latente.locator('.cifra-pl')).toHaveClass(/zero-misurato/);
  await expect(latente).toContainText('nessuna quota residua');

  // Il realizzato porta per intero il risultato delle due vendite, e il
  // totale coincide con esso perché il latente è zero.
  await expect(realizzato).toContainText(importo(REALIZZATO_TOTALE));
  await expect(totale).toContainText(importo(REALIZZATO_TOTALE));

  // Criterio 6, verificato anche qui: l'incasso non è liquidità di portafoglio.
  await expect(page.getByTestId('pnl-postilla-liquidita')).toContainText('non');
});

test('un titolo senza prezzo corrente rende il totale e la percentuale parziali, non un rapporto inventato', async ({
  page,
  archivio,
}) => {
  // ISIN1 in cache con prezzo, ISIN2 mai seminato: cache-miss garantito.
  archivio.seminaTitolo(ISIN_VENDUTO, TITOLO_US_043_VENDUTO_INTERO.campi);
  const portafoglio = await archivio.creaPortafoglio('US043-Prezzo-Mancante');

  await archivio.aggiungiPosizione(portafoglio.id, ISIN_VENDUTO, dataCivileIndietro(400), 9.8, 600);
  await archivio.aggiungiPosizione(portafoglio.id, ISIN_SENZA_PREZZO, dataCivileIndietro(300), 6.2, 500);

  await page.goto(`/portfolio/${portafoglio.id}`);

  const quadro = page.getByTestId('quadro-risultato');
  await expect(quadro).toBeVisible({ timeout: 8000 });
  await expect(quadro).toHaveClass(/parziale/);

  const latente = page.getByTestId('pnl-latente');
  const totale = page.getByTestId('pnl-totale');
  const percentuale = page.getByTestId('pnl-percentuale');

  // Il latente dichiara sé stesso parziale e nomina quante posizioni esclude.
  await expect(latente).toContainText('parziale');
  await expect(latente).toContainText('1 posizione');

  // Il totale eredita la parzialità, e la percentuale non inventa un rapporto:
  // «–», non una cifra calcolata su una base incompleta (ADR-003).
  await expect(totale).toContainText('parziale');
  await expect(percentuale).toHaveText('–');
  await expect(percentuale).toHaveClass(/assente/);

  // Nessuna posizione senza carico entra nel calcolo per sbaglio: il titolo
  // valorizzato resta comunque leggibile nella tabella di riepilogo.
  await expect(page.getByTestId(`riepilogo-${ISIN_VENDUTO}`)).toBeVisible();
  await expect(page.getByTestId(`riepilogo-${ISIN_SENZA_PREZZO}`)).toBeVisible();
});
