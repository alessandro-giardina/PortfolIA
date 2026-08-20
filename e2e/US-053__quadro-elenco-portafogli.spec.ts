/**
 * US-053: quadro strumenti — elenco portafogli.
 *
 * Copre, contro il nuovo design «quadro» (US-050/US-051/US-052/US-053) e non
 * contro il libro mastro:
 *  1. l'elenco vuoto mostra il placeholder quadro, non la tabella;
 *  2. l'elenco popolato mostra i portafogli esistenti e la riga apre il
 *     dettaglio corretto — stessi dati di `usePortafogli()` (US-049), sola
 *     resa diversa;
 *  3. il percorso end-to-end rinomina/eliminazione, passando dalla riga
 *     dell'elenco al pannello «Gestione del conto» già esistente nel
 *     dettaglio quadro (US-051), e di ritorno all'elenco;
 *  4. il dialogo di scelta portafoglio (`PortfolioSelectDialog`, condiviso fra
 *     i due design) è stilizzato in coerenza col quadro quando `data-design`
 *     è `quadro`.
 *
 * Lo scenario demo — creazione di un portafoglio dal pannello quadro, con
 * video — vive da solo in `US-053__quadro-elenco-portafogli-demo.spec.ts`:
 * `launchOptions` (slowMo) non è scopabile in un `describe`, solo a livello
 * di file.
 *
 * Gli scenari 2 e 3 toccano l'archivio (un portafoglio, e per il 3 anche un
 * carico per raggiungere il pannello di gestione — vedi `TITOLO_US_053` in
 * `support/titoli.ts`), quindi tutto il file usa la fixture `archivio` di
 * US-029, anche dove uno scenario non la richiede. Gli scenari 1 e 4 restano
 * ermetici pur importando la fixture: intercettano la rete (`route.fulfill()`)
 * e non la usano.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/fixtures.js';
import { TITOLO_US_027, TITOLO_US_053 } from './support/titoli.js';

/** Porta il browser sulla dashboard con il design «quadro» già attivo, senza passare dal commutatore. */
async function apriDashboardInQuadro(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('portfolia-design', 'quadro');
  });
  await page.goto('/');
  await expect(page.getByTestId('barra-laterale')).toBeVisible({ timeout: 8000 });
}

// ─── Scenario 1: elenco vuoto ────────────────────────────────────────────────
// Ermetico: con l'archivio reale, popolato dagli altri file spec in esecuzione
// sugli altri worker, l'elenco non sarebbe mai vuoto per davvero.

test('elenco vuoto: il pannello mostra il placeholder quadro, non la tabella', async ({ page }) => {
  await page.route('**/api/portfolios', (route) => {
    if (route.request().method() === 'GET') {
      void route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    } else {
      void route.continue();
    }
  });

  await apriDashboardInQuadro(page);

  const vuoto = page.getByTestId('dashboard-vuoto');
  await expect(vuoto).toBeVisible();
  await expect(vuoto).toContainText('Nessun portafoglio');
  await expect(page.locator('table.dati')).toHaveCount(0);

  // Il modulo di creazione resta comunque raggiungibile: è la via d'uscita dallo stato vuoto.
  await expect(page.getByTestId('input-nuovo-portafoglio')).toBeVisible();
});

// ─── Scenario 2: elenco popolato e navigazione al dettaglio ─────────────────

test('elenco popolato: una riga esiste per ogni portafoglio e apre il dettaglio corretto', async ({
  page,
  archivio,
}) => {
  const { id, name } = await archivio.creaPortafoglio('Quadro Elenco');

  await apriDashboardInQuadro(page);

  const riga = page.getByTestId(`riga-portafoglio-${id}`);
  await expect(riga).toBeVisible({ timeout: 8000 });
  await expect(riga).toContainText(name);

  await riga.click();

  await expect(page).toHaveURL(`/portfolio/${id}`);
  await expect(page.getByTestId('barra-laterale')).toBeVisible({ timeout: 8000 });
});

// ─── Scenario 3: rinomina ed eliminazione, dall'elenco al dettaglio quadro ──

