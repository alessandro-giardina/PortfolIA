/**
 * US-043: mostrare il P&L realizzato congelato accanto al P&L latente —
 * scenario dimostrativo.
 *
 * Il flusso che la spec promette (vedi `Dimostra` in `.archetipo/specs/US-043.yaml`):
 * dopo una vendita di 400 quote a € 12,5000 su un costo attribuito LIFO, il
 * riepilogo mostra il P&L realizzato dell'operazione, il P&L latente calcolato
 * sulle sole 600 quote residue e il totale come somma dei due; registrando una
 * nuova rilevazione di prezzo il latente cambia e il realizzato resta
 * identico al centesimo.
 *
 * Lo scenario riprende deliberatamente quello di `US-042__registra-vendita-lifo`
 * e dei mockup `docs/mockups/US-043/`: due carichi a prezzi diversi (altrimenti
 * LIFO e FIFO attribuirebbero lo stesso costo), venduti a un prezzo diverso da
 * entrambi (altrimenti il realizzato non si distinguerebbe da un ricalcolo).
 * La vendita è registrata via API e non dal modulo di scarico: quel flusso è
 * già il soggetto del video di US-042, e ripeterlo qui distrarrebbe dal vero
 * oggetto di questa spec — il quadro del risultato.
 *
 * Il secondo atto — «Aggiorna dati» dalla scheda titolo — riusa la stessa
 * tecnica di `US-030__aggiorna-dati-titolo`: la riga d'archivio è ri-seminata
 * come farebbe il server dopo un recupero riuscito, e la sola risposta finta è
 * quella del lookup (`route.fulfill({ times: 1 })`), così l'aggiornamento non
 * contatta la rete reale ma il dettaglio che la scheda rilegge viene comunque
 * dal server.
 *
 * Titolo seminato: TITOLO_US_043, riservato a questo file (regola
 * un-ISIN-per-file in e2e/support/titoli.ts). Il seme porta `fetched_at` di
 * dieci giorni fa e non di adesso: è la premessa che permette al comando
 * «Aggiorna dati» di riuscire al primo colpo, senza che la guardia di buona
 * cittadinanza lo blocchi.
 */
import { test, expect } from './support/fixtures.js';
import { registraVendita } from './support/api.js';
import { TITOLO_US_043 } from './support/titoli.js';

test.use({
  // `video: 'on'` da solo scala la registrazione a 800×450: la dimensione va
  // dichiarata esplicitamente perché il video corrisponda al viewport.
  video: { mode: 'on', size: { width: 1280, height: 720 } },
  launchOptions: { slowMo: 300 },
  viewport: { width: 1280, height: 720 },
});

// `outputDir` non è un'opzione di test.use() (è solo project/config-level),
// quindi il video va salvato a mano. `saveAs` attende la fine della
// registrazione, che avviene alla chiusura della pagina: va chiamato dopo
// `page.close()`.
test.afterEach(async ({ page }) => {
  await page.close();
  await page.video()?.saveAs('docs/test-results/US-043/demo-pnl-realizzato-latente.webm');
});

const ISIN = TITOLO_US_043.isin;
const GIORNO_IN_MS = 24 * 60 * 60 * 1000;

/**
 * La data civile di `giorni` fa, in `YYYY-MM-DD` **UTC**.
 *
 * L'UTC e non i campi locali: `load_date` e `sale_date` sono date civili
 * confrontate fra loro come stringhe, e comporle dal fuso locale le farebbe
 * scivolare di un giorno a ogni offset negativo — proprio la premessa che lo
 * scenario deve costruire, non il codice sotto esame.
 */
function dataCivileIndietro(giorni: number): string {
  const d = new Date(Date.now() - giorni * GIORNO_IN_MS);
  const mese = String(d.getUTCMonth() + 1).padStart(2, '0');
  const giorno = String(d.getUTCDate()).padStart(2, '0');
  return `${d.getUTCFullYear()}-${mese}-${giorno}`;
}

/** I due carichi dello scenario: 600 quote a € 9,8000 (le più vecchie) e 400 a € 11,5000. */
const CARICHI = [
  { giorniFa: 1200, prezzo: 9.8, quantita: 600 },
  { giorniFa: 500, prezzo: 11.5, quantita: 400 },
];

