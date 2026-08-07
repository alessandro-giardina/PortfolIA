/**
 * US-006: Rinominare ed eliminare un portafoglio
 * Scenario (1) è il demo con video — rinomina e poi elimina un portafoglio.
 * Scenari (2)–(4) sono funzionali, senza video.
 */
import { test, expect } from './support/fixtures.js';

/**
 * Nome accessibile dell'intestazione del dettaglio portafoglio: la pagina compone
 * il titolo come "Conto " + nome del conto in corsivo.
 */
function intestazioneConto(nome: string): string {
  return `Conto ${nome}`;
}

// ─── Scenario 1: Demo (con video) ────────────────────────────────────────────

const demoTest = test.extend<object>({});

demoTest.use({
  video: 'on',
  launchOptions: { slowMo: 300 },
  viewport: { width: 1280, height: 720 },
});

demoTest(
  'demo: rinomina portafoglio e lo elimina — il nuovo nome si riflette e poi scompare',
  async ({ page, archivio }) => {
    const { id, name: nomeOriginale } = await archivio.creaPortafoglio('Portafoglio-Demo');
    const nuovoNome = `${nomeOriginale}-Rinominato`;

    // 1. Vai al dettaglio del portafoglio
    await page.goto(`/portfolio/${id}`);
    await expect(
      page.getByRole('heading', { name: intestazioneConto(nomeOriginale), exact: true })
    ).toBeVisible({
      timeout: 8000,
    });

    // 2. Rinomina — compila il form e salva
    const input = page.getByLabel('Rinomina conto');
    await expect(input).toBeVisible();
    await input.fill(nuovoNome);

    await page.getByRole('button', { name: 'Salva' }).click();

    // 3. Verifica che il titolo mostri il nuovo nome
    await expect(
      page.getByRole('heading', { name: intestazioneConto(nuovoNome), exact: true })
    ).toBeVisible({
      timeout: 8000,
    });

    // Pausa per il video — il nuovo nome è visibile
    await page.waitForTimeout(1500);

    // 4. Elimina il portafoglio con conferma
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Elimina portafoglio' }).click();

    // 5. Dopo l'eliminazione viene reindirizzato alla dashboard
    await expect(page).toHaveURL('/', { timeout: 8000 });
    await expect(page.getByRole('heading', { name: 'Libro Mastro' })).toBeVisible({ timeout: 8000 });

    // Il portafoglio non è più nell'elenco
    await expect(page.getByText(nuovoNome)).not.toBeVisible();

    // Pausa finale per il video — la dashboard è visibile e il portafoglio è scomparso
    await page.waitForTimeout(1500);
  }
);

// ─── Scenari funzionali (senza video) ────────────────────────────────────────

test.describe('US-006 — scenari funzionali', () => {
  test('validazione nome vuoto — errore inline', async ({ page, archivio }) => {
    const { id } = await archivio.creaPortafoglio('Portafoglio-Vuoto');

    await page.goto(`/portfolio/${id}`);
    await expect(page.getByLabel('Rinomina conto')).toBeVisible({ timeout: 8000 });

    const input = page.getByLabel('Rinomina conto');
    await input.fill('');

    await page.getByRole('button', { name: 'Salva' }).click();

    await expect(page.getByText('Il nome non può essere vuoto.')).toBeVisible({ timeout: 5000 });
  });

  test('validazione nome duplicato — messaggio errore 409', async ({ page, archivio }) => {
    const { name: nomeA } = await archivio.creaPortafoglio('Portafoglio-A');
    const { id: idB } = await archivio.creaPortafoglio('Portafoglio-B');

    await page.goto(`/portfolio/${idB}`);
    await expect(page.getByLabel('Rinomina conto')).toBeVisible({ timeout: 8000 });

    const input = page.getByLabel('Rinomina conto');
    await input.fill(nomeA);

    await page.getByRole('button', { name: 'Salva' }).click();

    await expect(page.getByText(/già/i)).toBeVisible({ timeout: 5000 });
  });

  test('eliminazione annullata — il portafoglio rimane', async ({ page, archivio }) => {
    const { id, name: nome } = await archivio.creaPortafoglio('Portafoglio-Annulla');

    await page.goto(`/portfolio/${id}`);
    await expect(page.getByRole('button', { name: 'Elimina portafoglio' })).toBeVisible({
      timeout: 8000,
    });

    // L'utente annulla il confirm
    page.once('dialog', (dialog) => dialog.dismiss());
    await page.getByRole('button', { name: 'Elimina portafoglio' }).click();

    // Rimane nella stessa pagina
    await expect(page).toHaveURL(`/portfolio/${id}`);
    await expect(
      page.getByRole('heading', { name: intestazioneConto(nome), exact: true })
    ).toBeVisible();
  });
});
