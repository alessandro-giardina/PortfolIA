/**
 * US-026: Aprire il portafoglio sulla scheda Riepilogo — scenari funzionali.
 *
 * Senza video e senza rallentamento: lo scenario demo con video vive in
 * US-026__apre-scheda-riepilogo.spec.ts.
 *
 * - portafoglio vuoto → apre comunque su Riepilogo, con il rimando a "Carico titoli";
 * - passaggio manuale fra le due schede in entrambe le direzioni;
 * - regressione US-025 → dalla ricerca titoli si apre su "Carico titoli" pre-compilato.
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

async function fetchPortfolio(id: number): Promise<unknown> {
  const ctx = await request.newContext();
  const res = await ctx.get(`${BASE_API}/api/portfolios/${id}`);
  const data: unknown = await res.json();
  await ctx.dispose();
  return data;
}

async function deletePortfolio(id: number): Promise<void> {
  const ctx = await request.newContext();
  await ctx.delete(`${BASE_API}/api/portfolios/${id}`);
  await ctx.dispose();
}

/** Linguetta della barra schede, per nome. */
function linguetta(page: import('@playwright/test').Page, nome: string) {
  return page.locator('nav.linguette a', { hasText: nome });
}

/** Riga cliccabile del portafoglio nell'elenco della schermata principale. */
function rigaPortafoglio(page: import('@playwright/test').Page, nome: string) {
  return page.locator('tr.cliccabile', { hasText: nome });
}

// ---------------------------------------------------------------------------
// Portafoglio vuoto
// ---------------------------------------------------------------------------

test('portafoglio vuoto: si apre su Riepilogo con il rimando alla scheda Carico titoli', async ({ page }) => {
  const portfolioName = `Vuoto Apertura ${Date.now()}`;
  const portfolioId = await createPortfolio(portfolioName);

  try {
    await page.goto('/');
    await expect(rigaPortafoglio(page, portfolioName)).toBeVisible({ timeout: 8000 });

    await rigaPortafoglio(page, portfolioName).click();

    await expect(linguetta(page, 'Riepilogo')).toHaveClass(/attiva/, { timeout: 8000 });

    // Stato vuoto già previsto da US-017, con il rimando a "Carico titoli"
    const statoVuoto = page.getByTestId('riepilogo-vuoto');
    await expect(statoVuoto).toBeVisible({ timeout: 8000 });
    await expect(statoVuoto).toContainText('Carico titoli');

    // Nessuna tabella titoli per un portafoglio senza posizioni
    await expect(page.getByTestId('tabella-riepilogo')).not.toBeVisible();
  } finally {
    await deletePortfolio(portfolioId);
  }
});

// ---------------------------------------------------------------------------
// Passaggio manuale fra le schede
// ---------------------------------------------------------------------------

test('schede: il passaggio manuale Riepilogo ↔ Carico titoli funziona in entrambe le direzioni', async ({ page }) => {
  const portfolioName = `Toggle Schede ${Date.now()}`;
  const portfolioId = await createPortfolio(portfolioName);

  try {
    await addPosition(portfolioId, 'IE00B4L5Y983', '2026-03-15', 89.0, 40);

    await page.goto('/');
    await expect(rigaPortafoglio(page, portfolioName)).toBeVisible({ timeout: 8000 });
    await rigaPortafoglio(page, portfolioName).click();

    // Apertura su Riepilogo
    await expect(linguetta(page, 'Riepilogo')).toHaveClass(/attiva/, { timeout: 8000 });
    await expect(page.getByTestId('tabella-riepilogo')).toBeVisible({ timeout: 8000 });

    // Riepilogo → Carico titoli
    await linguetta(page, 'Carico titoli').click();
    await expect(linguetta(page, 'Carico titoli')).toHaveClass(/attiva/);
    await expect(linguetta(page, 'Riepilogo')).not.toHaveClass(/attiva/);
    await expect(page.getByTestId('input-isin')).toBeVisible();

    // Carico titoli → Riepilogo
    await linguetta(page, 'Riepilogo').click();
    await expect(linguetta(page, 'Riepilogo')).toHaveClass(/attiva/);
    await expect(linguetta(page, 'Carico titoli')).not.toHaveClass(/attiva/);
    await expect(page.getByTestId('tabella-riepilogo')).toBeVisible();
    await expect(page.getByTestId('input-isin')).not.toBeVisible();
  } finally {
    await deletePortfolio(portfolioId);
  }
});

// ---------------------------------------------------------------------------
// Regressione US-025
// ---------------------------------------------------------------------------

test('regressione US-025: dalla ricerca titoli si apre su Carico titoli con il modulo pre-compilato', async ({ page }) => {
  const portfolioId = await createPortfolio(`Regressione Carico ${Date.now()}`);

  try {
    // Il dialog di scelta portafoglio non gestisce elenchi lunghi: è centrato in un
    // overlay a tutto schermo senza scroll, quindi con molti portafogli in archivio
    // le opzioni in fondo escono dal viewport e non sono cliccabili. Qui interessa la
    // navigazione con lo stato di prefill, non il picker: riduciamo l'elenco mostrato
    // dal dialog al solo portafoglio di prova, con il suo record reale.
    const record = await fetchPortfolio(portfolioId);
    await page.route('**/api/portfolios', (route) => {
      if (route.request().method() === 'GET') {
        void route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([record]),
        });
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
    await page.click(`[data-testid="portafoglio-option-${portfolioId}"]`);
    await page.click('[data-testid="btn-conferma-dialog"]');

    await page.waitForURL(`**/portfolio/${portfolioId}`);

    // Con un carico da registrare la scheda attiva resta "Carico titoli"
    await expect(linguetta(page, 'Carico titoli')).toHaveClass(/attiva/, { timeout: 8000 });
    await expect(linguetta(page, 'Riepilogo')).not.toHaveClass(/attiva/);

    // Modulo pre-compilato con i dati del titolo cercato
    await expect(page.getByTestId('input-isin')).toHaveValue('IE00B4L5Y983');
    await expect(page.getByTestId('input-prezzo')).not.toHaveValue('');

    // Dopo un ricaricamento lo stato di prefill è già stato ripulito, quindi
    // l'apertura ricade su Riepilogo come per qualunque altro accesso diretto.
    await page.reload();
    await expect(linguetta(page, 'Riepilogo')).toHaveClass(/attiva/, { timeout: 8000 });
    await expect(page.getByTestId('input-isin')).not.toBeVisible();
  } finally {
    await deletePortfolio(portfolioId);
  }
});