/** Lo scarico: 400 quote a € 12,5000 — LIFO consuma per intero il carico più recente. */
const VENDITA = { giorniFa: 60, prezzo: 12.5, quantita: 400 };

/** Il prezzo corrente iniziale, uguale a quello di vendita: il mercato è "fermo". */
const PREZZO_INIZIALE = 12.5;
/** Il prezzo della nuova rilevazione, più alto: il latente deve muoversi verso l'alto. */
const PREZZO_NUOVO = 12.9;

const COSTO_ATTRIBUITO = CARICHI[1].prezzo * VENDITA.quantita; // 4.600,00
const RICAVO = VENDITA.prezzo * VENDITA.quantita; // 5.000,00
const REALIZZATO = RICAVO - COSTO_ATTRIBUITO; // + 400,00

const RESIDUO = CARICHI[0].quantita; // 600
const COSTO_RESIDUO = CARICHI[0].prezzo * RESIDUO; // 5.880,00
const COSTO_TOTALE_CARICHI = COSTO_ATTRIBUITO + COSTO_RESIDUO; // 10.480,00

const LATENTE_INIZIALE = PREZZO_INIZIALE * RESIDUO - COSTO_RESIDUO; // + 1.620,00
const TOTALE_INIZIALE = REALIZZATO + LATENTE_INIZIALE; // + 2.020,00
const PERCENTUALE_INIZIALE = (TOTALE_INIZIALE / COSTO_TOTALE_CARICHI) * 100; // +19,27 %

const LATENTE_NUOVO = PREZZO_NUOVO * RESIDUO - COSTO_RESIDUO; // + 1.860,00
const TOTALE_NUOVO = REALIZZATO + LATENTE_NUOVO; // + 2.260,00
const PERCENTUALE_NUOVA = (TOTALE_NUOVO / COSTO_TOTALE_CARICHI) * 100; // +21,56 %

