/**
 * US-051/TASK-11: quadro strumenti — riepilogo del portafoglio, scenario demo.
 *
 * Prova diretta del criterio "la logica è condivisa": legge valore attuale,
 * differenza e prezzo di un titolo nel design mastro, commuta su quadro
 * SENZA ricaricare la pagina, e verifica che le stesse tre cifre — lette
 * dagli stessi `data-testid` — non siano cambiate. Nessun ricalcolo: sono
 * gli stessi dati, una veste diversa.
 *
 * Il video è registrato solo qui e salvato in docs/test-results/US-051/.
 * `launchOptions` (slowMo) non è scopabile in un describe — Playwright lo
 * consente solo a livello di file — quindi questo scenario vive da solo,
 * separato dagli scenari funzionali di US-051__quadro-riepilogo.spec.ts,
 * senza video e senza rallentamento.
 *
 * ISIN riservato a questo file (regola un-ISIN-per-file), distinto da quelli
 * di US-051__quadro-riepilogo.spec.ts.
 */
import { test, expect } from './support/fixtures.js';
import { TITOLO_US_051_DEMO } from './support/titoli.js';

const ISIN = TITOLO_US_051_DEMO.isin;

test.use({
  video: { mode: 'on', size: { width: 1280, height: 720 } },
  launchOptions: { slowMo: 300 },
  viewport: { width: 1280, height: 720 },
});

test.afterEach(async ({ page }) => {
  await page.close();
  await page.video()?.saveAs('docs/test-results/US-051/demo-quadro-riepilogo.webm');
});

/**
 * Estrae solo la parte "EUR<numero>" dal testo di un elemento. Il mastro porta
 * `data-testid="valore-totale-portafoglio"` sull'intero riquadro (etichetta +
 * cifra + conteggio posizioni), il quadro sulla sola `<span>` della cifra
 * dentro la carta KPI: due strutture diverse per lo stesso numero. La prova
 * di "logica condivisa" riguarda la cifra, non il markup che la contiene.
 */
function estraiCifraEuro(testo: string): string {
  // `\d{2}` è una lunghezza fissa: cattura sempre e solo i due decimali, anche
  // quando nel mastro segue senza spazio un conteggio ("...2256,00" più
  // "1 di 1 posizione...", concatenati nello stesso `textContent`).
  const trovato = testo.match(/EUR[\d.]+,\d{2}/);
  if (!trovato) throw new Error(`nessuna cifra EUR nel testo: "${testo}"`);
  return trovato[0];
}

test('demo: stessi dati, veste diversa — il riepilogo commuta da mastro a quadro senza ricaricare', async ({
  page,
  archivio,
}) => {
  archivio.seminaTitolo(ISIN, TITOLO_US_051_DEMO.campi);

  const { id: portfolioId, name: portfolioName } = await archivio.creaPortafoglio('Demo Quadro Riepilogo');
  await archivio.aggiungiPosizione(portfolioId, ISIN, '2026-02-01', 90.0, 20);

  // 1. Il portafoglio si apre nel design predefinito, "mastro"
  await page.goto(`/portfolio/${portfolioId}`);
  await expect(page.getByText(portfolioName)).toBeVisible({ timeout: 8000 });
  await expect(page.locator('html')).toHaveAttribute('data-design', 'mastro');

  // 2. Le tre cifre condivise sono lette una prima volta, nel mastro
  const valoreTotale = page.getByTestId('valore-totale-portafoglio');
  const differenza = page.getByTestId(`diff-${ISIN}`);
  const prezzoAttuale = page.getByTestId(`prezzo-attuale-${ISIN}`);
  await expect(valoreTotale).toBeVisible({ timeout: 8000 });
  await expect(differenza).toBeVisible();
  await expect(prezzoAttuale).toBeVisible();

  const cifraValorePrimaDellaCommutazione = estraiCifraEuro((await valoreTotale.textContent()) ?? '');
  const differenzaPrimaDellaCommutazione = (await differenza.textContent())?.trim();
  const prezzoPrimaDellaCommutazione = (await prezzoAttuale.textContent())?.trim();

  // Battuta di lettura: le cifre nel mastro restano visibili nel video
  await expect(valoreTotale).toBeVisible();
  await page.waitForTimeout(1000);

  // 3. Commutazione a "quadro", senza ricaricare la pagina
  const pulsanteVersoQuadro = page.getByRole('button', { name: /quadro strumenti/i });
  await pulsanteVersoQuadro.click();

  await expect(page.locator('html')).toHaveAttribute('data-design', 'quadro');
  await expect(page.getByTestId('barra-laterale')).toBeVisible();

  // 4. Le stesse tre cifre, rilette dagli stessi data-testid nel quadro
  const valoreTotaleQuadro = page.getByTestId('valore-totale-portafoglio');
  const differenzaQuadro = page.getByTestId(`diff-${ISIN}`);
  const prezzoAttualeQuadro = page.getByTestId(`prezzo-attuale-${ISIN}`);
  await expect(valoreTotaleQuadro).toBeVisible({ timeout: 8000 });

  const cifraValoreDopoLaCommutazione = estraiCifraEuro((await valoreTotaleQuadro.textContent()) ?? '');
  expect(cifraValoreDopoLaCommutazione).toBe(cifraValorePrimaDellaCommutazione);
  await expect(differenzaQuadro).toHaveText(differenzaPrimaDellaCommutazione ?? '');
  await expect(prezzoAttualeQuadro).toHaveText(prezzoPrimaDellaCommutazione ?? '');

  // Pausa finale: il quadro con le cifre invariate resta visibile nel video,
  // non un flash di teardown
  await page.waitForTimeout(1800);
});
