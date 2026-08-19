/**
 * US-050: Commutatore di design — scenari funzionali.
 *
 * Senza video e senza rallentamento: lo scenario demo con video vive in
 * demo__commuta-design.spec.ts.
 *
 * - design predefinito "mastro" senza preferenza salvata;
 * - commutazione a "quadro" con persistenza in localStorage;
 * - persistenza dopo un ricaricamento;
 * - commutazione di ritorno a "mastro".
 */
import { test, expect } from './support/fixtures.js';

test('design predefinito: senza preferenza salvata la pagina si apre in "mastro"', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('html')).toHaveAttribute('data-design', 'mastro');
  await expect(page.getByRole('button', { name: /quadro strumenti/i })).toBeVisible();
});

test('commutazione a "quadro": il pulsante aggiorna l\'attributo e salva la preferenza', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: /quadro strumenti/i }).click();

  await expect(page.locator('html')).toHaveAttribute('data-design', 'quadro');
  const preferenzaSalvata = await page.evaluate(() => localStorage.getItem('portfolia-design'));
  expect(preferenzaSalvata).toBe('quadro');
});

test('persistenza: la preferenza "quadro" resta applicata dopo un ricaricamento', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /quadro strumenti/i }).click();
  await expect(page.locator('html')).toHaveAttribute('data-design', 'quadro');

  await page.reload();

  await expect(page.locator('html')).toHaveAttribute('data-design', 'quadro');
});

test('commutazione di ritorno: due clic riportano il design a "mastro"', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: /quadro strumenti/i }).click();
  await expect(page.locator('html')).toHaveAttribute('data-design', 'quadro');

  await page.getByRole('button', { name: /libro mastro/i }).click();

  await expect(page.locator('html')).toHaveAttribute('data-design', 'mastro');
  const preferenzaSalvata = await page.evaluate(() => localStorage.getItem('portfolia-design'));
  expect(preferenzaSalvata).toBe('mastro');
});