/** Cifra con due decimali all'italiana, es. "1.620,00" — come la scrive il quadro. */
function importo(valore: number): string {
  return valore.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Percentuale a due decimali, senza segno: la sola parte che le asserzioni confrontano. */
function percentuale(valore: number): string {
  return importo(valore);
}

test('demo: il riepilogo separa il realizzato dal latente, e solo il latente si muove con una nuova rilevazione', async ({
  page,
  archivio,
}) => {
  // ─── Premessa: il titolo in cache, i due carichi, lo scarico già iscritto ──
  // `fetched_at` di dieci giorni fa: abbastanza lontano perché «Aggiorna dati»
  // riesca al primo colpo, come già in US-030__aggiorna-dati-titolo.
  const DIECI_GIORNI_FA = Math.floor(Date.now() / 1000) - 10 * 24 * 60 * 60;
  archivio.seminaTitolo(ISIN, { ...TITOLO_US_043.campi, price: PREZZO_INIZIALE, fetched_at: DIECI_GIORNI_FA });

  const portafoglio = await archivio.creaPortafoglio('US043-Quadro-Risultato');

  for (const carico of CARICHI) {
    await archivio.aggiungiPosizione(
      portafoglio.id,
      ISIN,
      dataCivileIndietro(carico.giorniFa),
      carico.prezzo,
      carico.quantita,
    );
  }

  // La vendita è registrata via API: il modulo di scarico è già il soggetto
  // del video di US-042, e ripeterlo qui distrarrebbe dal vero oggetto di
  // questa spec — il quadro del risultato che appare nel riepilogo.
  await registraVendita(
    portafoglio.id,
    ISIN,
    dataCivileIndietro(VENDITA.giorniFa),
    VENDITA.prezzo,
    VENDITA.quantita,
  );

  // ─── 1. Il riepilogo mostra le tre cifre ───────────────────────────────────
  await page.goto(`/portfolio/${portafoglio.id}`);

  const quadro = page.getByTestId('quadro-risultato');
  await expect(quadro).toBeVisible({ timeout: 8000 });
  await quadro.scrollIntoViewIfNeeded();

  const realizzato = page.getByTestId('pnl-realizzato');
  const latente = page.getByTestId('pnl-latente');
  const totale = page.getByTestId('pnl-totale');
  const percentualeTag = page.getByTestId('pnl-percentuale');
  const postilla = page.getByTestId('pnl-postilla-liquidita');

  await expect(realizzato).toContainText(importo(REALIZZATO));
  await expect(realizzato).toContainText('guadagno incassato');
  await expect(latente).toContainText(importo(LATENTE_INIZIALE));
  await expect(totale).toContainText(importo(TOTALE_INIZIALE));
  await expect(percentualeTag).toContainText(percentuale(PERCENTUALE_INIZIALE));

  // Il testo del realizzato afferma esplicitamente che nessuna rilevazione
  // successiva lo toccherà: è la promessa che la seconda metà del test verifica.
  await expect(realizzato).toContainText('nessuna');

  // Criterio 6: l'incasso della vendita non è trattenuto come liquidità.
  await expect(postilla).toBeVisible();
  await expect(postilla).toContainText('non');
  await expect(postilla).toContainText('trattenuto');

  // La cifra esatta del realizzato, per il confronto "identico al centesimo"
  // dopo la nuova rilevazione.
  const realizzatoIniziale = await realizzato.textContent();

  await page.waitForTimeout(1200);

  // ─── 2. Dal riepilogo alla scheda del titolo ───────────────────────────────
  const riga = page.getByTestId(`riepilogo-${ISIN}`);
  await expect(riga).toBeVisible();
  await riga.click();

  const scheda = page.getByTestId('scheda-titolo');
  await expect(scheda).toBeVisible({ timeout: 8000 });

  const comando = page.getByTestId('btn-aggiorna-dati');
  await expect(comando).toBeVisible();

  // ─── 3. L'utente provoca una nuova rilevazione di prezzo ───────────────────
  // La riga d'archivio è riscritta come farebbe il server dopo un recupero
  // riuscito; la sola risposta finta è quella del lookup, e vale una volta —
  // stessa tecnica di US-030__aggiorna-dati-titolo.
  const istanteAggiornamento = Math.floor(Date.now() / 1000);
  archivio.seminaTitolo(ISIN, {
    ...TITOLO_US_043.campi,
    price: PREZZO_NUOVO,
    fetched_at: istanteAggiornamento,
  });

  await page.route(
    '**/api/securities/**',
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          security: {
            isin: ISIN,
            name: TITOLO_US_043.campi.name,
            price: PREZZO_NUOVO,
            ticker: TITOLO_US_043.campi.ticker,
            instrumentType: TITOLO_US_043.campi.instrument_type,
            totalAnnualFees: TITOLO_US_043.campi.total_annual_fees,
            currency: TITOLO_US_043.campi.currency,
            issuer: TITOLO_US_043.campi.issuer,
            segment: TITOLO_US_043.campi.segment,
            dividendPolicy: TITOLO_US_043.campi.dividend_policy,
          },
          fromCache: false,
          lastFetchedAt: istanteAggiornamento,
          dataSource: 'borsaitaliana',
        }),
      });
    },
    { times: 1 },
  );

  await comando.click();
  await expect(page.getByTestId('esito-aggiornamento')).toBeVisible({ timeout: 8000 });

  await page.waitForTimeout(1200);

  // ─── 4. Tornati al riepilogo: il latente e il totale sono cambiati ────────
  await page.getByTestId('btn-torna-riepilogo').click();

  await expect(quadro).toBeVisible({ timeout: 8000 });
  await quadro.scrollIntoViewIfNeeded();

  await expect(latente).toContainText(importo(LATENTE_NUOVO));
  await expect(totale).toContainText(importo(TOTALE_NUOVO));
  await expect(percentualeTag).toContainText(percentuale(PERCENTUALE_NUOVA));

  // Il realizzato non ha smesso di valere ciò che valeva: identico al
  // centesimo, non solo "vicino" — nessuna rilevazione lo tocca.
  await expect(realizzato).toContainText(importo(REALIZZATO));
  expect(await realizzato.textContent()).toBe(realizzatoIniziale);

  // Pausa finale: il quadro con le cifre aggiornate resta nel fotogramma
  // registrato, invece di essere spazzato via dal teardown un istante dopo.
  await page.waitForTimeout(1500);
});
