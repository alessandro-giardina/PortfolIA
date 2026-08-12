/**
 * US-012: Inserire più carichi dello stesso titolo con prezzo medio di carico
 *
 * Scenario demo (con video): inserisci due carichi dello stesso ISIN a prezzi
 *   diversi → tabella aggregata mostra una riga con qty totale e avgLoadPrice
 *   ponderato corretto.
 * Scenario multi-ISIN: due ISIN diversi → due righe distinte nella tabella.
 * Scenario coerenza reload: dopo submit e reload, la riga aggregata è invariata.
 */
import { test, expect } from './support/fixtures.js';
import { TITOLO_US_012, TITOLO_US_012_SECONDO } from './support/titoli.js';

// ─── Scenario demo (con video) ────────────────────────────────────────────────

const demoTest = test.extend<object>({});
demoTest.use({
  video: 'on',
  launchOptions: { slowMo: 300 },
  viewport: { width: 1280, height: 720 },
});

demoTest(
  'demo: due carichi stesso ISIN → tabella aggregata mostra qty totale e prezzo medio ponderato',
  async ({ page, archivio }) => {
    // Anagrafica in cache come recupero appena avvenuto: la premessa è costruita
    // qui e non ereditata dalla riga che un altro file ha lasciato in archivio.
    archivio.seminaTitolo(TITOLO_US_012.isin, TITOLO_US_012.campi);

    const { id: portfolioId, name: portfolioName } =
      await archivio.creaPortafoglio('Demo Multipli');

    // Stato iniziale: portafoglio vuoto
    await page.goto(`/portfolio/${portfolioId}`);
    await expect(page.getByRole('heading', { name: portfolioName })).toBeVisible({ timeout: 8000 });
    await page.locator('nav.linguette a', { hasText: 'Carico titoli' }).click();
    await expect(page.getByTestId('input-isin')).toBeVisible();

    // Primo carico: 89.00 × 40
    await page.getByTestId('input-isin').fill(TITOLO_US_012.isin);
    await page.getByTestId('input-data').fill('2026-03-15');
    await page.getByTestId('input-prezzo').fill('89');
    await page.getByTestId('input-quantita').fill('40');
    await page.getByTestId('btn-iscrive').click();

    await expect(page.getByTestId('avviso-successo')).toBeVisible({ timeout: 8000 });

    // Secondo carico: stesso ISIN, prezzo diverso: 91.00 × 60
    await page.getByTestId('input-isin').fill(TITOLO_US_012.isin);
    await page.getByTestId('input-data').fill('2026-04-10');
    await page.getByTestId('input-prezzo').fill('91');
    await page.getByTestId('input-quantita').fill('60');
    await page.getByTestId('btn-iscrive').click();

    await expect(page.getByTestId('avviso-successo')).toBeVisible({ timeout: 8000 });

    // La tabella aggregata mostra UNA riga per ISIN
    const tabellaAggregata = page.getByTestId('tabella-posizioni');
    await expect(tabellaAggregata).toBeVisible();
    await expect(tabellaAggregata).toContainText(TITOLO_US_012.isin);

    // Quantità totale = 100
    await expect(tabellaAggregata).toContainText('100');

    // Prezzo medio ponderato = (89×40 + 91×60)/100 = 90.2000
    await expect(tabellaAggregata).toContainText('90.2000');

    // Contatore mostra 1 ISIN distinto
    await expect(page.getByTestId('contatore-posizioni')).toContainText('1');

    // Pausa finale per il video
    await page.waitForTimeout(1500);
  }
);

// ─── Scenario multi-ISIN (senza video) ───────────────────────────────────────

test('multi-ISIN: due ISIN diversi → due righe distinte nella tabella aggregata', async ({
  page,
  archivio,
}) => {
  archivio.seminaTitolo(TITOLO_US_012.isin, TITOLO_US_012.campi);
  archivio.seminaTitolo(TITOLO_US_012_SECONDO.isin, TITOLO_US_012_SECONDO.campi);

  const { id: portfolioId } = await archivio.creaPortafoglio('MultiISIN');

  // Inserisci due carichi con ISIN diversi via API
  await archivio.aggiungiPosizione(portfolioId, TITOLO_US_012.isin, '2026-03-15', 89.0, 40);
  await archivio.aggiungiPosizione(portfolioId, TITOLO_US_012_SECONDO.isin, '2026-03-20', 115.5, 20);

  await page.goto(`/portfolio/${portfolioId}`);
  await page.locator('nav.linguette a', { hasText: 'Carico titoli' }).click();
  await expect(page.getByTestId('input-isin')).toBeVisible({ timeout: 8000 });

  const tabellaAggregata = page.getByTestId('tabella-posizioni');
  await expect(tabellaAggregata).toContainText(TITOLO_US_012.isin);
  await expect(tabellaAggregata).toContainText(TITOLO_US_012_SECONDO.isin);

  // Due righe distinte (una per ISIN)
  await expect(page.getByTestId(`summary-${TITOLO_US_012.isin}`)).toBeVisible();
  await expect(page.getByTestId(`summary-${TITOLO_US_012_SECONDO.isin}`)).toBeVisible();

  // Contatore mostra 2 ISIN distinti
  await expect(page.getByTestId('contatore-posizioni')).toContainText('2');
});

// ─── Scenario coerenza reload (senza video) ───────────────────────────────────

test('coerenza reload: riga aggregata invariata dopo reload pagina', async ({ page, archivio }) => {
  archivio.seminaTitolo(TITOLO_US_012.isin, TITOLO_US_012.campi);

  const { id: portfolioId } = await archivio.creaPortafoglio('Reload');

  // Inserisci carichi via API prima di navigare
  await archivio.aggiungiPosizione(portfolioId, TITOLO_US_012.isin, '2026-03-15', 89.0, 40);
  await archivio.aggiungiPosizione(portfolioId, TITOLO_US_012.isin, '2026-04-10', 91.0, 60);

  await page.goto(`/portfolio/${portfolioId}`);
  await page.locator('nav.linguette a', { hasText: 'Carico titoli' }).click();
  await expect(page.getByTestId('input-isin')).toBeVisible({ timeout: 8000 });

  // Verifica stato iniziale
  await expect(page.getByTestId('tabella-posizioni')).toContainText('90.2000');
  await expect(page.getByTestId('tabella-posizioni')).toContainText('100');

  // Ricarica la pagina
  await page.reload();
  await page.locator('nav.linguette a', { hasText: 'Carico titoli' }).click();
  await expect(page.getByTestId('input-isin')).toBeVisible({ timeout: 8000 });

  // La vista aggregata è invariata dopo reload
  await expect(page.getByTestId('tabella-posizioni')).toContainText(TITOLO_US_012.isin);
  await expect(page.getByTestId('tabella-posizioni')).toContainText('90.2000');
  await expect(page.getByTestId('tabella-posizioni')).toContainText('100');
  await expect(page.getByTestId('contatore-posizioni')).toContainText('1');
});
