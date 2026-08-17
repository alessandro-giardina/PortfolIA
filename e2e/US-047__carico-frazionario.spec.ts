/**
 * US-047: Iscrivere un carico con quantità frazionaria.
 *
 * Scenario demo (con video): iscrive 12,345 quote a 8,20 €, verifica quantità
 *   e controvalore a schermo, ricarica la pagina per la persistenza, aggiunge
 *   7,5 quote e verifica il totale 19,845.
 * Scenario validazione: >6 decimali, zero, testo non numerico → errore.
 * Scenario modifica: modifica un carico portando la quantità a 5,25.
 *
 * Titolo seminato: TITOLO_US_047, riservato a questo file.
 */
import { test, expect } from './support/fixtures.js';
import { elencaPosizioni } from './support/api.js';
import { TITOLO_US_047 } from './support/titoli.js';

// ─── Scenario demo (con video) ──────────────────────────────────────────────

const demoTest = test.extend<object>({});
demoTest.use({
  video: { mode: 'on', size: { width: 1280, height: 720 } },
  launchOptions: { slowMo: 300 },
  viewport: { width: 1280, height: 720 },
});

demoTest.setTimeout(60_000);

demoTest.afterEach(async ({ page }) => {
  await page.close();
  await page.video()?.saveAs('docs/test-results/US-047/demo-carico-frazionario.webm');
});

const ISIN = TITOLO_US_047.isin;

demoTest(
  'demo: carico frazionario 12,345 quote a 8,20 € — quantità, controvalore, persistenza, secondo carico',
  async ({ page, archivio }) => {
    archivio.seminaTitolo(ISIN, TITOLO_US_047.campi);
    const portafoglio = await archivio.creaPortafoglio('US047-Frazionario');
    const portfolioId = portafoglio.id;

    // 1. Naviga alla scheda Carico titoli
    await page.goto(`/portfolio/${portfolioId}`);
    await expect(page.getByRole('heading', { name: portafoglio.name })).toBeVisible({ timeout: 8000 });
    await page.locator('nav.linguette a', { hasText: 'Carico titoli' }).click();
    await expect(page.getByTestId('input-isin')).toBeVisible();

    // 2. Compila il form con quantità frazionaria (virgola come separatore)
    await page.getByTestId('input-isin').fill(ISIN);
    await page.getByTestId('input-data').fill('2026-03-15');
    await page.getByTestId('input-prezzo').fill('8.20');
    await page.getByTestId('input-quantita').fill('12,345');

    // 3. Submit
    await page.getByTestId('btn-iscrive').click();
    await expect(page.getByTestId('avviso-successo')).toBeVisible({ timeout: 8000 });

    // 4. Verifica quantità «12,345» nel Registro delle iscrizioni
    const registro = page.getByTestId('tabella-registro-carichi');
    await expect(registro).toContainText('12,345');
    // Controvalore: 8,20 × 12,345 = 101,23 (arrotondato a 2 decimali)
    await expect(registro).toContainText('101,23');

    // 5. Verifica in Titoli iscritti a conto
    const summary = page.getByTestId(`summary-${ISIN}`);
    await expect(summary).toBeVisible();
    await expect(summary).toContainText('12,345');
    await expect(summary).toContainText('101,23');

    // 6. Ricarica la pagina e verifica persistenza
    await page.reload();
    await page.locator('nav.linguette a', { hasText: 'Carico titoli' }).click();
    await expect(page.getByTestId(`summary-${ISIN}`)).toContainText('12,345', { timeout: 8000 });

    // 7. Secondo carico: 7,5 quote a 15 €
    await page.getByTestId('input-isin').fill(ISIN);
    await page.getByTestId('input-data').fill('2026-06-01');
    await page.getByTestId('input-prezzo').fill('15');
    await page.getByTestId('input-quantita').fill('7,5');
    await page.getByTestId('btn-iscrive').click();
    await expect(page.getByTestId('avviso-successo')).toBeVisible({ timeout: 8000 });

    // 8. Verifica il totale 19,845 in Titoli iscritti a conto
    await expect(page.getByTestId(`summary-${ISIN}`)).toContainText('19,845');

    // Pausa finale per il video
    await page.waitForTimeout(1500);
  },
);

