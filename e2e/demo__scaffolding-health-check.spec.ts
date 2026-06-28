/**
 * Smoke test: l'app si avvia, la dashboard del Libro Mastro si carica e il
 * backend è raggiungibile (nessun messaggio "Backend non raggiungibile").
 *
 * Nota: in origine questo demo verificava la pagina di scaffolding di US-001
 * ("Backend raggiungibile" / "status: ok"); da US-005 la home è la dashboard,
 * quindi il test è stato riallineato alla UI corrente.
 */
import { test, expect } from '@playwright/test';

test.use({
  video: 'on',
  launchOptions: { slowMo: 300 },
  viewport: { width: 1280, height: 720 },
});

test('demo — l’app si avvia e la dashboard è raggiungibile', async ({ page }) => {
  await page.goto('/');

  // La testata del Libro Mastro è renderizzata.
  await expect(page.getByRole('heading', { name: 'Libro Mastro' })).toBeVisible({ timeout: 10000 });

  // Il backend risponde: nessun errore di raggiungibilità e la lista conti è presente.
  await expect(page.getByText('Backend non raggiungibile')).toHaveCount(0);
  await expect(page.getByText('Conti aperti a mastro')).toBeVisible();

  // Health endpoint del backend OK.
  const health = await page.request.get('http://localhost:3200/health');
  expect(health.ok()).toBeTruthy();
  expect((await health.json()).status).toBe('ok');

  await page.waitForTimeout(1500);
});
