/**
 * US-053/TASK-08: quadro strumenti — elenco portafogli, scenario demo.
 *
 * Prova diretta del criterio "creazione di un nuovo portafoglio nel quadro":
 * dalla schermata iniziale nel design predefinito («mastro»), commuta su
 * «Quadro strumenti» senza ricaricare la pagina, compila il pannello «Nuovo
 * portafoglio» e vede la nuova riga apparire nell'elenco.
 *
 * Il video è registrato solo qui e salvato in docs/test-results/US-053/.
 * `launchOptions` (slowMo) non è scopabile in un `describe` — Playwright lo
 * consente solo a livello di file — quindi questo scenario vive da solo,
 * separato dagli scenari funzionali di
 * `US-053__quadro-elenco-portafogli.spec.ts`.
 *
 * Il portafoglio nasce dalla UI, non dalla fixture: il nome è prenotato con
 * `archivio.nomeUnico()`, che registra la pulizia per nome (US-029) perché
 * il test non ne conosce l'id finché il modulo non risponde.
 */
import { test, expect } from './support/fixtures.js';

test.use({
  video: { mode: 'on', size: { width: 1280, height: 720 } },
  launchOptions: { slowMo: 300 },
  viewport: { width: 1280, height: 720 },
});

test.afterEach(async ({ page }) => {
  await page.close();
  await page.video()?.saveAs('docs/test-results/US-053/demo-quadro-crea-portafoglio.webm');
});

test('demo: crea un portafoglio dal pannello del quadro strumenti e lo vede apparire nell\'elenco', async ({
  page,
  archivio,
}) => {
  const nome = archivio.nomeUnico('Quadro Demo');

  // 1. La schermata iniziale nel design predefinito, «mastro»
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Libro Mastro' })).toBeVisible({ timeout: 8000 });
  await expect(page.locator('html')).toHaveAttribute('data-design', 'mastro');

  await page.waitForTimeout(1000);

  // 2. Commutazione al «Quadro strumenti», senza ricaricare la pagina
  await page.getByRole('button', { name: /quadro strumenti/i }).click();

  await expect(page.locator('html')).toHaveAttribute('data-design', 'quadro');
  await expect(page.getByTestId('barra-laterale')).toBeVisible({ timeout: 8000 });
  await expect(page.locator('.titolo-pagina h1')).toHaveText('Portafogli');

  await page.waitForTimeout(1000);

  // 3. Compila il modulo «Nuovo portafoglio» del pannello quadro
  const campo = page.getByTestId('input-nuovo-portafoglio');
  await expect(campo).toBeVisible();
  await campo.fill(nome);

  await page.waitForTimeout(600);

  await page.getByTestId('btn-crea-portafoglio-quadro').click();

  // 4. L'incremento visibile: la nuova riga compare nell'elenco portafogli
  const riga = page.getByText(nome, { exact: true });
  await expect(riga).toBeVisible({ timeout: 8000 });

  // Pausa finale: la riga resta visibile nel video, non un flash di teardown
  await page.waitForTimeout(1800);
});
