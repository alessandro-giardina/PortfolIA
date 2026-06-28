/**
 * US-014: Calcolare il valore attuale totale del portafoglio
 *
 * Scenario demo (con video, salvato in docs/test-results/US-014/):
 *   crea portafoglio via API, aggiunge posizione per ISIN con prezzo in cache
 *   (IE00BJRHVJ28 — Wellington Euro HY Bond, presente in securities DB), apre
 *   scheda Riepilogo, verifica che il riquadro valore-totale-portafoglio sia
 *   visibile con un valore EUR numerico positivo.
 *
 * Scenario dati mancanti (senza video):
 *   crea portafoglio con posizione per IT0003128367 (ENEL — ISIN reale e valido
 *   ma non presente nell'archivio securities del server), apre scheda Riepilogo,
 *   verifica che il riquadro mostri "EUR –" con nota esplicativa e NON mostri
 *   un numero inventato.
 */
import { test, expect, request } from '@playwright/test';

const BASE_API = 'http://localhost:3200';

// ---------------------------------------------------------------------------
// Helpers API
// ---------------------------------------------------------------------------

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
  quantity: number,
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

// ---------------------------------------------------------------------------
// Scenario demo (con video) — docs/test-results/US-014/
// ---------------------------------------------------------------------------

const demoTest = test.extend<object>({});
demoTest.use({
  video: 'on',
  launchOptions: { slowMo: 300 },
  viewport: { width: 1280, height: 720 },
});

demoTest(
  'demo: apre scheda Riepilogo e vede il valore attuale totale del portafoglio in EUR',
  async ({ page }) => {
    const portfolioName = `Demo Valore Totale ${Date.now()}`;
    const portfolioId = await createPortfolio(portfolioName);

    try {
      // Aggiunge posizione per IE00BJRHVJ28 (Wellington Euro HY Bond, seed nel DB con prezzo corrente)
      await addPosition(portfolioId, 'IE00BJRHVJ28', '2026-01-10', 13.0, 200);

      // Naviga al portafoglio
      await page.goto(`/portfolio/${portfolioId}`);
      await expect(page.getByRole('heading', { name: portfolioName })).toBeVisible({ timeout: 8000 });

      // Clicca sulla scheda Riepilogo
      await page.locator('nav.linguette a', { hasText: 'Riepilogo' }).click();

      // Il riquadro valore totale deve essere visibile
      const riquadro = page.getByTestId('valore-totale-portafoglio');
      await expect(riquadro).toBeVisible({ timeout: 10000 });

      // Deve contenere il testo "EUR"
      await expect(riquadro).toContainText('EUR');

      // Il testo dell'etichetta deve essere visibile
      await expect(riquadro).toContainText('Valore attuale totale');

      // Il valore non deve essere il trattino (–), perché IE00BJRHVJ28 ha prezzo in cache
      const cifra = riquadro.locator('.cifra-totale');
      await expect(cifra).not.toContainText('–');

      // Pausa finale per rendere lo stato visibile nel video
      await page.waitForTimeout(1500);
    } finally {
      await deletePortfolio(portfolioId);
    }
  },
);

// ---------------------------------------------------------------------------
// Scenario dati mancanti (senza video)
// ---------------------------------------------------------------------------

test('dati mancanti: ISIN senza prezzo in cache mostra EUR – senza numero inventato', async ({ page }) => {
  const portfolioName = `Missing Price ${Date.now()}`;
  // ISIN reale e valido (ENEL) ma non presente nell'archivio securities del server
  const missingPriceIsin = 'IT0003128367';
  const portfolioId = await createPortfolio(portfolioName);

  try {
    // Aggiunge posizione per ISIN non presente in archivio (nessun prezzo)
    await addPosition(portfolioId, missingPriceIsin, '2026-01-10', 6.5, 100);

    // Naviga al portafoglio → scheda Riepilogo
    await page.goto(`/portfolio/${portfolioId}`);
    await expect(page.getByRole('heading', { name: portfolioName })).toBeVisible({ timeout: 8000 });

    await page.locator('nav.linguette a', { hasText: 'Riepilogo' }).click();

    // Il riquadro deve essere visibile
    const riquadro = page.getByTestId('valore-totale-portafoglio');
    await expect(riquadro).toBeVisible({ timeout: 10000 });

    // Con nessun prezzo disponibile, il blocco cifra deve mostrare il trattino
    const cifra = riquadro.locator('.cifra-totale');
    await expect(cifra).toContainText('–');

    // La nota mancante deve essere visibile con testo esplicativo
    const notaMancante = riquadro.locator('.nota-mancante');
    await expect(notaMancante).toBeVisible();

    // Non deve contenere un numero EUR positivo (il valore 650 in questo caso)
    await expect(cifra).not.toContainText('650');
    await expect(cifra).not.toContainText('6.5');
  } finally {
    await deletePortfolio(portfolioId);
  }
});
