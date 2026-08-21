/**
 * US-066: il pannello «Composizione» esclude le posizioni chiuse — scenario demo.
 *
 * Riproduce il campo `Dimostra` della spec, parola per parola: «Dopo
 * l'implementazione di questa spec, in un portafoglio con una posizione
 * completamente venduta (quantità a zero) ma con un prezzo ancora in cache,
 * il grafico «Composizione» e il relativo elenco non la includono più, e la
 * didascalia sotto il grafico riporta correttamente solo le esclusioni
 * dovute a prezzo mancante sulle posizioni aperte.»
 *
 * Stessa logica di scenario della spec di verifica
 * (`US-066__esclude-posizioni-chiuse-da-composizione.spec.ts`): tre
 * posizioni che isolano ciascuna la propria variabile — aperta con prezzo,
 * aperta senza prezzo, chiusa con prezzo residuo in cache — ma con chiavi
 * ISIN proprie, riservate a questo file (regola un-ISIN-per-file in
 * `e2e/support/titoli.ts`: la demo non eredita le riserve del file di
 * verifica).
 *
 * Il video è registrato solo qui e salvato in docs/test-results/US-066/.
 * `launchOptions` (slowMo) non è scopabile in un describe — Playwright lo
 * consente solo a livello di file — quindi il file resta un unico scenario,
 * come già fanno `US-026__apre-scheda-riepilogo.spec.ts` e
 * `US-065__conteggio-solo-posizioni-aperte-demo.spec.ts`.
 */
import { test, expect } from './support/fixtures.js';
import { registraVendita } from './support/api.js';
import {
  ISIN_US_066_DEMO_APERTO_SENZA_PREZZO,
  TITOLO_US_066_DEMO_APERTO_CON_PREZZO,
  TITOLO_US_066_DEMO_CHIUSO_CON_PREZZO,
} from './support/titoli.js';

test.use({
  // `video: 'on'` da solo scala la registrazione a 800×450: la dimensione va
  // dichiarata esplicitamente perché il video corrisponda al viewport.
  video: { mode: 'on', size: { width: 1280, height: 720 } },
  launchOptions: { slowMo: 300 },
  viewport: { width: 1280, height: 720 },
});

// `outputDir` non è un'opzione di test.use() (è solo project/config-level),
// quindi il video va salvato a mano. `saveAs` attende la fine della
// registrazione, che avviene alla chiusura della pagina: va chiamato dopo
// `page.close()`, non dentro il test.
test.afterEach(async ({ page }) => {
  await page.close();
  await page
    .video()
    ?.saveAs('docs/test-results/US-066/demo-esclude-posizioni-chiuse-da-composizione.webm');
});

const ISIN_APERTO_CON_PREZZO = TITOLO_US_066_DEMO_APERTO_CON_PREZZO.isin;
const ISIN_APERTO_SENZA_PREZZO = ISIN_US_066_DEMO_APERTO_SENZA_PREZZO.isin;
const ISIN_CHIUSO_CON_PREZZO = TITOLO_US_066_DEMO_CHIUSO_CON_PREZZO.isin;

const QUANTITA_CHIUSA = 20;

test('demo: il pannello Composizione esclude la posizione chiusa e la didascalia conta solo le escluse per prezzo mancante', async ({
  page,
  archivio,
}) => {
  // ─── Premessa: le tre posizioni, costruite esplicitamente ─────────────────
  archivio.seminaTitolo(ISIN_APERTO_CON_PREZZO, TITOLO_US_066_DEMO_APERTO_CON_PREZZO.campi);
  archivio.rimuoviTitolo(ISIN_APERTO_SENZA_PREZZO);
  archivio.seminaTitolo(ISIN_CHIUSO_CON_PREZZO, TITOLO_US_066_DEMO_CHIUSO_CON_PREZZO.campi);

  const { id: portfolioId, name: portfolioName } = await archivio.creaPortafoglio(
    'Demo Composizione Esclude Chiuse',
  );

  await archivio.aggiungiPosizione(portfolioId, ISIN_APERTO_CON_PREZZO, '2026-01-10', 60.0, 10);
  await archivio.aggiungiPosizione(portfolioId, ISIN_APERTO_SENZA_PREZZO, '2026-01-15', 45.0, 5);

  // Il titolo chiuso: un carico e poi una vendita che ne esaurisce l'intero
  // residuo — quantità a zero, ma il prezzo resta valorizzato in cache.
  await archivio.aggiungiPosizione(portfolioId, ISIN_CHIUSO_CON_PREZZO, '2025-06-01', 40.0, QUANTITA_CHIUSA);
  await registraVendita(portfolioId, ISIN_CHIUSO_CON_PREZZO, '2026-04-15', 50.0, QUANTITA_CHIUSA);

  // ─── 1. La preferenza di design va impostata prima della navigazione, così
  //         lo script di bootstrap la applica prima ancora che React monti
  //         (stesso pattern della spec di verifica e di
  //         US-051__quadro-riepilogo.spec.ts) ────────────────────────────────
  await page.addInitScript(() => {
    localStorage.setItem('portfolia-design', 'quadro');
  });
  await page.goto(`/portfolio/${portfolioId}`);
  await expect(page.getByRole('heading', { name: portfolioName })).toBeVisible({ timeout: 8000 });
  await expect(page.getByTestId('tabella-riepilogo')).toBeVisible({ timeout: 8000 });

  // Battuta di lettura: il Quadro Strumenti è il punto di partenza del flusso.
  await page.waitForTimeout(1000);

  // ─── 2. Il pannello Composizione mostra una sola fetta: quella della
  //         posizione aperta e valorizzata ───────────────────────────────────
  const composizione = page.getByTestId('composizione-portafoglio');
  await expect(composizione).toBeVisible();
  await composizione.scrollIntoViewIfNeeded();

  const fette = composizione.locator('circle[data-isin]');
  await expect(fette).toHaveCount(1);
  await expect(fette).toHaveAttribute('data-isin', ISIN_APERTO_CON_PREZZO);

  await page.waitForTimeout(1000);

  // ─── 3. La legenda concorda: una sola voce, mai il titolo chiuso ──────────
  const quote = composizione.locator('.quota');
  await expect(quote).toHaveCount(1);
  await expect(quote).toContainText(ISIN_APERTO_CON_PREZZO);
  await expect(composizione.getByText(ISIN_CHIUSO_CON_PREZZO)).toHaveCount(0);

  await page.waitForTimeout(1000);

  // ─── 4. La didascalia conta esattamente 1 inclusa e 1 esclusa per prezzo
  //         mancante — mai la posizione chiusa fra le escluse per prezzo ────
  const nota = composizione.locator('.nota-composizione');
  await expect(nota).toBeVisible();
  await expect(nota).toHaveText(
    'Calcolato sulle 1 posizione con prezzo — 1 posizione esclusa per prezzo mancante.',
  );

  await page.waitForTimeout(1200);

  // ─── 5. Contrasto visivo: la tabella «Posizioni chiuse» mostra ancora il
  //         titolo chiuso — è assente solo dal grafico, non dal portafoglio ──
  const tabellaChiuse = page.getByTestId('tabella-posizioni-chiuse');
  await tabellaChiuse.scrollIntoViewIfNeeded();
  await expect(tabellaChiuse).toBeVisible();
  await expect(page.getByTestId(`posizione-chiusa-${ISIN_CHIUSO_CON_PREZZO}`)).toBeVisible();

  // Pausa finale: la tabella «Posizioni chiuse», a contrasto del grafico
  // appena mostrato, resta visibile nel video.
  await page.waitForTimeout(1500);
});
