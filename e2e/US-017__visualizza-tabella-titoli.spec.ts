/**
 * US-017: Visualizzare la tabella dei titoli del portafoglio
 *
 * Scenario demo (con video, salvato in docs/test-results/US-017/):
 *   crea portafoglio via API, aggiunge posizione via API,
 *   apre scheda Riepilogo, verifica presenza tabella con riga ISIN corretta.
 *
 * Scenario aggiuntivo:
 *   portafoglio senza posizioni → stato vuoto visibile nella scheda Riepilogo.
 */
import { test, expect } from './support/fixtures.js';

// ---------------------------------------------------------------------------
// Scenario demo (con video) — docs/test-results/US-017/
// ---------------------------------------------------------------------------

const demoTest = test.extend<object>({});
demoTest.use({
  video: 'on',
  launchOptions: { slowMo: 300 },
  viewport: { width: 1280, height: 720 },
});

demoTest(
  'demo: apre scheda Riepilogo e vede tabella con riga ISIN del titolo registrato',
  async ({ page, archivio }) => {
    const { id: portfolioId, name: portfolioName } = await archivio.creaPortafoglio('Demo Riepilogo');

    // Aggiunge una posizione via API (IE00B4L5Y983, 89.00 × 40)
    await archivio.aggiungiPosizione(portfolioId, 'IE00B4L5Y983', '2026-03-15', 89.0, 40);

    // Naviga al portafoglio → scheda Carico titoli (default)
    await page.goto(`/portfolio/${portfolioId}`);
    await expect(page.getByRole('heading', { name: portfolioName })).toBeVisible({ timeout: 8000 });

    // Clicca sulla scheda Riepilogo (resa come <a> con cursor:pointer, non come link navigabile)
    await page.locator('nav.linguette a', { hasText: 'Riepilogo' }).click();
    await expect(page.getByTestId('tabella-riepilogo')).toBeVisible({ timeout: 8000 });

    // Verifica presenza della riga con l'ISIN corretto
    const rigaIsin = page.getByTestId('riepilogo-IE00B4L5Y983');
    await expect(rigaIsin).toBeVisible();

    // La riga contiene l'ISIN
    await expect(rigaIsin).toContainText('IE00B4L5Y983');

    // Prezzo medio carico visibile (89.0000, formatted by toFixed(4))
    await expect(rigaIsin).toContainText('89.0000');

    // Quantità visibile (40)
    await expect(rigaIsin).toContainText('40');

    // Pausa finale per rendere lo stato visibile nel video
    await page.waitForTimeout(1500);
  },
);

// ---------------------------------------------------------------------------
// Scenario stato vuoto (senza video)
// ---------------------------------------------------------------------------

test('stato vuoto: portafoglio senza posizioni mostra messaggio vuoto nella scheda Riepilogo', async ({ page, archivio }) => {
  const { id: portfolioId, name: portfolioName } = await archivio.creaPortafoglio('Vuoto Riepilogo');

  await page.goto(`/portfolio/${portfolioId}`);
  await expect(page.getByRole('heading', { name: portfolioName })).toBeVisible({ timeout: 8000 });

  // Naviga alla scheda Riepilogo
  await page.locator('nav.linguette a', { hasText: 'Riepilogo' }).click();

  // Verifica stato vuoto visibile
  await expect(page.getByTestId('riepilogo-vuoto')).toBeVisible({ timeout: 8000 });

  // Non deve esserci la tabella
  await expect(page.getByTestId('tabella-riepilogo')).not.toBeVisible();
});
