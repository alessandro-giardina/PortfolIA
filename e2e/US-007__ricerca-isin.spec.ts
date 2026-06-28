/**
 * Scenari US-007 non-demo (senza registrazione video):
 * - ISIN non trovato → messaggio trasparente "Dato non disponibile".
 * - Guardia di buona cittadinanza → advisory di conferma, "Procedi comunque"
 *   ripete la ricerca con ?force=true.
 *
 * Le risposte di /api/securities/:isin sono intercettate a livello di rete.
 */
import { test, expect } from '@playwright/test';

const SECURITY = {
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
};

test('ISIN non trovato → messaggio "Dato non disponibile" senza valori inventati', async ({ page }) => {
  await page.route('**/api/securities/**', async (route) => {
    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Nessuna corrispondenza su Borsa Italiana per US0378331005.' }),
    });
  });

  await page.goto('/ricerca');
  await page.getByLabel('Codice ISIN del titolo').fill('US0378331005');
  await page.getByRole('button', { name: 'Recupera anagrafica' }).click();

  await expect(page.getByText('Titolo non reperito')).toBeVisible({ timeout: 8000 });
  await expect(page.getByText('Dato non disponibile').first()).toBeVisible();
});

test('conferma di ri-ricerca: advisory mostrata → "Procedi comunque" → recupero forzato', async ({ page }) => {
  await page.route('**/api/securities/**', async (route) => {
    const url = route.request().url();
    if (url.includes('force=true')) {
      // Recupero forzato: dati freschi, nessuna conferma.
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ security: SECURITY, fromCache: false, lastFetchedAt: 1782547200 }),
      });
    } else {
      // Prima ricerca: la guardia chiede conferma.
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          security: SECURITY,
          fromCache: true,
          lastFetchedAt: 1782547200,
          confirmation: {
            kind: 'intra-session',
            lastFetchedAt: 1782547200,
            message:
              'Hai già chiesto il recupero informazioni di questo titolo oggi alle 10:30. Vuoi procedere comunque a una nuova ricerca?',
          },
        }),
      });
    }
  });

  await page.goto('/ricerca');
  await page.getByLabel('Codice ISIN del titolo').fill('IE00BMVB5S82');
  await page.getByRole('button', { name: 'Recupera anagrafica' }).click();

  // Advisory di conferma mostrata.
  await expect(page.getByText(/Vuoi procedere comunque/i)).toBeVisible({ timeout: 8000 });

  // L'utente conferma.
  await page.getByRole('button', { name: 'Procedi comunque' }).click();

  // La conferma scompare e i dati freschi restano visibili.
  await expect(page.getByRole('button', { name: 'Procedi comunque' })).toHaveCount(0);
  await expect(page.getByText('Titolo trovato')).toBeVisible();
  await expect(page.getByText('iShares Core MSCI World UCITS ETF').first()).toBeVisible();
});
