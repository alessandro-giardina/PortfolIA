/**
 * US-026: Aprire il portafoglio sulla scheda Riepilogo — scenari funzionali.
 *
 * Senza video e senza rallentamento: lo scenario demo con video vive in
 * US-026__apre-scheda-riepilogo.spec.ts.
 *
 * - portafoglio vuoto → apre comunque su Riepilogo, con il rimando a "Carico titoli";
 * - passaggio manuale fra le due schede in entrambe le direzioni;
 * - regressione US-025 → dalla ricerca titoli si apre su "Carico titoli" pre-compilato.
 */
import { test, expect } from './support/fixtures.js';
import { leggiPortafoglio } from './support/api.js';
import { TITOLO_US_026 } from './support/titoli.js';

/** Linguetta della barra schede, per nome. */
function linguetta(page: import('@playwright/test').Page, nome: string) {
  return page.locator('nav.linguette a', { hasText: nome });
}

/** Riga cliccabile del portafoglio nell'elenco della schermata principale. */
function rigaPortafoglio(page: import('@playwright/test').Page, nome: string) {
  return page.locator('tr.cliccabile', { hasText: nome });
}

// ---------------------------------------------------------------------------
// Portafoglio vuoto
// ---------------------------------------------------------------------------

test('portafoglio vuoto: si apre su Riepilogo con il rimando alla scheda Carico titoli', async ({ page, archivio }) => {
  const { name: portfolioName } = await archivio.creaPortafoglio('Vuoto Apertura');

  await page.goto('/');
  await expect(rigaPortafoglio(page, portfolioName)).toBeVisible({ timeout: 8000 });

  await rigaPortafoglio(page, portfolioName).click();

  await expect(linguetta(page, 'Riepilogo')).toHaveClass(/attiva/, { timeout: 8000 });

  // Stato vuoto già previsto da US-017, con il rimando a "Carico titoli"
  const statoVuoto = page.getByTestId('riepilogo-vuoto');
  await expect(statoVuoto).toBeVisible({ timeout: 8000 });
  await expect(statoVuoto).toContainText('Carico titoli');

  // Nessuna tabella titoli per un portafoglio senza posizioni
  await expect(page.getByTestId('tabella-riepilogo')).not.toBeVisible();
});

// ---------------------------------------------------------------------------
// Passaggio manuale fra le schede
// ---------------------------------------------------------------------------

test('schede: il passaggio manuale Riepilogo ↔ Carico titoli funziona in entrambe le direzioni', async ({ page, archivio }) => {
  const { id: portfolioId, name: portfolioName } = await archivio.creaPortafoglio('Toggle Schede');

  await archivio.aggiungiPosizione(portfolioId, 'IE00B4L5Y983', '2026-03-15', 89.0, 40);

  await page.goto('/');
  await expect(rigaPortafoglio(page, portfolioName)).toBeVisible({ timeout: 8000 });
  await rigaPortafoglio(page, portfolioName).click();

  // Apertura su Riepilogo
  await expect(linguetta(page, 'Riepilogo')).toHaveClass(/attiva/, { timeout: 8000 });
  await expect(page.getByTestId('tabella-riepilogo')).toBeVisible({ timeout: 8000 });

  // Riepilogo → Carico titoli
  await linguetta(page, 'Carico titoli').click();
  await expect(linguetta(page, 'Carico titoli')).toHaveClass(/attiva/);
  await expect(linguetta(page, 'Riepilogo')).not.toHaveClass(/attiva/);
  await expect(page.getByTestId('input-isin')).toBeVisible();

  // Carico titoli → Riepilogo
  await linguetta(page, 'Riepilogo').click();
  await expect(linguetta(page, 'Riepilogo')).toHaveClass(/attiva/);
  await expect(linguetta(page, 'Carico titoli')).not.toHaveClass(/attiva/);
  await expect(page.getByTestId('tabella-riepilogo')).toBeVisible();
  await expect(page.getByTestId('input-isin')).not.toBeVisible();
});

// ---------------------------------------------------------------------------
// Regressione US-025
// ---------------------------------------------------------------------------

test('regressione US-025: dalla ricerca titoli si apre su Carico titoli con il modulo pre-compilato', async ({ page, archivio }) => {
  // Titolo in cache come recupero appena avvenuto: la ricerca risponde dall'archivio
  // senza contattare la fonte reale. Anche qui la ricerca è il tragitto, non la meta.
  // L'ISIN è diverso da quello di US-025: i due file girano su worker paralleli e
  // seminare la stessa chiave li farebbe calpestare a vicenda in ripristino.
  archivio.seminaTitolo(TITOLO_US_026.isin, TITOLO_US_026.campi);

  const { id: portfolioId } = await archivio.creaPortafoglio('Regressione Carico');

  // Il dialog di scelta portafoglio non gestisce elenchi lunghi: è centrato in un
  // overlay a tutto schermo senza scroll, quindi con molti portafogli in archivio
  // le opzioni in fondo escono dal viewport e non sono cliccabili. Qui interessa la
  // navigazione con lo stato di prefill, non il picker: riduciamo l'elenco mostrato
  // dal dialog al solo portafoglio di prova, con il suo record reale.
  const record = await leggiPortafoglio(portfolioId);
  await page.route('**/api/portfolios', (route) => {
    if (route.request().method() === 'GET') {
      void route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([record]),
      });
    } else {
      void route.continue();
    }
  });

  await page.goto('/ricerca');
  await page.fill('#isin', TITOLO_US_026.isin);
  await page.click('button[type="submit"]');

  await page.waitForSelector('[data-testid="btn-aggiungi-portafoglio"]', { timeout: 30000 });
  await page.click('[data-testid="btn-aggiungi-portafoglio"]');

  await page.waitForSelector('[role="dialog"]');
  await page.click(`[data-testid="portafoglio-option-${portfolioId}"]`);
  await page.click('[data-testid="btn-conferma-dialog"]');

  await page.waitForURL(`**/portfolio/${portfolioId}`);

  // Con un carico da registrare la scheda attiva resta "Carico titoli"
  await expect(linguetta(page, 'Carico titoli')).toHaveClass(/attiva/, { timeout: 8000 });
  await expect(linguetta(page, 'Riepilogo')).not.toHaveClass(/attiva/);

  // Modulo pre-compilato con i dati del titolo cercato
  await expect(page.getByTestId('input-isin')).toHaveValue(TITOLO_US_026.isin);
  await expect(page.getByTestId('input-prezzo')).not.toHaveValue('');

  // Dopo un ricaricamento lo stato di prefill è già stato ripulito, quindi
  // l'apertura ricade su Riepilogo come per qualunque altro accesso diretto.
  await page.reload();
  await expect(linguetta(page, 'Riepilogo')).toHaveClass(/attiva/, { timeout: 8000 });
  await expect(page.getByTestId('input-isin')).not.toBeVisible();
});
