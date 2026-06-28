/**
 * US-012: Inserire più carichi dello stesso titolo con prezzo medio di carico
 *
 * Scenario demo (con video): inserisci due carichi dello stesso ISIN a prezzi
 *   diversi → tabella aggregata mostra una riga con qty totale e avgLoadPrice
 *   ponderato corretto.
 * Scenario multi-ISIN: due ISIN diversi → due righe distinte nella tabella.
 * Scenario coerenza reload: dopo submit e reload, la riga aggregata è invariata.
 */
import { test, expect, request } from '@playwright/test';

const BASE_API = 'http://localhost:3200';

async function createPortfolio(name: string): Promise<number> {
  const ctx = await request.newContext();
  const res = await ctx.post(`${BASE_API}/api/portfolios`, { data: { name } });
  const data = (await res.json()) as { id: number };
  await ctx.dispose();
  return data.id;
}

async function addPosition(
  portfolioId: number,
  isin: string,
  loadDate: string,
  loadPrice: number,
  quantity: number
): Promise<void> {
  const ctx = await request.newContext();
  await ctx.post(`${BASE_API}/api/portfolios/${portfolioId}/positions`, {
    data: { isin, load_date: loadDate, load_price: loadPrice, quantity },
  });
  await ctx.dispose();
}

async function deletePortfolio(id: number): Promise<void> {
  const ctx = await request.newContext();
  await ctx.delete(`${BASE_API}/api/portfolios/${id}`);
  await ctx.dispose();
}

// ─── Scenario demo (con video) ────────────────────────────────────────────────

const demoTest = test.extend<object>({});
demoTest.use({
  video: 'on',
  launchOptions: { slowMo: 300 },
  viewport: { width: 1280, height: 720 },
});

demoTest(
  'demo: due carichi stesso ISIN → tabella aggregata mostra qty totale e prezzo medio ponderato',
  async ({ page }) => {
    const portfolioName = `Demo Multipli ${Date.now()}`;
    const portfolioId = await createPortfolio(portfolioName);

    try {
      // Stato iniziale: portafoglio vuoto
      await page.goto(`/portfolio/${portfolioId}`);
      await expect(page.getByRole('heading', { name: portfolioName })).toBeVisible({ timeout: 8000 });
      await expect(page.getByTestId('input-isin')).toBeVisible();

      // Primo carico: IE00B4L5Y983, 89.00 × 40
      await page.getByTestId('input-isin').fill('IE00B4L5Y983');
      await page.getByTestId('input-data').fill('2026-03-15');
      await page.getByTestId('input-prezzo').fill('89');
      await page.getByTestId('input-quantita').fill('40');
      await page.getByTestId('btn-iscrive').click();

      await expect(page.getByTestId('avviso-successo')).toBeVisible({ timeout: 8000 });

      // Secondo carico: stesso ISIN, prezzo diverso: 91.00 × 60
      await page.getByTestId('input-isin').fill('IE00B4L5Y983');
      await page.getByTestId('input-data').fill('2026-04-10');
      await page.getByTestId('input-prezzo').fill('91');
      await page.getByTestId('input-quantita').fill('60');
      await page.getByTestId('btn-iscrive').click();

      await expect(page.getByTestId('avviso-successo')).toBeVisible({ timeout: 8000 });

      // La tabella aggregata mostra UNA riga per ISIN
      const tabellaAggregata = page.getByTestId('tabella-posizioni');
      await expect(tabellaAggregata).toBeVisible();
      await expect(tabellaAggregata).toContainText('IE00B4L5Y983');

      // Quantità totale = 100
      await expect(tabellaAggregata).toContainText('100');

      // Prezzo medio ponderato = (89×40 + 91×60)/100 = 90.2000
      await expect(tabellaAggregata).toContainText('90.2000');

      // Contatore mostra 1 ISIN distinto
      await expect(page.getByTestId('contatore-posizioni')).toContainText('1');

      // Pausa finale per il video
      await page.waitForTimeout(1500);
    } finally {
      await deletePortfolio(portfolioId);
    }
  }
);

// ─── Scenario multi-ISIN (senza video) ───────────────────────────────────────

test('multi-ISIN: due ISIN diversi → due righe distinte nella tabella aggregata', async ({ page }) => {
  const portfolioName = `MultiISIN ${Date.now()}`;
  const portfolioId = await createPortfolio(portfolioName);

  try {
    // Inserisci due carichi con ISIN diversi via API
    await addPosition(portfolioId, 'IE00B4L5Y983', '2026-03-15', 89.0, 40);
    await addPosition(portfolioId, 'IE00B3RBWM25', '2026-03-20', 115.5, 20);

    await page.goto(`/portfolio/${portfolioId}`);
    await expect(page.getByTestId('input-isin')).toBeVisible({ timeout: 8000 });

    const tabellaAggregata = page.getByTestId('tabella-posizioni');
    await expect(tabellaAggregata).toContainText('IE00B4L5Y983');
    await expect(tabellaAggregata).toContainText('IE00B3RBWM25');

    // Due righe distinte (una per ISIN)
    await expect(page.getByTestId('summary-IE00B4L5Y983')).toBeVisible();
    await expect(page.getByTestId('summary-IE00B3RBWM25')).toBeVisible();

    // Contatore mostra 2 ISIN distinti
    await expect(page.getByTestId('contatore-posizioni')).toContainText('2');
  } finally {
    await deletePortfolio(portfolioId);
  }
});

// ─── Scenario coerenza reload (senza video) ───────────────────────────────────

test('coerenza reload: riga aggregata invariata dopo reload pagina', async ({ page }) => {
  const portfolioName = `Reload ${Date.now()}`;
  const portfolioId = await createPortfolio(portfolioName);

  try {
    // Inserisci carichi via API prima di navigare
    await addPosition(portfolioId, 'IE00B4L5Y983', '2026-03-15', 89.0, 40);
    await addPosition(portfolioId, 'IE00B4L5Y983', '2026-04-10', 91.0, 60);

    await page.goto(`/portfolio/${portfolioId}`);
    await expect(page.getByTestId('input-isin')).toBeVisible({ timeout: 8000 });

    // Verifica stato iniziale
    await expect(page.getByTestId('tabella-posizioni')).toContainText('90.2000');
    await expect(page.getByTestId('tabella-posizioni')).toContainText('100');

    // Ricarica la pagina
    await page.reload();
    await expect(page.getByTestId('input-isin')).toBeVisible({ timeout: 8000 });

    // La vista aggregata è invariata dopo reload
    await expect(page.getByTestId('tabella-posizioni')).toContainText('IE00B4L5Y983');
    await expect(page.getByTestId('tabella-posizioni')).toContainText('90.2000');
    await expect(page.getByTestId('tabella-posizioni')).toContainText('100');
    await expect(page.getByTestId('contatore-posizioni')).toContainText('1');
  } finally {
    await deletePortfolio(portfolioId);
  }
});
