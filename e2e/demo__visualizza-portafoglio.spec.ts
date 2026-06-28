/**
 * Demo scenario US-005: navigazione dashboard → dettaglio portafoglio → ritorno.
 * Video recording scoped to this file only (top-level test.use is required for video/launchOptions).
 */
import { test, expect, request } from '@playwright/test';

test.use({
  video: 'on',
  launchOptions: { slowMo: 300 },
  viewport: { width: 1280, height: 720 },
});

const BASE_API = 'http://localhost:3200';

async function createPortfolio(name: string) {
  const ctx = await request.newContext();
  const res = await ctx.post(`${BASE_API}/api/portfolios`, { data: { name } });
  const data = await res.json();
  await ctx.dispose();
  return data;
}

test('demo: apre dashboard, seleziona portafoglio, vede dettaglio, torna indietro', async ({ page }) => {
  const nome = `Demo-${Date.now()}`;
  await createPortfolio(nome);

  // Open dashboard
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Libro Mastro' })).toBeVisible({ timeout: 8000 });

  // Wait for portfolio to appear in list
  await expect(page.getByText(nome)).toBeVisible({ timeout: 8000 });

  // Click the portfolio link
  await page.getByText(nome).click();

  // Should be on detail page
  await expect(page).toHaveURL(/\/portfolio\/\d+/);
  await expect(page.getByRole('heading', { name: nome, exact: true })).toBeVisible({ timeout: 8000 });
  await expect(page.getByText('Vista in preparazione')).toBeVisible();

  // Hold end state visible for recording (intentional pause — not a race workaround)
  const tornaIndietro = page.getByRole('link', { name: /Torna all.elenco portafogli/ });
  await expect(tornaIndietro).toBeVisible();
  await page.waitForTimeout(1500);

  // Return to dashboard
  await tornaIndietro.click();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { name: 'Libro Mastro' })).toBeVisible({ timeout: 8000 });
  // Final hold for the recording to capture the dashboard state
  await page.waitForTimeout(1500);
});
