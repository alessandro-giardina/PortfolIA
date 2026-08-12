/**
 * US-013: Modificare o rimuovere una posizione/carico
 *
 * Scenario demo (con video, salvato in docs/test-results/US-013/):
 *   inserisci due carichi → modifica il primo → verifica summary aggiornato
 *   → rimuovi il secondo → verifica scomparsa.
 *
 * Scenari aggiuntivi (senza video):
 *   - validazione form modifica (campo prezzo non positivo)
 *   - annullamento confirm rimozione
 *   - persistenza dati modificati dopo ricarica
 */
import { test, expect } from './support/fixtures.js';
import { elencaPosizioni, modificaPosizione } from './support/api.js';
import { TITOLO_US_013, TITOLO_US_013_SECONDO } from './support/titoli.js';

// ---------------------------------------------------------------------------
// Scenario demo (con video)
// ---------------------------------------------------------------------------

const demoTest = test.extend<object>({});
demoTest.use({
  video: 'on',
  launchOptions: { slowMo: 300 },
  viewport: { width: 1280, height: 720 },
});

demoTest(
  'demo: modifica prezzo carico → summary aggiornato; rimuovi secondo carico → scompare dal registro',
  async ({ page, archivio }) => {
    // Anagrafiche in cache come recupero appena avvenuto: la premessa è costruita
    // qui e non ereditata dalla riga che un altro file ha lasciato in archivio.
    archivio.seminaTitolo(TITOLO_US_013.isin, TITOLO_US_013.campi);
    archivio.seminaTitolo(TITOLO_US_013_SECONDO.isin, TITOLO_US_013_SECONDO.campi);

    const { id: portfolioId, name: portfolioName } =
      await archivio.creaPortafoglio('Demo Modifica Rimuovi');

    // Stato iniziale: inserisci due carichi tramite UI
    await page.goto(`/portfolio/${portfolioId}`);
    await expect(page.getByRole('heading', { name: portfolioName })).toBeVisible({ timeout: 8000 });
    await page.locator('nav.linguette a', { hasText: 'Carico titoli' }).click();
    await expect(page.getByTestId('input-isin')).toBeVisible();

    // Primo carico: 89.00 × 40
    await page.getByTestId('input-isin').fill(TITOLO_US_013.isin);
    await page.getByTestId('input-data').fill('2026-03-15');
    await page.getByTestId('input-prezzo').fill('89');
    await page.getByTestId('input-quantita').fill('40');
    await page.getByTestId('btn-iscrive').click();
    await expect(page.getByTestId('avviso-successo')).toBeVisible({ timeout: 8000 });

    // Secondo carico: 115.00 × 20
    await page.getByTestId('input-isin').fill(TITOLO_US_013_SECONDO.isin);
    await page.getByTestId('input-data').fill('2026-04-01');
    await page.getByTestId('input-prezzo').fill('115');
    await page.getByTestId('input-quantita').fill('20');
    await page.getByTestId('btn-iscrive').click();
    await expect(page.getByTestId('avviso-successo')).toBeVisible({ timeout: 8000 });

    // Individua il primo carico nel registro
    const tabella = page.getByTestId('tabella-registro-carichi');
    await expect(tabella).toBeVisible();

    // Ottieni la lista posizioni corrente per trovare l'id del primo carico
    const positions = await elencaPosizioni(portfolioId);
    const primoCarico = positions.find((p) => p.isin === TITOLO_US_013.isin);
    const secondoCarico = positions.find((p) => p.isin === TITOLO_US_013_SECONDO.isin);
    expect(primoCarico).toBeDefined();
    expect(secondoCarico).toBeDefined();

    // ── Modifica il primo carico: prezzo da 89 → 95 ──
    await page.getByTestId(`btn-modifica-${primoCarico!.id}`).click();
    await expect(page.getByTestId(`edit-riga-${primoCarico!.id}`)).toBeVisible();

    // Modifica il prezzo
    await page.getByTestId('edit-input-prezzo').clear();
    await page.getByTestId('edit-input-prezzo').fill('95');
    await page.getByTestId(`btn-salva-modifica-${primoCarico!.id}`).click();

    // Il form inline scompare e la tabella aggregata si aggiorna
    await expect(page.getByTestId(`edit-riga-${primoCarico!.id}`)).not.toBeVisible({ timeout: 8000 });

    // Verifica summary: avgLoadPrice aggiornato per il primo titolo = 95 (solo 1 carico)
    const summaryRow = page.getByTestId(`summary-${TITOLO_US_013.isin}`);
    await expect(summaryRow).toBeVisible();
    await expect(summaryRow).toContainText('95.0000');

    // Pausa per video
    await page.waitForTimeout(1000);

    // ── Rimuovi il secondo carico ──
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByTestId(`btn-rimuovi-${secondoCarico!.id}`).click();

    // Il secondo carico scompare dal registro
    await expect(page.getByTestId(`posizione-${secondoCarico!.id}`)).not.toBeVisible({ timeout: 8000 });

    // La tabella aggregata non contiene più il secondo titolo
    await expect(page.getByTestId('tabella-posizioni')).not.toContainText(
      TITOLO_US_013_SECONDO.isin,
    );

    // Contatore mostra 1 ISIN distinto
    await expect(page.getByTestId('contatore-posizioni')).toContainText('1');

    // Pausa finale per il video
    await page.waitForTimeout(1500);
  }
);