test(
  'rinomina ed eliminazione: dalla riga dell\'elenco al pannello di gestione del dettaglio quadro, e ritorno',
  async ({ page, archivio }) => {
    const { id, name: nomeOriginale } = await archivio.creaPortafoglio('Quadro Gestione');
    archivio.seminaTitolo(TITOLO_US_053.isin, TITOLO_US_053.campi);
    await archivio.aggiungiPosizione(id, TITOLO_US_053.isin, '2025-03-01', TITOLO_US_053.campi.price!, 10);

    await apriDashboardInQuadro(page);
    await page.getByTestId(`riga-portafoglio-${id}`).click();
    await expect(page).toHaveURL(`/portfolio/${id}`);

    // Il titolo di pagina, e con esso il pannello «Gestione del conto», compare
    // solo perché il portafoglio ha almeno un carico (TASK-08, vedi TITOLO_US_053).
    await expect(page.locator('.titolo-pagina h1')).toHaveText(nomeOriginale, { timeout: 8000 });

    // Rinomina
    const nuovoNome = `${nomeOriginale}-Rinominato`;
    const input = page.getByLabel('Rinomina conto');
    await expect(input).toBeVisible();
    await input.fill(nuovoNome);
    await page.getByRole('button', { name: 'Salva' }).click();

    await expect(page.locator('.titolo-pagina h1')).toHaveText(nuovoNome, { timeout: 8000 });

    // Eliminazione, con la stessa guardia `window.confirm` del mastro (US-006):
    // `usePortafoglio` è l'unico hook dietro entrambe le rese.
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Elimina portafoglio' }).click();

    // Il redirect riporta alla dashboard, ancora nel design quadro: nessuna
    // ricarica di pagina attraversa il commutatore.
    await expect(page).toHaveURL('/', { timeout: 8000 });
    await expect(page.locator('.titolo-pagina h1')).toHaveText('Portafogli', { timeout: 8000 });
    await expect(page.getByTestId(`riga-portafoglio-${id}`)).toHaveCount(0);
    await expect(page.getByText(nuovoNome)).not.toBeVisible();
  },
);

// ─── Scenario 4: il dialogo di scelta portafoglio, in design quadro ─────────
// Ermetico, come `US-027__dialog-elenco-portafogli.spec.ts`: sia l'anagrafica
// sia l'elenco portafogli arrivano da `route.fulfill()`, per la stessa ragione
// registrata là (la lunghezza dell'elenco è parte della prova, e l'archivio
// reale contiene anche i portafogli degli altri file in esecuzione parallela).
// `TITOLO_US_027` è importato ma non seminato: solo letto per servirne i campi
// dalla rete (`lettoDa`, vedi support/titoli.ts).

const { isin: ISIN_DIALOGO, campi: CAMPI_DIALOGO } = TITOLO_US_027;

const ANAGRAFICA_DIALOGO = {
  security: {
    isin: ISIN_DIALOGO,
    name: CAMPI_DIALOGO.name,
    price: CAMPI_DIALOGO.price,
    ticker: CAMPI_DIALOGO.ticker,
    instrumentType: CAMPI_DIALOGO.instrument_type,
    totalAnnualFees: CAMPI_DIALOGO.total_annual_fees,
    currency: CAMPI_DIALOGO.currency,
    issuer: CAMPI_DIALOGO.issuer,
    segment: CAMPI_DIALOGO.segment,
    dividendPolicy: null,
  },
  fromCache: true,
  lastFetchedAt: 1786032000,
};

function elencoPortafogliFinto(quanti: number): { id: number; name: string }[] {
  return Array.from({ length: quanti }, (_, i) => ({
    id: i + 1,
    name: `Portafoglio ${String(i + 1).padStart(2, '0')}`,
  }));
}

test('il dialogo di scelta portafoglio è stilizzato in coerenza col design quadro', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('portfolia-design', 'quadro');
  });
  await page.route('**/api/securities/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ANAGRAFICA_DIALOGO) }),
  );
  await page.route('**/api/portfolios', (route) => {
    if (route.request().method() === 'GET') {
      void route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(elencoPortafogliFinto(3)),
      });
    } else {
      void route.continue();
    }
  });

  await page.goto('/ricerca');
  await expect(page.getByTestId('barra-laterale')).toBeVisible({ timeout: 8000 });
  await page.getByLabel('Codice ISIN del titolo').fill(ISIN_DIALOGO);
  await page.getByRole('button', { name: 'Recupera anagrafica' }).click();

  const bottoneAggiungi = page.getByTestId('btn-aggiungi-portafoglio');
  await expect(bottoneAggiungi).toBeVisible({ timeout: 8000 });
  await bottoneAggiungi.click();

  const dialogo = page.locator('[role="dialog"]');
  await expect(dialogo).toBeVisible();
  await expect(page.locator('[data-testid^="portafoglio-option-"]')).toHaveCount(3);

  // Prova che TASK-04 ha davvero applicato le regole quadro (`--raggio: 14px`),
  // non solo che il componente è montato: nel mastro lo stesso riquadro ha un
  // `border-radius` di 2px, letterale e non un token.
  await expect(dialogo).toHaveCSS('border-radius', '14px');

  // Funziona come nel mastro: selezione e conferma.
  const primaRiga = page.locator('[data-testid^="portafoglio-option-"]').first();
  await primaRiga.click();
  await expect(primaRiga).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('btn-conferma-dialog')).toBeEnabled();
});