// ─── Scenario validazione (senza video) ──────────────────────────────────────

test('validazione: >6 decimali, zero e testo non numerico → messaggi errore', async ({
  page,
  archivio,
}) => {
  archivio.seminaTitolo(ISIN, TITOLO_US_047.campi);
  const { id: portfolioId } = await archivio.creaPortafoglio('US047-Validazione');

  await page.goto(`/portfolio/${portfolioId}`);
  await page.locator('nav.linguette a', { hasText: 'Carico titoli' }).click();
  await expect(page.getByTestId('input-isin')).toBeVisible({ timeout: 8000 });

  // Compila campi validi tranne la quantità
  const compilaCampiBase = async () => {
    await page.getByTestId('input-isin').fill(ISIN);
    await page.getByTestId('input-data').fill('2026-03-15');
    await page.getByTestId('input-prezzo').fill('10');
  };

  // Caso 1: >6 decimali
  await compilaCampiBase();
  await page.getByTestId('input-quantita').fill('12,3456789');
  await page.getByTestId('btn-iscrive').click();
  await expect(page.getByTestId('err-quantita')).toBeVisible();
  await expect(page.getByTestId('err-quantita')).toContainText('sei decimali');

  // Caso 2: quantità zero
  await page.getByTestId('input-quantita').clear();
  await page.getByTestId('input-quantita').fill('0');
  await page.getByTestId('btn-iscrive').click();
  await expect(page.getByTestId('err-quantita')).toBeVisible();

  // Caso 3: testo non numerico
  await page.getByTestId('input-quantita').clear();
  await page.getByTestId('input-quantita').fill('abc');
  await page.getByTestId('btn-iscrive').click();
  await expect(page.getByTestId('err-quantita')).toBeVisible();
});

// ─── Scenario modifica (senza video) ─────────────────────────────────────────

test('modifica: porta la quantità di un carico esistente a 5,25', async ({
  page,
  archivio,
}) => {
  archivio.seminaTitolo(ISIN, TITOLO_US_047.campi);
  const portafoglio = await archivio.creaPortafoglio('US047-Modifica');
  const portfolioId = portafoglio.id;

  // Crea un carico via API con quantità intera
  await archivio.aggiungiPosizione(portfolioId, ISIN, '2026-03-15', 10, 20);

  await page.goto(`/portfolio/${portfolioId}`);
  await page.locator('nav.linguette a', { hasText: 'Carico titoli' }).click();
  await expect(page.getByTestId('tabella-registro-carichi')).toBeVisible({ timeout: 8000 });

  // Trova l'id del carico
  const positions = await elencaPosizioni(portfolioId);
  const pos = positions.find((p) => p.isin === ISIN);
  expect(pos).toBeDefined();

  // Apri il form inline di modifica
  await page.getByTestId(`btn-modifica-${pos!.id}`).click();
  await expect(page.getByTestId(`edit-riga-${pos!.id}`)).toBeVisible();

  // Modifica la quantità a 5,25
  await page.getByTestId('edit-input-quantita').clear();
  await page.getByTestId('edit-input-quantita').fill('5,25');
  await page.getByTestId(`btn-salva-modifica-${pos!.id}`).click();

  // Il form inline scompare
  await expect(page.getByTestId(`edit-riga-${pos!.id}`)).not.toBeVisible({ timeout: 8000 });

  // Verifica la nuova quantità nel Registro
  const registro = page.getByTestId('tabella-registro-carichi');
  await expect(registro).toContainText('5,25');

  // Verifica in Titoli iscritti a conto
  const summary = page.getByTestId(`summary-${ISIN}`);
  await expect(summary).toContainText('5,25');
});
