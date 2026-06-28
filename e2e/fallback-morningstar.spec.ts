/**
 * Scenari US-022: fallback su MorningStar quando Borsa Italiana non trova il titolo.
 *
 * TASK-05 — Scenario demo (con video): ISIN trovato solo su MorningStar.
 *   - L'API risponde con dataSource='morningstar'.
 *   - Il badge "MorningStar (backup)" è visibile nel blocco fonte-prezzo.
 *
 * TASK-06 — Scenario senza video: nessuna fonte disponibile → 404.
 *   - L'API risponde con 404.
 *   - Il timbro "Dato non disponibile" è visibile senza errore bloccante.
 *
 * Tutte le chiamate a /api/securities/:isin sono intercettate a livello di rete.
 */
import { test, expect } from '@playwright/test';

// ─── Fixture ────────────────────────────────────────────────────────────────

const ETF_MORNINGSTAR = {
  security: {
    isin: 'IE00BJRHVJ28',
    name: 'iShares MSCI EM IMI ESG Screened UCITS ETF',
    price: 5.42,
    ticker: 'EMIM',
    instrumentType: 'ETF azionario',
    totalAnnualFees: '0,18% (TER)',
    currency: 'EUR',
    issuer: 'iShares (BlackRock)',
    segment: null,
    dividendPolicy: 'ad accumulazione',
  },
  fromCache: false,
  lastFetchedAt: 1782547200,
  dataSource: 'morningstar',
};

// ─── TASK-05: Scenario demo — ISIN trovato su MorningStar (backup) ───────────

test.describe('demo: ISIN trovato su MorningStar come fonte di backup', () => {
  test.use({
    video: 'on',
    launchOptions: { slowMo: 300 },
    viewport: { width: 1280, height: 720 },
  });

  test('demo: badge MorningStar (backup) visibile per ISIN non su Borsa Italiana', async ({ page }) => {
    await page.route('**/api/securities/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ETF_MORNINGSTAR),
      });
    });

    // Stato iniziale: dashboard del libro mastro.
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Libro Mastro' })).toBeVisible({ timeout: 8000 });

    // L'utente naviga alla Ricerca titoli.
    await page.getByRole('link', { name: 'Ricerca titoli' }).click();
    await expect(page).toHaveURL('/ricerca');
    await expect(page.getByRole('heading', { name: /Cerca un titolo/ })).toBeVisible();

    // Inserisce un ISIN che Borsa Italiana non conosce.
    await page.getByLabel('Codice ISIN del titolo').fill('IE00BJRHVJ28');

    // Avvia il recupero.
    await page.getByRole('button', { name: 'Recupera anagrafica' }).click();

    // I dati del titolo sono visibili (recuperati dal backup MorningStar).
    await expect(page.getByText('Titolo trovato')).toBeVisible({ timeout: 8000 });
    await expect(page.getByText('iShares MSCI EM IMI ESG Screened UCITS ETF').first()).toBeVisible();

    // Il badge MorningStar (backup) è esplicitamente visibile.
    await expect(page.getByText('MorningStar (backup)')).toBeVisible();

    // Trattiene lo stato finale per la registrazione video.
    await page.waitForTimeout(1500);
  });
});

// ─── TASK-06: Nessuna fonte disponibile → "Dato non disponibile" ─────────────

test('nessuna fonte disponibile → timbro "Dato non disponibile" senza errore bloccante', async ({ page }) => {
  await page.route('**/api/securities/**', async (route) => {
    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Nessuna corrispondenza disponibile per IE00BJRHVJ28.' }),
    });
  });

  await page.goto('/ricerca');
  await page.getByLabel('Codice ISIN del titolo').fill('IE00BJRHVJ28');
  await page.getByRole('button', { name: 'Recupera anagrafica' }).click();

  // Il timbro "Dato non disponibile" è visibile.
  await expect(page.getByText('Dato non disponibile').first()).toBeVisible({ timeout: 8000 });

  // La pagina non mostra un errore bloccante (502 o eccezione).
  await expect(page.getByText('La fonte ufficiale non è al momento raggiungibile')).not.toBeVisible();
  await expect(page.getByText('Errore inatteso')).not.toBeVisible();
});
