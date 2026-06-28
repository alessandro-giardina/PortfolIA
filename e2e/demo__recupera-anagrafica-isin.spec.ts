/**
 * Demo scenario US-007 (campo "Dimostra"): l'utente apre la Ricerca per ISIN,
 * inserisce un ISIN valido e visualizza la scheda anagrafica completa con i dati
 * ufficiali recuperati da Borsa Italiana.
 *
 * Le risposte di /api/securities/:isin sono intercettate a livello di rete: lo
 * scraping live della fonte NON viene colpito. Registrazione video limitata a
 * questo file (lo scenario demo).
 */
import { test, expect } from '@playwright/test';

test.use({
  video: 'on',
  launchOptions: { slowMo: 300 },
  viewport: { width: 1280, height: 720 },
});

const ANAGRAFICA_COMPLETA = {
  security: {
    isin: 'IE00BMVB5S82',
    name: 'iShares Core MSCI World UCITS ETF',
    price: 94.55,
    ticker: 'SWDA',
    instrumentType: 'ETF azionario',
    totalAnnualFees: '0,20% (TER)',
    currency: 'EUR',
    issuer: 'iShares (BlackRock)',
    segment: 'ETFplus',
    dividendPolicy: 'ad accumulazione',
  },
  fromCache: false,
  lastFetchedAt: 1782547200, // 2026-06-27 (deterministico)
};

test('demo: recupera e visualizza l’anagrafica di un titolo per ISIN', async ({ page }) => {
  await page.route('**/api/securities/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(ANAGRAFICA_COMPLETA),
    });
  });

  // Stato iniziale: dashboard del libro mastro.
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Libro Mastro' })).toBeVisible({ timeout: 8000 });

  // L'utente apre la Ricerca titoli dalla navigazione.
  await page.getByRole('link', { name: 'Ricerca titoli' }).click();
  await expect(page).toHaveURL('/ricerca');
  await expect(page.getByRole('heading', { name: /Cerca un titolo/ })).toBeVisible();

  // Inserisce l'ISIN.
  await page.getByLabel('Codice ISIN del titolo').fill('IE00BMVB5S82');

  // Avvia il recupero.
  await page.getByRole('button', { name: 'Recupera anagrafica' }).click();

  // Vede l'esito e la scheda anagrafica completa.
  await expect(page.getByText('Titolo trovato')).toBeVisible({ timeout: 8000 });
  await expect(page.getByText('iShares Core MSCI World UCITS ETF').first()).toBeVisible();
  await expect(page.getByText('SWDA')).toBeVisible();
  await expect(page.getByText('€ 94,55').first()).toBeVisible();
  await expect(page.getByText('Prezzo rilevato il')).toBeVisible();

  // Trattiene lo stato finale per la registrazione.
  await page.waitForTimeout(1500);
});