// ---------------------------------------------------------------------------
// Scenari aggiuntivi (senza video)
// ---------------------------------------------------------------------------

test('validazione form modifica: prezzo non positivo mostra errore inline', async ({ page, archivio }) => {
  archivio.seminaTitolo(TITOLO_US_013.isin, TITOLO_US_013.campi);

  const { id: portfolioId } = await archivio.creaPortafoglio('Validazione Modifica');
  const posId = await archivio.aggiungiPosizione(
    portfolioId,
    TITOLO_US_013.isin,
    '2026-03-15',
    89.0,
    40,
  );

  await page.goto(`/portfolio/${portfolioId}`);
  await page.locator('nav.linguette a', { hasText: 'Carico titoli' }).click();
  await expect(page.getByTestId('input-isin')).toBeVisible({ timeout: 8000 });

  // Apri il form inline
  await page.getByTestId(`btn-modifica-${posId}`).click();
  await expect(page.getByTestId(`edit-riga-${posId}`)).toBeVisible();

  // Imposta prezzo non valido (0)
  await page.getByTestId('edit-input-prezzo').clear();
  await page.getByTestId('edit-input-prezzo').fill('0');
  await page.getByTestId(`btn-salva-modifica-${posId}`).click();

  // Errore inline visibile
  await expect(page.getByTestId(`edit-errore-${posId}`)).toBeVisible();
  await expect(page.getByTestId(`edit-errore-${posId}`)).toContainText(/prezzo/i);

  // Il form rimane aperto
  await expect(page.getByTestId(`edit-riga-${posId}`)).toBeVisible();
});

test('annullamento confirm rimozione: il carico non viene rimosso', async ({ page, archivio }) => {
  archivio.seminaTitolo(TITOLO_US_013.isin, TITOLO_US_013.campi);

  const { id: portfolioId } = await archivio.creaPortafoglio('Annulla Rimozione');
  const posId = await archivio.aggiungiPosizione(
    portfolioId,
    TITOLO_US_013.isin,
    '2026-03-15',
    89.0,
    40,
  );

  await page.goto(`/portfolio/${portfolioId}`);
  await page.locator('nav.linguette a', { hasText: 'Carico titoli' }).click();
  await expect(page.getByTestId('input-isin')).toBeVisible({ timeout: 8000 });
  await expect(page.getByTestId(`posizione-${posId}`)).toBeVisible();

  // Clicca Rimuovi ma annulla la conferma
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByTestId(`btn-rimuovi-${posId}`).click();

  // Il carico è ancora presente
  await expect(page.getByTestId(`posizione-${posId}`)).toBeVisible();
});

test('persistenza: i dati modificati rimangono dopo ricarica pagina', async ({ page, archivio }) => {
  archivio.seminaTitolo(TITOLO_US_013.isin, TITOLO_US_013.campi);

  const { id: portfolioId } = await archivio.creaPortafoglio('Persistenza Modifica');
  const posId = await archivio.aggiungiPosizione(
    portfolioId,
    TITOLO_US_013.isin,
    '2026-03-15',
    89.0,
    40,
  );

  await page.goto(`/portfolio/${portfolioId}`);
  await page.locator('nav.linguette a', { hasText: 'Carico titoli' }).click();
  await expect(page.getByTestId('input-isin')).toBeVisible({ timeout: 8000 });

  // Modifica quantity via PATCH diretto
  await modificaPosizione(portfolioId, posId, { quantity: 100 });

  // Ricarica la pagina
  await page.reload();
  await page.locator('nav.linguette a', { hasText: 'Carico titoli' }).click();
  await expect(page.getByTestId('input-isin')).toBeVisible({ timeout: 8000 });

  // La riga mostra quantity aggiornata
  const riga = page.getByTestId(`posizione-${posId}`);
  await expect(riga).toBeVisible();
  await expect(riga).toContainText('100');

  // Il summary riflette la modifica
  const summaryRow = page.getByTestId(`summary-${TITOLO_US_013.isin}`);
  await expect(summaryRow).toBeVisible();
  await expect(summaryRow).toContainText('100');
});
