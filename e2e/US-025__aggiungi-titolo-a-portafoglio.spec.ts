import { test, expect } from './support/fixtures.js';
import { TITOLO_US_025 } from './support/titoli.js';

// Demo test with video:
// Nota: `outputDir` non è un'opzione valida di `test.use()` — vive solo a livello di
// progetto/config e veniva quindi ignorata in silenzio. Rimossa per non suggerire
// una destinazione che non era mai stata applicata.
const demoTest = test.extend<object>({});
demoTest.use({
  video: 'on',
  launchOptions: { slowMo: 300 },
  viewport: { width: 1280, height: 720 },
});

demoTest('demo: aggiungi titolo ricercato a portafoglio', async ({ page, archivio }) => {
  // Il titolo è seminato in cache con un recupero "appena avvenuto": la ricerca
  // risponde dall'archivio e non contatta la fonte reale. Qui la ricerca è solo il
  // mezzo per arrivare al dialog, non l'oggetto della prova.
  archivio.seminaTitolo(TITOLO_US_025.isin, TITOLO_US_025.campi);

  const { id: portfolioId } = await archivio.creaPortafoglio('Demo Portafoglio');

  // L'elenco è quello reale: da US-027 il dialog scorre e i bottoni restano
  // ancorati in fondo, quindi la presenza dei portafogli degli altri worker non
  // rende più irraggiungibile il pulsante "Conferma".
  await page.goto('/ricerca');
  await page.fill('#isin', TITOLO_US_025.isin);
  await page.click('button[type="submit"]');

  await page.waitForSelector('[data-testid="btn-aggiungi-portafoglio"]', { timeout: 30000 });
  await page.click('[data-testid="btn-aggiungi-portafoglio"]');

  await page.waitForSelector('[role="dialog"]');
  await page.click(`[data-testid="portafoglio-option-${portfolioId}"]`);
  await page.click('[data-testid="btn-conferma-dialog"]');

  await page.waitForURL(`**/portfolio/${portfolioId}`);

  await expect(page.getByTestId('input-isin')).toHaveValue(TITOLO_US_025.isin);
  await expect(page.getByTestId('input-prezzo')).not.toHaveValue('');

  await page.waitForTimeout(1500);
});

// TASK-06 — Zero-portfolios scenario (no video)
test('scenario: nessun portafoglio disponibile mostra empty state nel dialog', async ({ page, archivio }) => {
  archivio.seminaTitolo(TITOLO_US_025.isin, TITOLO_US_025.campi);

  // Intercept the portfolios API to simulate zero portfolios (avoids touching real data)
  await page.route('**/api/portfolios', (route) => {
    if (route.request().method() === 'GET') {
      void route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    } else {
      void route.continue();
    }
  });

  await page.goto('/ricerca');
  await page.fill('#isin', TITOLO_US_025.isin);
  await page.click('button[type="submit"]');

  await page.waitForSelector('[data-testid="btn-aggiungi-portafoglio"]', { timeout: 30000 });
  await page.click('[data-testid="btn-aggiungi-portafoglio"]');

  await page.waitForSelector('[role="dialog"]');

  await expect(page.getByTestId('msg-nessun-portafoglio')).toBeVisible();
  await expect(page.getByTestId('btn-conferma-dialog')).not.toBeVisible();
});

// TASK-07 — Close dialog without navigating (no video)
test('scenario: annulla dialog non naviga e mantiene la pagina di ricerca', async ({ page, archivio }) => {
  archivio.seminaTitolo(TITOLO_US_025.isin, TITOLO_US_025.campi);

  // Il portafoglio non serve al test per id: serve perché il dialog abbia almeno
  // un'opzione selezionabile. Senza, lo scenario scivolerebbe in silenzio sul
  // percorso "nessun portafoglio" e non verificherebbe più l'annullamento.
  await archivio.creaPortafoglio('Test Portafoglio');

  await page.goto('/ricerca');
  await page.fill('#isin', TITOLO_US_025.isin);
  await page.click('button[type="submit"]');

  await page.waitForSelector('[data-testid="btn-aggiungi-portafoglio"]', { timeout: 30000 });
  await page.click('[data-testid="btn-aggiungi-portafoglio"]');

  await page.waitForSelector('[role="dialog"]');
  await page.click('[data-testid="btn-annulla-dialog"]');

  await expect(page.locator('[role="dialog"]')).not.toBeVisible();
  await expect(page.getByTestId('btn-aggiungi-portafoglio')).toBeVisible();
  await expect(page).toHaveURL(/\/ricerca$/);
});
