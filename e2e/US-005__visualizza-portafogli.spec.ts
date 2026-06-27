import { test, expect, request } from '@playwright/test';

const BASE_API = 'http://localhost:3200';

async function createPortfolio(name: string) {
  const ctx = await request.newContext();
  const res = await ctx.post(`${BASE_API}/api/portfolios`, { data: { name } });
  const data = await res.json();
  await ctx.dispose();
  return data;
}


test.describe('US-005 — Visualizzazione portafogli', () => {

  test('stato vuoto: messaggio visibile senza portafogli', async ({ page, request: apiRequest }) => {
    // Verify the API returns no portfolios before testing empty state.
    // This test requires a fresh DB — if portfolios already exist from previous runs,
    // the empty state will not be visible. The test is skipped dynamically in that case.
    const apiRes = await apiRequest.get(`${BASE_API}/api/portfolios`);
    const existing = await apiRes.json() as Array<unknown>;
    if (existing.length > 0) {
      test.skip(true, 'DB non vuoto — stato vuoto non testabile senza reset endpoint');
      return;
    }

    await page.goto('/');
    await expect(page.getByText('Caricamento portafogli')).not.toBeVisible({ timeout: 5000 }).catch(() => {});
    await expect(page.getByText('Il registro è ancora vuoto')).toBeVisible({ timeout: 8000 });
    await expect(page.getByText('Apri il tuo primo conto a mastro')).toBeVisible();
  });

  test('lista portafogli: portafoglio creato via API compare nella lista', async ({ page }) => {
    const nome = `Test-${Date.now()}`;
    await createPortfolio(nome);

    await page.goto('/');
    await expect(page.getByText('Caricamento portafogli')).not.toBeVisible({ timeout: 5000 }).catch(() => {});
    await expect(page.getByText(nome)).toBeVisible({ timeout: 8000 });
    await expect(page.getByText('clicca un conto per aprirne il dettaglio')).toBeVisible();
  });

});

