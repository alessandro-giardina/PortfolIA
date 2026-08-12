import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  // Solo i `*.spec.ts`. Il default di Playwright raccoglie anche i `*.test.ts`, e
  // da US-040 `e2e/support/` ne contiene: sono i test unitari di Vitest sul
  // controllo delle chiavi, che caricati qui esploderebbero all'import di
  // `vitest`. La divisione dei suffissi è la stessa già in uso nel workspace
  // `server`, dove i test unitari sono `*.test.ts`.
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  reporter: 'list',
  // Bonifica dei portafogli residui prima che i test partano (US-029). Playwright
  // avvia i webServer *prima* del globalSetup, quindi qui l'API è già in ascolto.
  globalSetup: './e2e/support/bonifica.ts',
  use: {
    baseURL: 'http://localhost:5173',
    video: 'off',
  },
  // Artefatti transitori dei run (trace, video dei fallimenti). Playwright svuota
  // questa cartella a ogni esecuzione, quindi NON va puntata su una cartella di spec:
  // in passato lo era, e la spec di turno finiva per raccogliere gli artefatti di
  // tutte le altre e per vederseli cancellare al run successivo.
  // I video demo si salvano a parte in docs/test-results/<US-CODE>/ via
  // page.video().saveAs(), fuori da qui, così sopravvivono ai run successivi.
  outputDir: 'docs/test-results/_run/',
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'npm run dev --workspace=server',
      url: 'http://localhost:3200/health',
      reuseExistingServer: true,
      timeout: 10000,
    },
    {
      command: 'npm run dev --workspace=client',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 15000,
    },
  ],
});
