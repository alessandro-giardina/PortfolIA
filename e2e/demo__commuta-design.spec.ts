/**
 * US-050: Commutatore di design — scenario demo.
 *
 * Il pulsante presente su ogni pagina commuta `data-design` fra "mastro" e
 * "quadro" senza ricaricare la pagina.
 *
 * Il video è registrato solo qui e salvato in docs/test-results/US-050/.
 * `launchOptions` (slowMo) non è scopabile in un describe — Playwright lo consente
 * solo a livello di file — quindi questo scenario vive da solo, separato dagli
 * scenari funzionali di US-050__commutatore-design.spec.ts, senza video e senza
 * rallentamento.
 */
import { test, expect } from './support/fixtures.js';

test.use({
  video: { mode: 'on', size: { width: 1280, height: 720 } },
  launchOptions: { slowMo: 300 },
  viewport: { width: 1280, height: 720 },
});

test.afterEach(async ({ page }) => {
  await page.close();
  await page.video()?.saveAs('docs/test-results/US-050/demo-commuta-design.webm');
});

test('demo: il pulsante commuta il design da Libro Mastro a Quadro strumenti', async ({ page }) => {
  // Contesto nuovo per ogni test: nessuna preferenza salvata in localStorage.
  await page.goto('/');

  await expect(page.locator('html')).toHaveAttribute('data-design', 'mastro');
  const pulsanteVersoQuadro = page.getByRole('button', { name: /quadro strumenti/i });
  await expect(pulsanteVersoQuadro).toBeVisible();

  // Battuta di lettura: lo stato iniziale registra nel video
  await page.waitForTimeout(1000);

  await pulsanteVersoQuadro.click();

  await expect(page.locator('html')).toHaveAttribute('data-design', 'quadro');
  await expect(page.getByRole('button', { name: /libro mastro/i })).toBeVisible();

  // Pausa finale: lo stato commutato resta visibile nel video, non un flash di teardown
  await page.waitForTimeout(1800);
});
