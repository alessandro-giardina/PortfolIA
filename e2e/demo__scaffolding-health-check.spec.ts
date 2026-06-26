import { test, expect } from '@playwright/test';

test.use({
  video: 'on',
  launchOptions: { slowMo: 300 },
  viewport: { width: 1280, height: 720 },
});

test('demo — sviluppatore apre la pagina e vede conferma backend raggiungibile', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText('PortfolIA')).toBeVisible();

  await expect(
    page.getByText('Backend raggiungibile')
  ).toBeVisible({ timeout: 10000 });

  const backendText = page.getByText(/status:.*ok/i);
  await expect(backendText).toBeVisible();

  await page.waitForTimeout(1500);
});
