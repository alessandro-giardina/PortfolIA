/**
 * US-026: Aprire il portafoglio sulla scheda Riepilogo — scenario demo.
 *
 * Dall'elenco portafogli della schermata principale, il clic su un portafoglio apre
 * il dettaglio con la scheda "Riepilogo" già attiva e la tabella titoli visibile.
 *
 * Il video è registrato solo qui e salvato in docs/test-results/US-026/.
 * `launchOptions` (slowMo) non è scopabile in un describe — Playwright lo consente
 * solo a livello di file — quindi gli altri scenari di US-026 vivono in
 * US-026__schede-portafoglio.spec.ts, senza video e senza rallentamento.
 */
import { test, expect } from './support/fixtures.js';

test.use({
  // `video: 'on'` da solo scala la registrazione a 800×450: la dimensione va dichiarata
  // esplicitamente perché il video corrisponda al viewport.
  video: { mode: 'on', size: { width: 1280, height: 720 } },
  launchOptions: { slowMo: 300 },
  viewport: { width: 1280, height: 720 },
});

// `outputDir` non è un'opzione di test.use() (è solo project/config-level), quindi il
// video va salvato a mano nella cartella della spec. `saveAs` attende la fine della
// registrazione, che avviene alla chiusura della pagina: va chiamato dopo `page.close()`,
// non dentro il test.
test.afterEach(async ({ page }) => {
  await page.close();
  await page.video()?.saveAs('docs/test-results/US-026/demo-apre-scheda-riepilogo.webm');
});

test('demo: il clic su un portafoglio dall\'elenco apre la scheda Riepilogo con la tabella titoli', async ({
  page,
  archivio,
}) => {
  const { id: portfolioId, name: portfolioName } =
    await archivio.creaPortafoglio('Demo Riepilogo Diretto');

  // Un titolo iscritto, così la tabella di riepilogo ha una riga da mostrare
  await archivio.aggiungiPosizione(portfolioId, 'IE00B4L5Y983', '2026-03-15', 89.0, 40);

  // 1. Schermata principale con l'elenco dei portafogli
  await page.goto('/');
  const riga = page.locator('tr.cliccabile', { hasText: portfolioName });
  await expect(riga).toBeVisible({ timeout: 8000 });

  // Battuta di lettura: l'elenco portafogli è il punto di partenza del flusso
  await page.waitForTimeout(1200);

  // 2. Clic sulla riga del portafoglio
  await riga.click();

  // 3. Il dettaglio si apre sulla scheda Riepilogo, senza alcun clic sulle linguette
  await expect(page).toHaveURL(`/portfolio/${portfolioId}`);
  await expect(page.locator('nav.linguette a', { hasText: 'Riepilogo' })).toHaveClass(/attiva/, {
    timeout: 8000,
  });

  // 4. La tabella dei titoli è subito visibile, con la riga dell'ISIN iscritto
  await expect(page.getByTestId('tabella-riepilogo')).toBeVisible({ timeout: 8000 });
  await expect(page.getByTestId('riepilogo-IE00B4L5Y983')).toBeVisible();

  // 5. Il modulo di carico non è quello che accoglie l'utente
  await expect(page.getByTestId('input-isin')).not.toBeVisible();

  // Pausa finale: la scheda Riepilogo con la tabella resta visibile nel video
  await page.waitForTimeout(2000);
});
