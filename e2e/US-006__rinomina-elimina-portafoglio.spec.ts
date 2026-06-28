/**
 * US-006: Rinominare ed eliminare un portafoglio
 * Scenario (1) è il demo con video — rinomina e poi elimina un portafoglio.
 * Scenari (2)–(4) sono funzionali, senza video.
 */
import { test, expect, request } from '@playwright/test';

const BASE_API = 'http://localhost:3200';

async function createPortfolio(name: string): Promise<{ id: number; name: string }> {
  const ctx = await request.newContext();
  const res = await ctx.post(`${BASE_API}/api/portfolios`, { data: { name } });
  const data = (await res.json()) as { id: number; name: string };
  await ctx.dispose();
  return data;
}

async function deletePortfolio(id: number): Promise<void> {
  const ctx = await request.newContext();
  await ctx.delete(`${BASE_API}/api/portfolios/${id}`);
  await ctx.dispose();
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
  async ({ page }) => {
    const nomeOriginale = `Portafoglio-Demo-${Date.now()}`;
    const nuovoNome = `${nomeOriginale}-Rinominato`;

    const { id } = await createPortfolio(nomeOriginale);

    // 1. Vai al dettaglio del portafoglio
    await page.goto(`/portfolio/${id}`);
    await expect(page.getByRole('heading', { name: nomeOriginale, exact: true })).toBeVisible({
      timeout: 8000,
    });

    // 2. Rinomina — compila il form e salva
    const input = page.getByLabel('Rinomina conto');
    await expect(input).toBeVisible();
    await input.fill(nuovoNome);

    await page.getByRole('button', { name: 'Salva' }).click();

    // 3. Verifica che il titolo mostri il nuovo nome
    await expect(page.getByRole('heading', { name: nuovoNome, exact: true })).toBeVisible({
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
  test('validazione nome vuoto — errore inline', async ({ page }) => {
    const nome = `Portafoglio-Vuoto-${Date.now()}`;
    const { id } = await createPortfolio(nome);

    await page.goto(`/portfolio/${id}`);
    await expect(page.getByLabel('Rinomina conto')).toBeVisible({ timeout: 8000 });

    const input = page.getByLabel('Rinomina conto');
    await input.fill('');

    await page.getByRole('button', { name: 'Salva' }).click();

    await expect(page.getByText('Il nome non può essere vuoto.')).toBeVisible({ timeout: 5000 });

    // Cleanup
    await deletePortfolio(id);
  });

  test('validazione nome duplicato — messaggio errore 409', async ({ page }) => {
    const nomeA = `Portafoglio-A-${Date.now()}`;
    const nomeB = `Portafoglio-B-${Date.now()}`;
    const { id: idA } = await createPortfolio(nomeA);
    const { id: idB } = await createPortfolio(nomeB);

    await page.goto(`/portfolio/${idB}`);
    await expect(page.getByLabel('Rinomina conto')).toBeVisible({ timeout: 8000 });

    const input = page.getByLabel('Rinomina conto');
    await input.fill(nomeA);

    await page.getByRole('button', { name: 'Salva' }).click();

    await expect(page.getByText(/già/i)).toBeVisible({ timeout: 5000 });

    // Cleanup
    await deletePortfolio(idA);
    await deletePortfolio(idB);
  });

  test('eliminazione annullata — il portafoglio rimane', async ({ page }) => {
    const nome = `Portafoglio-Annulla-${Date.now()}`;
    const { id } = await createPortfolio(nome);

    await page.goto(`/portfolio/${id}`);
    await expect(page.getByRole('button', { name: 'Elimina portafoglio' })).toBeVisible({
      timeout: 8000,
    });

    // L'utente annulla il confirm
    page.once('dialog', (dialog) => dialog.dismiss());
    await page.getByRole('button', { name: 'Elimina portafoglio' }).click();

    // Rimane nella stessa pagina
    await expect(page).toHaveURL(`/portfolio/${id}`);
    await expect(page.getByRole('heading', { name: nome, exact: true })).toBeVisible();

    // Cleanup
    await deletePortfolio(id);
  });
});
