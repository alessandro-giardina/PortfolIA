/**
 * US-055: quadro strumenti — ricerca titoli per ISIN.
 *
 * Copre, contro il design «quadro» (EP-009) e non contro il libro mastro:
 *  1. la **parità di informazione** fra le due rese sullo stesso titolo: la
 *     ricerca è eseguita una volta sola e il design è commutato a risultato
 *     già in pagina, quindi le due griglie leggono lo stesso stato di
 *     `useRicercaTitolo` (US-049) e non possono divergere se non nella resa;
 *  2. «Aggiungi a portafoglio», dal risultato quadro fino al modulo di carico
 *     precompilato — lo stesso percorso che US-025 verifica nel mastro;
 *  3. l'ISIN non valido: errore inline sotto il campo e **nessuna richiesta**
 *     alla fonte;
 *  4. i due esiti che il quadro separa e il mastro racconta con la stessa riga
 *     — 404 «non trovato» e 502 «nessuna fonte ha risposto»;
 *  5. lo stato di attesa, con una risposta deliberatamente ritardata.
 *
 * Lo scenario dimostrativo — commutazione e ricerca con video — vive da solo in
 * `US-055__quadro-ricerca-titoli-demo.spec.ts`: `launchOptions` (slowMo) non è
 * scopabile in un `describe`, solo a livello di file.
 *
 * Gli scenari 3, 4 e 5 intercettano la rete e non toccano mai l'archivio: usano
 * comunque `TITOLO_US_055.isin`, la chiave di questo file, perché un letterale
 * nuovo sarebbe una chiave in più fuori dal registro di `support/titoli.ts`.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/fixtures.js';
import { TITOLO_US_055 } from './support/titoli.js';

/** Porta il browser sulla ricerca titoli con il design «quadro» già attivo. */
async function apriRicercaInQuadro(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('portfolia-design', 'quadro');
  });
  await page.goto('/ricerca');
  await expect(page.getByTestId('barra-laterale')).toBeVisible({ timeout: 8000 });
}

/** Digita un ISIN e invia il modulo di ricerca (stesso modulo nei due design). */
async function cerca(page: Page, isin: string): Promise<void> {
  await page.getByLabel('Codice ISIN del titolo').fill(isin);
  await page.getByRole('button', { name: 'Recupera anagrafica' }).click();
}

/**
 * Legge una griglia di anagrafica come mappa etichetta → valore. Funziona su
 * entrambe le rese: `.anagrafica` nel mastro, `.griglia-def` nel quadro, ma la
 * coppia `.et`/`.dato` dentro `.voce-def` è la stessa.
 */
async function leggiAnagrafica(page: Page, griglia: string): Promise<Record<string, string>> {
  return page.locator(`${griglia} .voce-def`).evaluateAll((voci) =>
    Object.fromEntries(
      voci.map((v) => [
        v.querySelector('.et')?.textContent?.trim() ?? '',
        v.querySelector('.dato')?.textContent?.trim() ?? '',
      ]),
    ),
  );
}

// ─── Scenario 1: parità di informazione fra le due rese ──────────────────────

