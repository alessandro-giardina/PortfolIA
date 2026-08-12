/**
 * US-011: Aggiungere un titolo a un portafoglio con un carico
 *
 * Scenario demo (con video): apri portafoglio → apri la scheda Carico titoli
 *   → compila form → submit → posizione compare in tabella.
 * Scenario validazione: prezzo zero e ISIN corto → messaggi errore inline.
 * Scenario persistenza: inserisci carico → ricarica pagina → posizione ancora visibile.
 */
import { test, expect } from './support/fixtures.js';
import { TITOLO_US_011, TITOLO_US_011_SECONDO } from './support/titoli.js';

// ─── Scenario demo (con video) ────────────────────────────────────────────────

const demoTest = test.extend<object>({});
demoTest.use({
  video: 'on',
  launchOptions: { slowMo: 300 },
  viewport: { width: 1280, height: 720 },
});

demoTest(
  'demo: aggiungi posizione in un portafoglio e vedi comparire nella tabella',
  async ({ page, archivio }) => {
    // Anagrafica in cache come recupero appena avvenuto: la premessa è costruita
    // qui e non ereditata dalla riga che un altro file ha lasciato in archivio.
    archivio.seminaTitolo(TITOLO_US_011.isin, TITOLO_US_011.campi);

    const { id: portfolioId, name: portfolioName } = await archivio.creaPortafoglio('Demo Carico');

    // 1. Naviga alla scheda Carico titoli
    await page.goto(`/portfolio/${portfolioId}`);
    await expect(page.getByRole('heading', { name: portfolioName })).toBeVisible({ timeout: 8000 });

    // Entrando dall'elenco si apre su "Riepilogo": apri la scheda Carico titoli
    await page.locator('nav.linguette a', { hasText: 'Carico titoli' }).click();
    await expect(page.getByTestId('input-isin')).toBeVisible();

    // 2. Compila il form
    await page.getByTestId('input-isin').fill(TITOLO_US_011.isin);
    await page.getByTestId('input-data').fill('2026-03-15');
    await page.getByTestId('input-prezzo').fill('89.42');
    await page.getByTestId('input-quantita').fill('40');

    // 3. Submit
    await page.getByTestId('btn-iscrive').click();

    // 4. Banner successo visibile
    await expect(page.getByTestId('avviso-successo')).toBeVisible({ timeout: 8000 });

    // 5. La posizione compare nella tabella
    await expect(page.getByTestId('tabella-posizioni')).toContainText(TITOLO_US_011.isin);
    await expect(page.getByTestId('contatore-posizioni')).toContainText('1 ISIN distinto');

    // Pausa finale per il video — stato con posizione iscritta
    await page.waitForTimeout(1500);
  }
);

// ─── Scenario validazione (senza video) ───────────────────────────────────────

test('validazione: ISIN troppo corto e prezzo zero → messaggi errore inline', async ({
  page,
  archivio,
}) => {
  const { id: portfolioId } = await archivio.creaPortafoglio('Validazione');

  await page.goto(`/portfolio/${portfolioId}`);
  await page.locator('nav.linguette a', { hasText: 'Carico titoli' }).click();
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
});

test('validazione: data assente → messaggio errore data', async ({ page, archivio }) => {
  archivio.seminaTitolo(TITOLO_US_011.isin, TITOLO_US_011.campi);

  const { id: portfolioId } = await archivio.creaPortafoglio('Validazione Data');

  await page.goto(`/portfolio/${portfolioId}`);
  await page.locator('nav.linguette a', { hasText: 'Carico titoli' }).click();
  await expect(page.getByTestId('input-isin')).toBeVisible({ timeout: 8000 });

  await page.getByTestId('input-isin').fill(TITOLO_US_011.isin);
  // non compila data
  await page.getByTestId('input-prezzo').fill('89.42');
  await page.getByTestId('input-quantita').fill('40');

  await page.getByTestId('btn-iscrive').click();

  await expect(page.getByTestId('err-data')).toBeVisible();
  await expect(page.getByTestId('err-data')).toContainText(/data/i);
});

// ─── Scenario persistenza (senza video) ───────────────────────────────────────

test('persistenza: posizione iscritta è ancora visibile dopo ricarica pagina', async ({
  page,
  archivio,
}) => {
  archivio.seminaTitolo(TITOLO_US_011_SECONDO.isin, TITOLO_US_011_SECONDO.campi);

  const { id: portfolioId } = await archivio.creaPortafoglio('Persistenza');

  await page.goto(`/portfolio/${portfolioId}`);
  await page.locator('nav.linguette a', { hasText: 'Carico titoli' }).click();
  await expect(page.getByTestId('input-isin')).toBeVisible({ timeout: 8000 });

  // Inserisce carico valido
  await page.getByTestId('input-isin').fill(TITOLO_US_011_SECONDO.isin);
  await page.getByTestId('input-data').fill('2026-06-01');
  await page.getByTestId('input-prezzo').fill('115.20');
  await page.getByTestId('input-quantita').fill('20');
  await page.getByTestId('btn-iscrive').click();

  // Aspetta banner successo
  await expect(page.getByTestId('avviso-successo')).toBeVisible({ timeout: 8000 });

  // Verifica che la posizione compaia
  await expect(page.getByTestId('tabella-posizioni')).toContainText(TITOLO_US_011_SECONDO.isin);

  // Ricarica la pagina (re-fetch API)
  await page.reload();

  // Dopo la ricarica si riparte da "Riepilogo": torna sulla scheda Carico titoli
  await page.locator('nav.linguette a', { hasText: 'Carico titoli' }).click();
  await expect(page.getByTestId('input-isin')).toBeVisible({ timeout: 8000 });

  // La posizione è ancora visibile nella tabella (persistenza)
  await expect(page.getByTestId('tabella-posizioni')).toContainText(TITOLO_US_011_SECONDO.isin);
  await expect(page.getByTestId('contatore-posizioni')).toContainText('1 ISIN distinto');
});
