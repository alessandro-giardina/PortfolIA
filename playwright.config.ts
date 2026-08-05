import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  reporter: 'list',
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