test('parità mastro/quadro: lo stesso titolo dice le stesse cose nelle due rese', async ({
  page,
  archivio,
}) => {
  archivio.seminaTitolo(TITOLO_US_055.isin, TITOLO_US_055.campi);

  // Si parte dal mastro, il design predefinito.
  await page.goto('/ricerca');
  await cerca(page, TITOLO_US_055.isin);
  await expect(page.getByTestId('btn-aggiungi-portafoglio')).toBeVisible({ timeout: 30000 });

  const mastro = await leggiAnagrafica(page, '.anagrafica');

  // Commutazione a risultato già in pagina: `SecuritySearchPage` resta montata,
  // quindi `useRicercaTitolo` conserva lo stato e le due rese leggono lo stesso.
  await page.getByRole('button', { name: /quadro strumenti/i }).click();
  await expect(page.locator('html')).toHaveAttribute('data-design', 'quadro');
  await expect(page.getByTestId('anagrafica-quadro')).toBeVisible({ timeout: 8000 });

  const quadro = await leggiAnagrafica(page, '.griglia-def');

  // Le stesse dieci etichette, con gli stessi valori — il prezzo a parte, che
  // il quadro scrive con la convenzione a quattro decimali di `prezzo()`.
  expect(Object.keys(quadro).sort()).toEqual(Object.keys(mastro).sort());
  for (const etichetta of Object.keys(mastro)) {
    if (etichetta === 'Prezzo attuale') continue;
    expect(quadro[etichetta], `campo «${etichetta}»`).toBe(mastro[etichetta]);
  }

  // Prezzo: stessa cifra, resa con più decimali (€ 4,87 → € 4,8700).
  expect(mastro['Prezzo attuale']).toBe('€ 4,87');
  expect(quadro['Prezzo attuale']).toBe('€ 4,8700');

  // Il campo che l'archivio non conosce è dichiarato assente in entrambe.
  expect(mastro['Politica di distribuzione dividendi']).toBe('Dato non disponibile');
  expect(quadro['Politica di distribuzione dividendi']).toBe('Dato non disponibile');

  // Fonte e istante di rilevamento (FR-021): la riga di provenienza del quadro.
  const provenienza = page.getByTestId('fonte-dato');
  await expect(provenienza).toContainText('Borsa Italiana');
  const istanteRilevazione = page.getByTestId('istante-rilevazione');
  await expect(istanteRilevazione).toBeVisible();
  // US-063: formato gg/mm/aaaa hh:mm, non più a numeri romani.
  await expect(istanteRilevazione.locator('b')).toHaveText(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);

  // L'intestazione del risultato ripete nome, ISIN e ticker.
  const testa = page.getByTestId('testa-titolo-ricerca');
  await expect(testa).toContainText(TITOLO_US_055.campi.name!);
  await expect(testa).toContainText(TITOLO_US_055.isin);
  await expect(testa).toContainText(TITOLO_US_055.campi.ticker!);

  await expect(page.getByTestId('riga-esito')).toHaveClass(/trovato/);
});

// ─── Scenario 2: aggiungi a portafoglio, fino al modulo di carico ────────────

test('«Aggiungi a portafoglio» dal quadro porta al modulo di carico precompilato', async ({
  page,
  archivio,
}) => {
  archivio.seminaTitolo(TITOLO_US_055.isin, TITOLO_US_055.campi);
  const { id } = await archivio.creaPortafoglio('Quadro Ricerca');

  await apriRicercaInQuadro(page);
  await cerca(page, TITOLO_US_055.isin);

  await page.getByTestId('btn-aggiungi-portafoglio').click({ timeout: 30000 });

  await expect(page.locator('[role="dialog"]')).toBeVisible();
  await page.getByTestId(`portafoglio-option-${id}`).click();
  await page.getByTestId('btn-conferma-dialog').click();

  await page.waitForURL(`**/portfolio/${id}`);
  await expect(page.getByTestId('input-isin')).toHaveValue(TITOLO_US_055.isin);
  await expect(page.getByTestId('input-prezzo')).not.toHaveValue('');
});

// ─── Scenario 3: ISIN non valido, senza interrogare la fonte ────────────────

test('ISIN non valido: errore inline sotto il campo e nessuna richiesta alla fonte', async ({ page }) => {
  let richieste = 0;
  await page.route('**/api/securities/**', (route) => {
    richieste += 1;
    void route.abort();
  });

  await apriRicercaInQuadro(page);
  await cerca(page, 'IT00031');

  const errore = page.getByTestId('errore-isin');
  await expect(errore).toBeVisible();
  await expect(errore).toContainText('12 caratteri');

  // Il contatore accompagna la digitazione e non dichiara completo un codice corto.
  await expect(page.getByTestId('contatore-isin')).toHaveText('7/12');
  await expect(page.getByTestId('contatore-isin')).not.toHaveClass(/completo/);

  // La riga di esito resta inerte e il placeholder «nessuna ricerca» non si muove.
  await expect(page.getByTestId('riga-esito')).toHaveClass(/inerte/);
  await expect(page.getByTestId('ricerca-vuota')).toBeVisible();

  expect(richieste).toBe(0);
});

