import { test, expect } from './support/fixtures.js';

// ─── Validazione: nome vuoto ───────────────────────────────────────────────────
test('validazione nome vuoto mostra messaggio errore inline', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('form', { name: 'Crea portafoglio' })).toBeVisible();

  await page.getByRole('button', { name: 'Registra a mastro' }).click();

  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('alert')).toContainText(/vuoto/i);
});

// ─── Validazione: nome duplicato ──────────────────────────────────────────────
// Il nome è univoco per esecuzione (US-029). Con il nome fisso di prima, alla
// seconda esecuzione il conto esisteva già e il 409 scattava sulla *prima*
// creazione: il test passava, ma verificando un percorso diverso da quello
// dichiarato. Il portafoglio nasce dalla UI, quindi il test non ne conosce l'id:
// la fixture lo rimuove riconoscendolo dal nome prenotato.
test('nome duplicato mostra messaggio errore 409', async ({ page, archivio }) => {
  const nomeConto = archivio.nomeUnico('Conto Unico');

  await page.goto('/');
  await expect(page.getByRole('form', { name: 'Crea portafoglio' })).toBeVisible();

  // Prima creazione: deve riuscire
  await page.getByLabel('Denominazione del conto').fill(nomeConto);
  await page.getByRole('button', { name: 'Registra a mastro' }).click();
  await expect(page.getByText(nomeConto)).toBeVisible();

  // …e non deve produrre alcun errore: è la metà del contratto che prima sfuggiva.
  await expect(page.getByRole('alert')).not.toBeVisible();

  // Seconda creazione con lo stesso nome: è qui che deve arrivare il 409
  await page.getByLabel('Denominazione del conto').fill(nomeConto);
  await page.getByRole('button', { name: 'Registra a mastro' }).click();

  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('alert')).toContainText(/già/i);
});
