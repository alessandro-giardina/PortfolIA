import { test, expect } from '@playwright/test';

// Demo scenario — video enabled (top-level test.use required by Playwright)
// Records the Demonstrates flow: create a portfolio, verify in list, reload, verify persistence.
test.use({
  video: 'on',
  viewport: { width: 1280, height: 720 },
  launchOptions: { slowMo: 300 },
});

test('demo__crea-portafoglio-principale', async ({ page }) => {
  // Use a unique name to avoid conflicts with existing data across runs
  const portfolioName = `Portafoglio Demo ${Date.now()}`;

  await page.goto('/');

  // Wait for the form to be visible (app loaded, backend reachable)
  await expect(page.getByRole('form', { name: 'Crea portafoglio' })).toBeVisible();

  // Fill and submit
  await page.getByLabel('Denominazione del conto').fill(portfolioName);
  await page.getByRole('button', { name: 'Registra a mastro' }).click();

  // Portfolio appears in the list
  await expect(page.getByText(portfolioName)).toBeVisible();

  // Reload — persistence check
  await page.reload();
  await expect(page.getByText(portfolioName)).toBeVisible();

  // Hold final state visible for 1.5s
  await page.waitForTimeout(1500);
});
