/**
 * US-055/TASK-05: quadro strumenti — ricerca titoli, scenario dimostrativo.
 *
 * Prova diretta del «Dimostra» della spec: dalla ricerca titoli nel design
 * predefinito («mastro»), commuta su «Quadro strumenti» senza ricaricare la
 * pagina, digita l'ISIN e vede il risultato completo — intestazione con nome e
 * pillole, riga di provenienza con fonte e istante, anagrafica ufficiale e il
 * comando «Aggiungi a portafoglio» — nella veste del nuovo design.
 *
 * Il video è registrato solo qui e salvato in `docs/test-results/US-055/`.
 * `launchOptions` (slowMo) non è scopabile in un `describe` — Playwright lo
 * consente solo a livello di file — quindi questo scenario vive da solo,
 * separato dagli scenari funzionali di `US-055__quadro-ricerca-titoli.spec.ts`.
 *
 * Il titolo è seminato in cache con un recupero «appena avvenuto»: la ricerca
 * risponde dall'archivio e non contatta la fonte reale, che a freddo costerebbe
 * 8-12 secondi non deterministici.
 */
import { test, expect } from './support/fixtures.js';
import { TITOLO_US_055_DEMO } from './support/titoli.js';

test.use({
  video: { mode: 'on', size: { width: 1280, height: 720 } },
  launchOptions: { slowMo: 300 },
  viewport: { width: 1280, height: 720 },
});

test.afterEach(async ({ page }) => {
  await page.close();
  await page.video()?.saveAs('docs/test-results/US-055/demo-quadro-ricerca-titoli.webm');
});

test('demo: commuta su «Quadro strumenti» e recupera anagrafica e prezzo di un ISIN', async ({
  page,
  archivio,
}) => {
  archivio.seminaTitolo(TITOLO_US_055_DEMO.isin, TITOLO_US_055_DEMO.campi);

  // 1. La ricerca titoli nel design predefinito, «mastro»
  await page.goto('/ricerca');
  await expect(page.getByLabel('Codice ISIN del titolo')).toBeVisible({ timeout: 8000 });
  await expect(page.locator('html')).toHaveAttribute('data-design', 'mastro');

  await page.waitForTimeout(1000);

  // 2. Commutazione al «Quadro strumenti», senza ricaricare la pagina
  await page.getByRole('button', { name: /quadro strumenti/i }).click();

  await expect(page.locator('html')).toHaveAttribute('data-design', 'quadro');
  await expect(page.getByTestId('barra-laterale')).toBeVisible({ timeout: 8000 });
  await expect(page.locator('.titolo-pagina h1')).toHaveText('Ricerca titoli');

  // Lo stato di partenza che rende visibile l'incremento: nessuna ricerca ancora eseguita
  await expect(page.getByTestId('ricerca-vuota')).toBeVisible();

  await page.waitForTimeout(1000);

  // 3. Digita il codice ISIN — il contatore accompagna la battitura fino a 12/12
  await page.getByLabel('Codice ISIN del titolo').fill(TITOLO_US_055_DEMO.isin);
  await expect(page.getByTestId('contatore-isin')).toHaveText('12/12');

  await page.waitForTimeout(800);

  // 4. Recupera l'anagrafica
  await page.getByRole('button', { name: 'Recupera anagrafica' }).click();

  // 5. L'incremento visibile: il risultato completo nella veste del quadro
  await expect(page.getByTestId('riga-esito')).toHaveClass(/trovato/, { timeout: 30000 });
  await expect(page.getByTestId('testa-titolo-ricerca')).toContainText(TITOLO_US_055_DEMO.campi.name!);
  await expect(page.getByTestId('fonte-dato')).toContainText('Borsa Italiana');
  await expect(page.getByTestId('anagrafica-quadro')).toBeVisible();
  await expect(page.getByTestId('btn-aggiungi-portafoglio')).toBeVisible();

  // Pausa finale: il risultato resta visibile nel video, non un flash di teardown
  await page.waitForTimeout(1800);
});