// ─── Scenario 4a: 404 — le fonti hanno risposto che il titolo non esiste ────

test('404: «Titolo non reperito», con la riga di esito marcata non trovato', async ({ page }) => {
  await page.route('**/api/securities/**', (route) =>
    route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: `Nessuna corrispondenza disponibile per ${TITOLO_US_055.isin}.` }),
    }),
  );

  await apriRicercaInQuadro(page);
  await cerca(page, TITOLO_US_055.isin);

  const esito = page.getByTestId('riga-esito');
  await expect(esito).toHaveClass(/non-trovato/, { timeout: 8000 });
  await expect(esito).toContainText('Dato non disponibile');

  await expect(page.getByTestId('ricerca-non-trovato')).toContainText('Titolo non reperito');
  await expect(page.getByTestId('ricerca-fonte-muta')).toHaveCount(0);
  await expect(page.getByTestId('anagrafica-quadro')).toHaveCount(0);
});

// ─── Scenario 4b: 502 — nessuna fonte ha risposto ───────────────────────────

test('502: «Nessuna fonte ha risposto», stato distinto dal titolo inesistente', async ({ page }) => {
  await page.route('**/api/securities/**', (route) =>
    route.fulfill({
      status: 502,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Fonti non raggiungibili.' }),
    }),
  );

  await apriRicercaInQuadro(page);
  await cerca(page, TITOLO_US_055.isin);

  const esito = page.getByTestId('riga-esito');
  await expect(esito).toHaveClass(/guasto/, { timeout: 8000 });
  await expect(esito).toContainText('Fonte non raggiungibile');

  await expect(page.getByTestId('ricerca-fonte-muta')).toContainText('Nessuna fonte ha risposto');
  await expect(page.getByTestId('ricerca-non-trovato')).toHaveCount(0);

  // Il messaggio non nomina una fonte come colpevole né inventa un prezzo.
  await expect(page.getByTestId('anagrafica-quadro')).toHaveCount(0);
});

// ─── Scenario 5: attesa, con risposta ritardata ─────────────────────────────

test('attesa: punto pulsante nella riga di esito e scheletro dell\'anagrafica', async ({ page }) => {
  await page.route('**/api/securities/**', async (route) => {
    await new Promise((risolvi) => setTimeout(risolvi, 2000));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        security: {
          isin: TITOLO_US_055.isin,
          name: TITOLO_US_055.campi.name,
          price: TITOLO_US_055.campi.price,
          ticker: TITOLO_US_055.campi.ticker,
          instrumentType: TITOLO_US_055.campi.instrument_type,
          totalAnnualFees: TITOLO_US_055.campi.total_annual_fees,
          currency: TITOLO_US_055.campi.currency,
          issuer: TITOLO_US_055.campi.issuer,
          segment: TITOLO_US_055.campi.segment,
          dividendPolicy: null,
        },
        fromCache: false,
        lastFetchedAt: 1787577300,
        dataSource: 'borsaitaliana',
      }),
    });
  });

  await apriRicercaInQuadro(page);
  await cerca(page, TITOLO_US_055.isin);

  // Mentre la fonte è interrogata: riga di esito in attesa e scheletro a dieci righe.
  const esito = page.getByTestId('riga-esito');
  await expect(esito).toHaveClass(/in-attesa/);
  await expect(esito.locator('.punto-attesa')).toBeVisible();
  await expect(page.getByTestId('scheletro-anagrafica').locator('.scheletro-quadro')).toHaveCount(10);

  // Il campo e il bottone restano bloccati finché la risposta non arriva.
  await expect(page.getByLabel('Codice ISIN del titolo')).toBeDisabled();

  // E poi il risultato prende il posto dello scheletro.
  await expect(page.getByTestId('anagrafica-quadro')).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('scheletro-anagrafica')).toHaveCount(0);
  await expect(esito).toHaveClass(/trovato/);
});
