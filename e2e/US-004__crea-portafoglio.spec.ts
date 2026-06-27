import { test, expect } from '@playwright/test';

// ─── Validazione: nome vuoto ───────────────────────────────────────────────────
test('validazione nome vuoto mostra messaggio errore inline', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('form', { name: 'Crea portafoglio' })).toBeVisible();

  await page.getByRole('button', { name: 'Registra a mastro' }).click();

  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('alert')).toContainText(/vuoto/i);
});

// ─── Validazione: nome duplicato ──────────────────────────────────────────────
test('nome duplicato mostra messaggio errore 409', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('form', { name: 'Crea portafoglio' })).toBeVisible();

  // Create first portfolio
  await page.getByLabel('Denominazione del conto').fill('Conto Unico');
  await page.getByRole('button', { name: 'Registra a mastro' }).click();
  await expect(page.getByText('Conto Unico')).toBeVisible();

  // Try to create duplicate
  await page.getByLabel('Denominazione del conto').fill('Conto Unico');
  await page.getByRole('button', { name: 'Registra a mastro' }).click();

  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('alert')).toContainText(/già/i);
});
