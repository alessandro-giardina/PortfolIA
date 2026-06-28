import { test, expect, request } from '@playwright/test';

const BASE_API = 'http://localhost:3200';

async function createPortfolio(name: string): Promise<number> {
  const ctx = await request.newContext();
  const res = await ctx.post(`${BASE_API}/api/portfolios`, { data: { name } });
  const data = (await res.json()) as { id: number };
  await ctx.dispose();
  return data.id;
}

async function deletePortfolio(id: number): Promise<void> {
  const ctx = await request.newContext();
  await ctx.delete(`${BASE_API}/api/portfolios/${id}`);
  await ctx.dispose();
}


// Demo test with video:
const demoTest = test.extend<object>({});
demoTest.use({
  video: 'on',
  launchOptions: { slowMo: 300 },
  viewport: { width: 1280, height: 720 },
  outputDir: 'docs/test-results/US-025/',
});

demoTest('demo: aggiungi titolo ricercato a portafoglio', async ({ page }) => {
  const portfolioId = await createPortfolio(`Demo Portafoglio ${Date.now()}`);
  try {
    await page.goto('/ricerca');
    await page.fill('#isin', 'IE00B4L5Y983');
    await page.click('button[type="submit"]');

    await page.waitForSelector('[data-testid="btn-aggiungi-portafoglio"]', { timeout: 30000 });
    await page.click('[data-testid="btn-aggiungi-portafoglio"]');

    await page.waitForSelector('[role="dialog"]');
    await page.click(`[data-testid="portafoglio-option-${portfolioId}"]`);
    await page.click('[data-testid="btn-conferma-dialog"]');

    await page.waitForURL(`**/portfolio/${portfolioId}`);

    await expect(page.getByTestId('input-isin')).toHaveValue('IE00B4L5Y983');
    await expect(page.getByTestId('input-prezzo')).not.toHaveValue('');

    await page.waitForTimeout(1500);
  } finally {
    await deletePortfolio(portfolioId);
  }
});

// TASK-06 — Zero-portfolios scenario (no video)
test('scenario: nessun portafoglio disponibile mostra empty state nel dialog', async ({ page }) => {
  // Intercept the portfolios API to simulate zero portfolios (avoids touching real data)
  await page.route('**/api/portfolios', (route) => {
    if (route.request().method() === 'GET') {
      void route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    } else {
      void route.continue();
    }
  });

  await page.goto('/ricerca');
  await page.fill('#isin', 'IE00B4L5Y983');
  await page.click('button[type="submit"]');

  await page.waitForSelector('[data-testid="btn-aggiungi-portafoglio"]', { timeout: 30000 });
  await page.click('[data-testid="btn-aggiungi-portafoglio"]');

  await page.waitForSelector('[role="dialog"]');

  await expect(page.getByTestId('msg-nessun-portafoglio')).toBeVisible();
  await expect(page.getByTestId('btn-conferma-dialog')).not.toBeVisible();
});

// TASK-07 — Close dialog without navigating (no video)
test('scenario: annulla dialog non naviga e mantiene la pagina di ricerca', async ({ page }) => {
  const portfolioId = await createPortfolio(`Test Portafoglio ${Date.now()}`);
  try {
    await page.goto('/ricerca');
    await page.fill('#isin', 'IE00B4L5Y983');
    await page.click('button[type="submit"]');

    await page.waitForSelector('[data-testid="btn-aggiungi-portafoglio"]', { timeout: 30000 });
    await page.click('[data-testid="btn-aggiungi-portafoglio"]');

    await page.waitForSelector('[role="dialog"]');
    await page.click('[data-testid="btn-annulla-dialog"]');

    await expect(page.locator('[role="dialog"]')).not.toBeVisible();
    await expect(page.getByTestId('btn-aggiungi-portafoglio')).toBeVisible();
    await expect(page).toHaveURL(/\/ricerca$/);
  } finally {
    await deletePortfolio(portfolioId);
  }
});
