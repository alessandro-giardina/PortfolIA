/**
 * US-031: le soglie responsive già esistenti restano dove sono.
 *
 * Allargare il foglio a 1440px non deve spostare nulla di ciò che accade alle
 * finestre strette. Le tre soglie in vigore vengono misurate **ai due lati**:
 * una misura sola dimostrerebbe soltanto che una regola esiste, non che scatta
 * dove deve. È la coppia di misure a rendere questo test una non-regressione.
 *
 * | Soglia | Regola sorvegliata                                   |
 * |--------|------------------------------------------------------|
 * | 840px  | `.orizzonti` passa da 4 colonne a 2                   |
 * | 760px  | il margine rosso si stringe: `.testata` da 90px a 44px |
 * | 640px  | `.bottone-minuto` occupa tutta la riga di provenienza  |
 *
 * Niente video né slowMo: qui non c'è nulla da guardare, solo da misurare. Lo
 * scenario demo di US-031 vive in US-031__larghezza-foglio.spec.ts.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/fixtures.js';

/**
 * Porta la finestra alla larghezza indicata e restituisce le misure calcolate.
 *
 * Si legge da `getComputedStyle` e non dai bounding box perché le soglie sono
 * regole CSS: è il valore che il browser ha risolto a dover cambiare.
 */
async function misuraA(page: Page, larghezza: number) {
  await page.setViewportSize({ width: larghezza, height: 900 });
  // Un frame di assestamento: le media query rientrano nel layout successivo.
  await page.waitForTimeout(150);
  return page.evaluate(() => {
    const orizzonti = document.querySelector('.orizzonti')!;
    const testata = document.querySelector('.testata')!;
    const bottone = document.querySelector('.bottone-minuto')!;
    const rigaFonte = document.querySelector('.riga-fonte')!;
    const stileRiga = getComputedStyle(rigaFonte);
    return {
      colonneOrizzonti: getComputedStyle(orizzonti).gridTemplateColumns.split(/\s+/).length,
      padSinistroTestata: getComputedStyle(testata).paddingLeft,
      larghezzaBottone: parseFloat(getComputedStyle(bottone).width),
      // Larghezza utile della riga di provenienza, padding escluso: è il
      // "contenitore" che il bottone deve riempire sotto la soglia.
      larghezzaUtileRiga:
        rigaFonte.getBoundingClientRect().width -
        parseFloat(stileRiga.paddingLeft) -
        parseFloat(stileRiga.paddingRight) -
        parseFloat(stileRiga.borderLeftWidth) -
        parseFloat(stileRiga.borderRightWidth),
    };
  });
}

test('le soglie responsive a 840, 760 e 640px si comportano come prima dell\'allargamento', async ({
  page,
  archivio,
}) => {
  const { id: portfolioId } = await archivio.creaPortafoglio('Soglie Responsive');

  // ISIN letto e mai seminato: la sua anagrafica è già in archivio e a questo
  // test non interessano i valori, solo la geometria che li ospita.
  await archivio.aggiungiPosizione(portfolioId, 'IE00B4L5Y983', '2026-01-20', 95.5, 30);

  await page.goto(`/portfolio/${portfolioId}`);
  await page.getByTestId('riepilogo-IE00B4L5Y983').click();

  // La Scheda Titolo è l'unica schermata che contiene tutte e tre le regole.
  await expect(page.getByTestId('scheda-titolo')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.orizzonti')).toBeVisible();
  await expect(page.locator('.bottone-minuto')).toBeVisible();

  // ─── Soglia 840: il cartellino di posizione passa da 4 caselle a 2 ────────
  const sopra840 = await misuraA(page, 900);
  expect(sopra840.colonneOrizzonti).toBe(4);

  const sotto840 = await misuraA(page, 800);
  expect(sotto840.colonneOrizzonti).toBe(2);

  // ─── Soglia 760: il margine rosso si stringe da 90px a 44px ──────────────
  // La misura a 800px è la stessa finestra del lato "sotto" della soglia
  // precedente: 800 sta fra 760 e 840, ed è per questo che serve leggerla qui.
  expect(sotto840.padSinistroTestata).toBe('90px');

  const sotto760 = await misuraA(page, 700);
  expect(sotto760.padSinistroTestata).toBe('44px');

  // ─── Soglia 640: il comando di aggiornamento prende tutta la riga ─────────
  // A 700px il bottone è ancora una targhetta stretta, spinta a destra.
  expect(sotto760.larghezzaBottone).toBeLessThan(sotto760.larghezzaUtileRiga);

  const sotto640 = await misuraA(page, 620);
  expect(sotto640.larghezzaBottone).toBeCloseTo(sotto640.larghezzaUtileRiga, 0);
});
