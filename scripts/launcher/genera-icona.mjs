// Rende icona.html in un PNG 1024x1024 su sfondo trasparente.
// Riusa il Chromium di Playwright, che è già una dipendenza dell'applicazione
// (fonte di backup MorningStar), quindi non serve alcun tool grafico in più.
//
//   node scripts/launcher/genera-icona.mjs <percorso-png-di-uscita>

import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const qui = dirname(fileURLToPath(import.meta.url));
const uscita = resolve(process.argv[2] ?? join(qui, 'icona.png'));

const browser = await chromium.launch();
try {
  const pagina = await browser.newPage({
    viewport: { width: 1024, height: 1024 },
    deviceScaleFactor: 1,
  });
  await pagina.goto(pathToFileURL(join(qui, 'icona.html')).href);
  await pagina.screenshot({ path: uscita, omitBackground: true });
  console.log(uscita);
} finally {
  await browser.close();
}
