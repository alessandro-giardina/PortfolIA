/**
 * US-031: il foglio sfrutta il monitor largo — scenario demo.
 *
 * Su una finestra da 1600px il foglio del libro mastro misura 1440px anziché i
 * 1080px di prima, resta centrato, e i blocchi a campi restano nella colonna di
 * lettura. Restringendo la finestra sotto quel limite il foglio torna ad
 * adattarsi allo spazio disponibile, senza scroll orizzontale di pagina.
 *
 * Il video è registrato solo qui e salvato in docs/test-results/US-031/.
 * `launchOptions` (slowMo) non è scopabile in un describe — Playwright lo
 * consente solo a livello di file — quindi le misure alle soglie responsive
 * vivono in US-031__soglie-responsive.spec.ts, senza video e senza
 * rallentamento.
 */
import { test, expect } from './support/fixtures.js';
import { TITOLO_US_031_LARGHEZZA } from './support/titoli.js';

/** Larghezza del foglio a monitor largo, come dichiarata da `--larghezza-foglio`. */
const LARGHEZZA_FOGLIO = 1440;

/** Colonna di lettura dei blocchi a campi, come dichiarata da `--larghezza-lettura`. */
const LARGHEZZA_LETTURA = 950;

/** `body { padding: 32px 18px 80px }`: 18px per lato sottratti al foglio. */
const MARGINI_BODY = 36;

test.use({
  // `video: 'on'` da solo scala la registrazione a 800×450: la dimensione va
  // dichiarata esplicitamente perché il video corrisponda al viewport.
  video: { mode: 'on', size: { width: 1600, height: 900 } },
  launchOptions: { slowMo: 300 },
  viewport: { width: 1600, height: 900 },
});

// `outputDir` non è un'opzione di test.use() (è solo project/config-level), quindi
// il video va salvato a mano nella cartella della spec. `saveAs` attende la fine
// della registrazione, che avviene alla chiusura della pagina: va chiamato dopo
// `page.close()`, non dentro il test.
test.afterEach(async ({ page }) => {
  await page.close();
  await page.video()?.saveAs('docs/test-results/US-031/demo-larghezza-foglio.webm');
});

test('demo: su un monitor largo il foglio misura 1440px e resta centrato', async ({
  page,
  archivio,
}) => {
  const { id: portfolioId, name: portfolioName } =
    await archivio.creaPortafoglio('Demo Larghezza Foglio');

  // Due carichi, così il riepilogo ha righe da mostrare nello spazio in più.
  // Nessuna asserzione qui guarda i valori — si misura la geometria, non i numeri —
  // ma la riga di riepilogo rileva comunque il prezzo dalla cache con una LEFT
  // JOIN, e la premessa va costruita invece che ereditata da un altro file.
  archivio.seminaTitolo(TITOLO_US_031_LARGHEZZA.isin, TITOLO_US_031_LARGHEZZA.campi);
  await archivio.aggiungiPosizione(
    portfolioId,
    TITOLO_US_031_LARGHEZZA.isin,
    '2026-02-10',
    92.4,
    25,
  );
  await archivio.aggiungiPosizione(
    portfolioId,
    TITOLO_US_031_LARGHEZZA.isin,
    '2026-04-22',
    101.8,
    17,
  );

  // ─── 1. Elenco portafogli: il foglio si estende a 1440px, centrato ─────────
  await page.goto('/');
  const foglio = page.locator('.foglio');
  await expect(foglio).toBeVisible({ timeout: 8000 });
  await expect(page.locator('tr.cliccabile', { hasText: portfolioName })).toBeVisible({
    timeout: 8000,
  });

  const riquadroLargo = await foglio.boundingBox();
  expect(riquadroLargo).not.toBeNull();
  expect(Math.round(riquadroLargo!.width)).toBe(LARGHEZZA_FOGLIO);

  // Centratura: il foglio lascia altrettanto spazio a destra e a sinistra. La
  // larghezza di riferimento viene dal DOM e non dalla costante del viewport,
  // perché la barra di scorrimento verticale sottrae larghezza alla finestra.
  const larghezzaDocumento = await page.evaluate(() => document.documentElement.clientWidth);
  expect(Math.round(riquadroLargo!.x)).toBe(Math.round((larghezzaDocumento - LARGHEZZA_FOGLIO) / 2));

  await page.waitForTimeout(1200);

  // ─── 2. Riepilogo: la tabella dei titoli prende tutto lo spazio in più ─────
  await page.locator('tr.cliccabile', { hasText: portfolioName }).click();
  await expect(page).toHaveURL(`/portfolio/${portfolioId}`);

  const tabellaRiepilogo = page.getByTestId('tabella-riepilogo');
  await expect(tabellaRiepilogo).toBeVisible({ timeout: 8000 });

  const riquadroTabella = await tabellaRiepilogo.boundingBox();
  expect(riquadroTabella).not.toBeNull();
  expect(riquadroTabella!.width).toBeGreaterThan(LARGHEZZA_LETTURA);

  await page.waitForTimeout(1200);

  // ─── 3. Carico titoli: il modulo resta nella colonna di lettura ───────────
  await page.locator('nav.linguette a', { hasText: 'Carico titoli' }).click();

  const modulo = page.locator('.riquadro-modulo');
  await expect(modulo).toBeVisible({ timeout: 8000 });
  await expect(page.getByTestId('input-isin')).toBeVisible();

  const riquadroModulo = await modulo.boundingBox();
  expect(riquadroModulo).not.toBeNull();
  expect(riquadroModulo!.width).toBeLessThanOrEqual(LARGHEZZA_LETTURA);

  await page.waitForTimeout(1200);

  // ─── 4. Finestra stretta: il foglio torna ad adattarsi ────────────────────
  await page.setViewportSize({ width: 1100, height: 900 });
  await expect(modulo).toBeVisible();

  const misureStrette = await page.evaluate(() => ({
    foglio: document.querySelector('.foglio')!.getBoundingClientRect().width,
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  // Il foglio occupa tutto lo spazio meno i margini del corpo pagina.
  expect(Math.round(misureStrette.foglio)).toBe(misureStrette.clientWidth - MARGINI_BODY);
  // E nessuno scroll orizzontale di pagina.
  expect(misureStrette.scrollWidth).toBeLessThanOrEqual(misureStrette.clientWidth);

  // Pausa finale: il foglio adattato alla finestra stretta resta nel video.
  await page.waitForTimeout(2000);
});
