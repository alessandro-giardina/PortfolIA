/**
 * US-011: Aggiungere un titolo a un portafoglio con un carico
 *
 * Scenario demo (con video): apri portafoglio → Carico titoli → compila form
 *   → submit → posizione compare in tabella.
 * Scenario validazione: prezzo zero e ISIN corto → messaggi errore inline.
 * Scenario persistenza: inserisci carico → ricarica pagina → posizione ancora visibile.
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
  'demo: aggiungi posizione in un portafoglio e vedi comparire nella tabella',
  async ({ page }) => {
    const portfolioName = `Demo Carico ${Date.now()}`;
    const portfolioId = await createPortfolio(portfolioName);

    try {
      // 1. Naviga alla scheda Carico titoli
      await page.goto(`/portfolio/${portfolioId}`);
      await expect(page.getByRole('heading', { name: portfolioName })).toBeVisible({ timeout: 8000 });

      // La scheda "Carico titoli" è quella attiva di default
      await expect(page.getByTestId('input-isin')).toBeVisible();

      // 2. Compila il form
      await page.getByTestId('input-isin').fill('IE00B4L5Y983');
      await page.getByTestId('input-data').fill('2026-03-15');
      await page.getByTestId('input-prezzo').fill('89.42');
      await page.getByTestId('input-quantita').fill('40');

      // 3. Submit
      await page.getByTestId('btn-iscrive').click();

      // 4. Banner successo visibile
      await expect(page.getByTestId('avviso-successo')).toBeVisible({ timeout: 8000 });

      // 5. La posizione compare nella tabella
      await expect(page.getByTestId('tabella-posizioni')).toContainText('IE00B4L5Y983');
      await expect(page.getByTestId('contatore-posizioni')).toContainText('1 posizione');

      // Pausa finale per il video — stato con posizione iscritta
      await page.waitForTimeout(1500);
    } finally {
      await deletePortfolio(portfolioId);
    }
  }
);

// ─── Scenario validazione (senza video) ───────────────────────────────────────

test('validazione: ISIN troppo corto e prezzo zero → messaggi errore inline', async ({ page }) => {
  const portfolioName = `Validazione ${Date.now()}`;
  const portfolioId = await createPortfolio(portfolioName);

  try {
    await page.goto(`/portfolio/${portfolioId}`);
    await expect(page.getByTestId('input-isin')).toBeVisible({ timeout: 8000 });

    // Inserisce ISIN corto, data ok, prezzo 0, quantità ok
    await page.getByTestId('input-isin').fill('IE00BJ');
    await page.getByTestId('input-data').fill('2026-03-15');
    await page.getByTestId('input-prezzo').fill('0');
    await page.getByTestId('input-quantita').fill('10');

    await page.getByTestId('btn-iscrive').click();

    // Errore ISIN
    await expect(page.getByTestId('err-isin')).toBeVisible();
    await expect(page.getByTestId('err-isin')).toContainText(/ISIN/i);

    // Errore prezzo
    await expect(page.getByTestId('err-prezzo')).toBeVisible();
    await expect(page.getByTestId('err-prezzo')).toContainText(/prezzo/i);

    // Banner errore sommario
    await expect(page.getByTestId('banner-errore')).toBeVisible();

    // Nessuna posizione iscritta
    await expect(page.getByTestId('tabella-posizioni')).toContainText('Nessuna posizione iscritta');
  } finally {
    await deletePortfolio(portfolioId);
  }
});

test('validazione: data assente → messaggio errore data', async ({ page }) => {
  const portfolioName = `Validazione Data ${Date.now()}`;
  const portfolioId = await createPortfolio(portfolioName);

  try {
    await page.goto(`/portfolio/${portfolioId}`);
    await expect(page.getByTestId('input-isin')).toBeVisible({ timeout: 8000 });

    await page.getByTestId('input-isin').fill('IE00B4L5Y983');
    // non compila data
    await page.getByTestId('input-prezzo').fill('89.42');
    await page.getByTestId('input-quantita').fill('40');

    await page.getByTestId('btn-iscrive').click();

    await expect(page.getByTestId('err-data')).toBeVisible();
    await expect(page.getByTestId('err-data')).toContainText(/data/i);
  } finally {
    await deletePortfolio(portfolioId);
  }
});

// ─── Scenario persistenza (senza video) ───────────────────────────────────────

test('persistenza: posizione iscritta è ancora visibile dopo ricarica pagina', async ({ page }) => {
  const portfolioName = `Persistenza ${Date.now()}`;
  const portfolioId = await createPortfolio(portfolioName);

  try {
    await page.goto(`/portfolio/${portfolioId}`);
    await expect(page.getByTestId('input-isin')).toBeVisible({ timeout: 8000 });

    // Inserisce carico valido
    await page.getByTestId('input-isin').fill('IE00B3RBWM25');
    await page.getByTestId('input-data').fill('2026-06-01');
    await page.getByTestId('input-prezzo').fill('115.20');
    await page.getByTestId('input-quantita').fill('20');
    await page.getByTestId('btn-iscrive').click();

    // Aspetta banner successo
    await expect(page.getByTestId('avviso-successo')).toBeVisible({ timeout: 8000 });

    // Verifica che la posizione compaia
    await expect(page.getByTestId('tabella-posizioni')).toContainText('IE00B3RBWM25');

    // Ricarica la pagina (re-fetch API)
    await page.reload();

    // Torna sulla scheda Carico titoli (già attiva di default)
    await expect(page.getByTestId('input-isin')).toBeVisible({ timeout: 8000 });

    // La posizione è ancora visibile nella tabella (persistenza)
    await expect(page.getByTestId('tabella-posizioni')).toContainText('IE00B3RBWM25');
    await expect(page.getByTestId('contatore-posizioni')).toContainText('1 posizione');
  } finally {
    await deletePortfolio(portfolioId);
  }
});
