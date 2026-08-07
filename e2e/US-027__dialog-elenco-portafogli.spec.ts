/**
 * US-027: il dialog di scelta portafoglio non sfonda più la finestra.
 *
 * Scenari di regressione senza video né rallentamento: la demo con registrazione
 * vive in US-027__scorre-elenco-portafogli.spec.ts.
 *
 * Il file è **ermetico**: non scrive nulla in archivio. Sia l'anagrafica del titolo
 * sia l'elenco portafogli arrivano da `route.fulfill()`.
 *  - L'anagrafica, perché la regola "un ISIN seminabile per file spec" (support/titoli.ts)
 *    assegna l'unico ISIN di questa spec al file demo. `TITOLO_US_027` è comunque
 *    importato — ma solo per *leggerne* i campi e servirli dalla rete: la regola
 *    vincola chi scrive in cache, e qui non ci si scrive.
 *  - L'elenco, perché qui la *lunghezza* è l'oggetto della prova: i file spec girano in
 *    parallelo su worker distinti e l'archivio reale contiene, in quell'istante, anche i
 *    portafogli degli altri test. Con l'elenco reale lo scenario "pochi portafogli" non
 *    potrebbe mai essere pochi per davvero. È una simulazione di stato, non l'aggiramento
 *    di un difetto: che il dialog regga l'elenco *reale* lo verificano la demo di US-027 e
 *    i due scenari di US-025.
 */
// Nessun accesso all'archivio, quindi nessun bisogno della fixture di US-029:
// qui basta il `test` di Playwright, come negli altri file spec ermetici.
import { test, expect, type Page } from '@playwright/test';
import { TITOLO_US_027 } from './support/titoli.js';

const VIEWPORT = { width: 1280, height: 720 };

/** Padding dell'overlay: il riquadro non può superare la finestra meno questo, due volte. */
const RESPIRO_OVERLAY = 24;

test.use({ viewport: VIEWPORT });

// Stessa anagrafica di `TITOLO_US_027`, servita dalla rete invece che dalla cache.
// Deriva dalla costante condivisa e non da valori riscritti a mano: due descrizioni
// divergenti dello stesso ISIN sarebbero una trappola per chi un domani togliesse
// l'intercettazione.
const { isin: ISIN, campi: CAMPI } = TITOLO_US_027;

const ANAGRAFICA = {
  security: {
    isin: ISIN,
    name: CAMPI.name,
    price: CAMPI.price,
    ticker: CAMPI.ticker,
    instrumentType: CAMPI.instrument_type,
    totalAnnualFees: CAMPI.total_annual_fees,
    currency: CAMPI.currency,
    issuer: CAMPI.issuer,
    segment: CAMPI.segment,
    dividendPolicy: null,
  },
  fromCache: true,
  lastFetchedAt: 1786032000,
};

/** Elenco portafogli sintetico di `quanti` elementi, nel formato dell'API. */
function elencoDa(quanti: number): { id: number; name: string }[] {
  return Array.from({ length: quanti }, (_, i) => ({
    id: i + 1,
    name: `Portafoglio ${String(i + 1).padStart(2, '0')}`,
  }));
}

/** Porta il browser fino al dialog di scelta, con l'elenco portafogli indicato. */
async function apriDialog(page: Page, quanti: number): Promise<void> {
  await page.route('**/api/securities/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ANAGRAFICA),
    }),
  );
  await page.route('**/api/portfolios', (route) => {
    if (route.request().method() === 'GET') {
      void route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(elencoDa(quanti)),
      });
    } else {
      void route.continue();
    }
  });

  await page.goto('/ricerca');
  await page.getByLabel('Codice ISIN del titolo').fill(ISIN);
  await page.getByRole('button', { name: 'Recupera anagrafica' }).click();

  const bottoneAggiungi = page.getByTestId('btn-aggiungi-portafoglio');
  await expect(bottoneAggiungi).toBeVisible({ timeout: 8000 });
  await bottoneAggiungi.click();

  await expect(page.locator('[role="dialog"]')).toBeVisible();
  await expect(page.locator('[data-testid^="portafoglio-option-"]')).toHaveCount(quanti);
}

test('con pochi portafogli il dialog resta identico: nessuna barra di scorrimento', async ({
  page,
}) => {
  await apriDialog(page, 1);

  const corpo = page.getByTestId('dialog-corpo');
  const eccedenza = await corpo.evaluate((el) => el.scrollHeight - el.clientHeight);
  expect(eccedenza).toBeLessThanOrEqual(0);

  const riquadro = await page.locator('[role="dialog"]').boundingBox();
  expect(riquadro).not.toBeNull();
  expect(riquadro!.height).toBeLessThanOrEqual(VIEWPORT.height - 2 * RESPIRO_OVERLAY);
  expect(riquadro!.y).toBeGreaterThanOrEqual(0);

  // "Nessun cambio di aspetto" ha un valore misurabile: i 16px fra intestazione e
  // nota. È la distanza che il passaggio a contenitore flex rischia di alterare,
  // perché i margini dei figli non collassano più — l'assenza di scorrimento, da
  // sola, non se ne accorgerebbe.
  const intestazione = await page.locator('.dialog-intestazione').boundingBox();
  const nota = await page.locator('.nota-dialog').boundingBox();
  expect(intestazione).not.toBeNull();
  expect(nota).not.toBeNull();
  expect(Math.round(nota!.y - (intestazione!.y + intestazione!.height))).toBe(16);
});

test('con molti portafogli il dialog resta dentro la finestra e i bottoni raggiungibili', async ({
  page,
}) => {
  await apriDialog(page, 14);

  const riquadro = await page.locator('[role="dialog"]').boundingBox();
  expect(riquadro).not.toBeNull();
  expect(riquadro!.height).toBeLessThanOrEqual(VIEWPORT.height - 2 * RESPIRO_OVERLAY);
  expect(riquadro!.y).toBeGreaterThanOrEqual(0);

  // L'eccedenza è assorbita dallo scorrimento del corpo, non dalla crescita del riquadro
  const corpo = page.getByTestId('dialog-corpo');
  const eccedenza = await corpo.evaluate((el) => el.scrollHeight - el.clientHeight);
  expect(eccedenza).toBeGreaterThan(0);

  await expect(page.getByTestId('btn-annulla-dialog')).toBeInViewport();
  await expect(page.getByTestId('btn-conferma-dialog')).toBeInViewport();

  // Il clic sull'ultima riga, non solo il suo essere in viewport: `toBeInViewport()`
  // non vede le occlusioni, e la seconda faccia del difetto era proprio un'occlusione
  // (il footer del foglio dipinto sopra il dialog, risolta montandolo in un portale).
  // Qui l'elenco è controllato al 100%, quindi l'ultima riga è davvero l'ultima e la
  // prova è deterministica — cosa che nella demo, con l'archivio reale, non sarebbe.
  const ultimaRiga = page.locator('[data-testid^="portafoglio-option-"]').last();
  await ultimaRiga.scrollIntoViewIfNeeded();
  await ultimaRiga.click();
  await expect(ultimaRiga).toHaveAttribute('aria-selected', 'true');

  // Anche a elenco scorso fino in fondo i bottoni non si spostano
  await expect(page.getByTestId('btn-annulla-dialog')).toBeInViewport();
  await expect(page.getByTestId('btn-conferma-dialog')).toBeInViewport();
  await expect(page.getByTestId('btn-conferma-dialog')).toBeEnabled();
});
