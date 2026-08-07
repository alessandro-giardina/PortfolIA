import { test, expect } from './support/fixtures.js';

test.describe('US-005 — Visualizzazione portafogli', () => {

  test('stato vuoto: messaggio visibile senza portafogli', async ({ page }) => {
    // Prima di US-029 questo test si auto-saltava quando l'archivio non era vuoto,
    // cioè in pratica sempre: un test che non gira non protegge nulla. L'elenco è
    // ora intercettato a vuoto, con la stessa tecnica già usata in US-025, così lo
    // stato vuoto è verificabile senza dipendere da cosa c'è in archivio.
    await page.route('**/api/portfolios', (route) => {
      if (route.request().method() === 'GET') {
        void route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      } else {
        void route.continue();
      }
    });

    await page.goto('/');
    await expect(page.getByText('Caricamento portafogli')).not.toBeVisible({ timeout: 5000 }).catch(() => {});
    await expect(page.getByText('Il registro è ancora vuoto')).toBeVisible({ timeout: 8000 });
    await expect(page.getByText('Apri il tuo primo conto a mastro')).toBeVisible();
  });

  test('lista portafogli: portafoglio creato via API compare nella lista', async ({ page, archivio }) => {
    const { name: nome } = await archivio.creaPortafoglio('Test');

    await page.goto('/');
    await expect(page.getByText('Caricamento portafogli')).not.toBeVisible({ timeout: 5000 }).catch(() => {});
    await expect(page.getByText(nome)).toBeVisible({ timeout: 8000 });
    await expect(page.getByText('clicca un conto per aprirne il dettaglio')).toBeVisible();
  });

});
