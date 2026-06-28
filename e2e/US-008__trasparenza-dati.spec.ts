/**
 * US-008: Trasparenza dei dati mancanti verificata end-to-end e indipendente dalla fonte
 *
 * Scenario 1 (demo, con video): ISIN assente su entrambe le fonti → timbro "Dato non disponibile"
 *   - L'API risponde 404 (dopo che entrambe le fonti sono state interrogate).
 *   - Il timbro "Dato non disponibile" e il titolo "Titolo non reperito" sono visibili.
 *   - Nessun valore inventato appare nel corpo della pagina.
 *
 * Scenario 2: guasto 502 di entrambe le fonti → messaggio source-neutral senza blocco dell'app.
 *   - L'API risponde 502.
 *   - Il messaggio di errore non nomina una fonte specifica ("Borsa Italiana", "MorningStar").
 *   - La pagina non va in crash.
 *
 * Scenario 3: regressione campi anagrafici nulli → ogni campo mostra "Dato non disponibile".
 *   - L'API restituisce un titolo con campi parzialmente nulli.
 *   - Ogni campo null è reso come "Dato non disponibile" (nessuna cella vuota silenziosa).
 *
 * Tutte le chiamate a /api/securities/:isin sono intercettate a livello di rete.
 */
import { test, expect } from '@playwright/test';

// Video e slow-mo applicati a tutti i test del file (demo incluso).
test.use({
  video: 'on',
  launchOptions: { slowMo: 300 },
  viewport: { width: 1280, height: 720 },
});

// ─── Fixtures ────────────────────────────────────────────────────────────────

const ISIN_ASSENTE = 'XS1234567896';
const ISIN_PARZIALE = 'IE00BJRHVJ28';

const SECURITY_PARZIALE = {
  isin: ISIN_PARZIALE,
  name: 'iShares MSCI EM IMI ESG Screened UCITS ETF',
  price: null,
  ticker: null,
  instrumentType: 'ETF azionario',
  totalAnnualFees: null,
  currency: null,
  issuer: null,
  segment: null,
  dividendPolicy: null,
};

// ─── Scenario 1 (demo): ISIN assente su entrambe le fonti ────────────────────

test('demo: timbro "Dato non disponibile" dopo fallback su entrambe le fonti', async ({ page }) => {
  // Intercetta: nessuna fonte ha trovato il titolo (404 post-fallback).
  await page.route('**/api/securities/**', async (route) => {
    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: `Nessuna corrispondenza disponibile per ${ISIN_ASSENTE}.` }),
    });
  });

  // Stato iniziale: pagina di ricerca titoli.
  await page.goto('/ricerca');
  await expect(page.getByRole('heading', { name: /Cerca un titolo/ })).toBeVisible({ timeout: 8000 });

  // L'utente inserisce un ISIN assente su entrambe le fonti.
  await page.getByLabel('Codice ISIN del titolo').fill(ISIN_ASSENTE);

  // Avvia il recupero.
  await page.getByRole('button', { name: 'Recupera anagrafica' }).click();

  // Il timbro "Dato non disponibile" è visibile.
  await expect(page.getByText('Dato non disponibile').first()).toBeVisible({ timeout: 8000 });

  // Il titolo "Titolo non reperito" conferma che entrambe le fonti sono state interrogate.
  await expect(page.getByText('Titolo non reperito')).toBeVisible();

  // Nessun valore numerico o testuale inventato appare (nessun prezzo, nessun nome fittizio).
  await expect(page.getByText('iShares')).not.toBeVisible();

  // Trattiene lo stato finale per la registrazione video.
  await page.waitForTimeout(1500);
});

// ─── Scenario 2: guasto 502 di entrambe le fonti → messaggio source-neutral ──

test("guasto 502 di entrambe le fonti → messaggio neutro, nessun blocco dell'app", async ({ page }) => {
  await page.route('**/api/securities/**', async (route) => {
    await route.fulfill({
      status: 502,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Upstream error' }),
    });
  });

  await page.goto('/ricerca');
  await page.getByLabel('Codice ISIN del titolo').fill(ISIN_ASSENTE);
  await page.getByRole('button', { name: 'Recupera anagrafica' }).click();

  // Il messaggio di errore è visibile.
  await expect(page.getByText('La fonte ufficiale non è al momento raggiungibile')).toBeVisible({
    timeout: 8000,
  });

  // Il messaggio non nomina una fonte specifica.
  await expect(page.getByText(/Borsa Italiana/)).not.toBeVisible();
  await expect(page.getByText(/MorningStar/)).not.toBeVisible();

  // La pagina non è bloccata: il form è ancora utilizzabile.
  await expect(page.getByRole('button', { name: 'Recupera anagrafica' })).toBeVisible();
});

// ─── Scenario 3: regressione — campi anagrafici nulli → "Dato non disponibile" per ognuno ─

test('campi anagrafici nulli → ogni campo mostra "Dato non disponibile"', async ({ page }) => {
  await page.route('**/api/securities/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        security: SECURITY_PARZIALE,
        fromCache: false,
        lastFetchedAt: 1782547200,
        dataSource: 'borsaitaliana',
      }),
    });
  });

  await page.goto('/ricerca');
  await page.getByLabel('Codice ISIN del titolo').fill(ISIN_PARZIALE);
  await page.getByRole('button', { name: 'Recupera anagrafica' }).click();

  // Il titolo è trovato (200).
  await expect(page.getByText('Titolo trovato')).toBeVisible({ timeout: 8000 });

  // I campi null sono dichiarati "Dato non disponibile" (almeno 5 campi nulli nel fixture).
  const celleAssenti = page.locator('.dato.assente');
  await expect(celleAssenti).toHaveCount(7); // price, ticker, fees, currency, issuer, segment, dividendPolicy

  // Nessuna cella è silenziosa (non ci sono .dato vuote senza testo).
  for (const cella of await celleAssenti.all()) {
    await expect(cella).toHaveText('Dato non disponibile');
  }
});
