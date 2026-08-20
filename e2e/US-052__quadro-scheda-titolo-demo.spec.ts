/**
 * US-052/TASK-09: quadro strumenti — scheda titolo, scenario demo.
 *
 * Prova diretta del criterio "i dati restano invariati": legge quantità,
 * prezzo medio di carico, valore attuale e differenza di un titolo nella
 * scheda titolo del design mastro, commuta su «Quadro strumenti» SENZA
 * ricaricare la pagina, e verifica che le stesse quattro cifre — lette dagli
 * stessi `data-testid` — non siano cambiate. `GraficoTitolo` e `MetricheTitolo`
 * sono gli stessi componenti, montati invariati: nessun ricalcolo, solo una
 * veste diversa.
 *
 * Il video è registrato solo qui e salvato in docs/test-results/US-052/.
 * `launchOptions` (slowMo) non è scopabile in un describe — Playwright lo
 * consente solo a livello di file — quindi questo scenario vive da solo,
 * separato dagli scenari funzionali di US-052__quadro-scheda-titolo.spec.ts.
 *
 * ISIN riservato a questo file (regola un-ISIN-per-file), distinto da quello
 * di US-052__quadro-scheda-titolo.spec.ts.
 */
import { test, expect } from './support/fixtures.js';
import { TITOLO_US_052_DEMO } from './support/titoli.js';

const ISIN = TITOLO_US_052_DEMO.isin;

test.use({
  video: { mode: 'on', size: { width: 1280, height: 720 } },
  launchOptions: { slowMo: 300 },
  viewport: { width: 1280, height: 720 },
});

test.afterEach(async ({ page }) => {
  await page.close();
  await page.video()?.saveAs('docs/test-results/US-052/demo-quadro-scheda-titolo.webm');
});

test('demo: stessi dati, veste diversa — la scheda titolo commuta da mastro a quadro senza ricaricare', async ({
  page,
  archivio,
}) => {
  archivio.seminaTitolo(ISIN, TITOLO_US_052_DEMO.campi);

  const { id: portfolioId, name: portfolioName } = await archivio.creaPortafoglio('Demo Quadro Scheda Titolo');
  await archivio.aggiungiPosizione(portfolioId, ISIN, '2024-05-10', 82.4, 60);
  await archivio.aggiungiPosizione(portfolioId, ISIN, '2025-01-20', 96.1, 25);

  // 1. Il portafoglio si apre nel design predefinito, «mastro»
  await page.goto(`/portfolio/${portfolioId}`);
  await expect(page.getByText(portfolioName)).toBeVisible({ timeout: 8000 });
  await expect(page.locator('html')).toHaveAttribute('data-design', 'mastro');

  // 2. Un clic sulla riga del titolo apre la scheda di dettaglio
  const riga = page.getByTestId(`riepilogo-${ISIN}`);
  await expect(riga).toBeVisible({ timeout: 8000 });
  await riga.click();
  await expect(page.getByTestId('scheda-titolo')).toBeVisible({ timeout: 8000 });

  await page.waitForTimeout(1000);

  // 3. Le quattro cifre condivise sono lette una prima volta, nel mastro
  const quantita = page.getByTestId('dettaglio-quantita');
  const prezzoMedio = page.getByTestId('dettaglio-prezzo-medio');
  const valoreAttuale = page.getByTestId('dettaglio-valore-attuale');
  const differenza = page.getByTestId('dettaglio-differenza');

  await expect(quantita).toBeVisible();
  await expect(prezzoMedio).toBeVisible();
  await expect(valoreAttuale).toBeVisible();
  await expect(differenza).toBeVisible();

  const quantitaPrima = (await quantita.textContent())?.trim();
  const prezzoMedioPrima = (await prezzoMedio.textContent())?.trim();
  const valoreAttualePrima = (await valoreAttuale.textContent())?.trim();
  const differenzaPrima = (await differenza.textContent())?.trim();

  // Battuta di lettura: le cifre nel mastro restano visibili nel video
  await page.waitForTimeout(1200);

  // 4. Commutazione a «quadro», senza ricaricare la pagina
  const pulsanteVersoQuadro = page.getByRole('button', { name: /quadro strumenti/i });
  await pulsanteVersoQuadro.click();

  await expect(page.locator('html')).toHaveAttribute('data-design', 'quadro');
  await expect(page.getByTestId('barra-laterale')).toBeVisible();
  await expect(page.getByTestId('scheda-titolo')).toBeVisible({ timeout: 8000 });

  await page.waitForTimeout(1000);

  // 5. Le stesse quattro cifre, rilette dagli stessi data-testid nel quadro
  const quantitaQuadro = page.getByTestId('dettaglio-quantita');
  const prezzoMedioQuadro = page.getByTestId('dettaglio-prezzo-medio');
  const valoreAttualeQuadro = page.getByTestId('dettaglio-valore-attuale');
  const differenzaQuadro = page.getByTestId('dettaglio-differenza');

  await expect(quantitaQuadro).toHaveText(quantitaPrima ?? '');
  await expect(prezzoMedioQuadro).toHaveText(prezzoMedioPrima ?? '');
  await expect(valoreAttualeQuadro).toHaveText(valoreAttualePrima ?? '');
  await expect(differenzaQuadro).toHaveText(differenzaPrima ?? '');

  // Pausa finale: il quadro con le cifre invariate resta visibile nel video,
  // non un flash di teardown
  await page.waitForTimeout(1800);
});
