/**
 * US-033: varianti della resa a due righe delle sotto-etichette.
 *
 * Tre rischi che lo scenario demo non copre, e che questa modifica introduce
 * proprio perché tocca una regola condivisa:
 *
 *  a) portare la nota su una riga sua non deve rompere il clic-per-fuoco: lo
 *     span resta *dentro* la `<label>`, e la tentazione naturale — spostarlo
 *     fuori — sarebbe la regressione che il terzo criterio intercetta;
 *  b) `.riga-modulo label` è condivisa da «Crea portafoglio» e «Rinomina conto»,
 *     dove l'etichetta è una riga sola: il passaggio a `flex-direction: column`
 *     le avrebbe incollate al bordo superiore della cella senza il
 *     `justify-content: center` che ne prende il posto;
 *  c) righe più alte non devono produrre scroll orizzontale alle soglie
 *     responsive già in vigore.
 *
 * Niente video né slowMo: qui non c'è nulla da guardare, solo da misurare. Lo
 * scenario demo vive in US-033__sotto-etichette-modulo.spec.ts.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/fixtures.js';
import { misuraEtichettaSingola, misuraRigheCarico } from './support/etichette.js';

/** Le quattro righe del modulo quando /portfolio/:id è aperta direttamente. */
const RIGHE_SENZA_PRECOMPILAZIONE = [
  { campo: 'carico-isin', etichetta: 'ISIN' },
  { campo: 'carico-data', etichetta: 'Data di carico' },
  { campo: 'carico-prezzo', etichetta: 'Prezzo di acquisto' },
  { campo: 'carico-quantita', etichetta: 'Quantità' },
];

/**
 * Porta la pagina di dettaglio sulla scheda «Carico titoli».
 *
 * Aprendo /portfolio/:id senza precompilazione la scheda iniziale è «Riepilogo»:
 * il modulo di carico esiste solo dopo il cambio di linguetta.
 */
async function apriSchedaCarico(page: Page): Promise<void> {
  await page.locator('nav.linguette a', { hasText: 'Carico titoli' }).click();
  await expect(page.getByTestId('input-isin')).toBeVisible({ timeout: 15000 });
}

/** Clic al centro di un rettangolo misurato, e id dell'elemento che ha preso il fuoco. */
async function fuocoDopoClicSu(
  page: Page,
  rett: { left: number; right: number; top: number; bottom: number },
): Promise<string> {
  await page.mouse.click((rett.left + rett.right) / 2, (rett.top + rett.bottom) / 2);
  return page.evaluate(() => document.activeElement?.id ?? '');
}

test('il clic sull\'etichetta e sulla nota porta il fuoco sul campo della riga', async ({
  page,
  archivio,
}) => {
  const { id: portfolioId } = await archivio.creaPortafoglio('Fuoco Sotto Etichette');

  // Senza `prefill` nello state del router la riga «Nome titolo» non è resa: le
  // righe sono quattro, tutte con il campo abilitato. L'associazione della
  // quinta — disabilitata, quindi incapace di ricevere il fuoco — è verificata
  // strutturalmente nello scenario demo, dove la precompilazione la rende.
  await page.goto(`/portfolio/${portfolioId}`);
  await apriSchedaCarico(page);

  const righe = await misuraRigheCarico(page);
  expect(righe.map((r) => r.campo)).toEqual(RIGHE_SENZA_PRECOMPILAZIONE.map((r) => r.campo));

  for (const [indice, atteso] of RIGHE_SENZA_PRECOMPILAZIONE.entries()) {
    const riga = righe[indice];

    // Il fuoco parte da altrove, altrimenti l'asserzione potrebbe passare per
    // inerzia dalla riga precedente.
    await page.evaluate(() => {
      (document.activeElement as HTMLElement | null)?.blur();
    });

    expect(
      await fuocoDopoClicSu(page, riga.rettEtichetta),
      `clic sull'etichetta «${atteso.etichetta}»`,
    ).toBe(atteso.campo);

    await page.evaluate(() => {
      (document.activeElement as HTMLElement | null)?.blur();
    });

    expect(
      await fuocoDopoClicSu(page, riga.rettNota),
      `clic sulla nota della riga «${atteso.etichetta}»`,
    ).toBe(atteso.campo);
  }
});

test('le etichette a riga singola degli altri moduli restano centrate nella cella', async ({
  page,
  archivio,
}) => {
  const { id: portfolioId } = await archivio.creaPortafoglio('Etichette Riga Singola');

  /** Scarto fra il centro verticale del testo e quello della cella che lo ospita. */
  const scarto = (m: Awaited<ReturnType<typeof misuraEtichettaSingola>>) =>
    Math.abs(
      (m.rettEtichetta.top + m.rettEtichetta.bottom) / 2 -
        (m.rettCella.top + m.rettCella.bottom) / 2,
    );

  // «Denominazione del conto», nel modulo di creazione della dashboard
  await page.goto('/');
  await expect(page.locator('label[for="portfolio-name"]')).toBeVisible({ timeout: 15000 });
  const creazione = await misuraEtichettaSingola(page, 'label[for="portfolio-name"]');
  // La cella è più alta del testo — la griglia la stira sull'altezza della riga —
  // quindi il centraggio è una proprietà da verificare, non una tautologia.
  expect(creazione.rettCella.height).toBeGreaterThan(creazione.rettEtichetta.height);
  expect(scarto(creazione), 'etichetta «Denominazione del conto» centrata').toBeLessThan(2);

  // «Rinomina conto», nel riquadro di gestione del dettaglio portafoglio
  await page.goto(`/portfolio/${portfolioId}`);
  await expect(page.locator('label[for="rename-input"]')).toBeVisible({ timeout: 15000 });
  const rinomina = await misuraEtichettaSingola(page, 'label[for="rename-input"]');
  expect(rinomina.rettCella.height).toBeGreaterThan(rinomina.rettEtichetta.height);
  expect(scarto(rinomina), 'etichetta «Rinomina conto» centrata').toBeLessThan(2);
});

test('alle soglie 840, 760 e 640px il modulo non scorre in orizzontale e la nota resta su riga propria', async ({
  page,
  archivio,
}) => {
  const { id: portfolioId } = await archivio.creaPortafoglio('Soglie Sotto Etichette');

  await page.goto(`/portfolio/${portfolioId}`);
  await apriSchedaCarico(page);

  for (const larghezza of [840, 760, 640]) {
    await page.setViewportSize({ width: larghezza, height: 900 });
    // Un frame di assestamento: le media query rientrano nel layout successivo.
    await page.waitForTimeout(150);

    const scorrimenti = await page.evaluate(() => {
      // `:not(.scarico)` da US-042: la linguetta porta ora due moduli, e questa
      // misura riguarda quello di carico. `querySelector` avrebbe restituito il
      // primo — che è ancora quello giusto — ma per coincidenza dell'ordine di
      // resa, non per averlo chiesto.
      const modulo = document.querySelector('.riquadro-modulo:not(.scarico)')!;
      return {
        documento:
          document.documentElement.scrollWidth - document.documentElement.clientWidth,
        modulo: modulo.scrollWidth - modulo.clientWidth,
      };
    });
    expect(scorrimenti.documento, `scroll orizzontale del documento a ${larghezza}px`).toBeLessThanOrEqual(0);
    expect(scorrimenti.modulo, `scroll orizzontale del modulo a ${larghezza}px`).toBeLessThanOrEqual(0);

    // Sotto i 760px l'etichetta si impila sopra il campo: la nota deve restare
    // comunque sotto l'etichetta, non tornare a fianco.
    const righe = await misuraRigheCarico(page);
    expect(righe.length).toBeGreaterThan(0);
    for (const riga of righe) {
      expect(
        riga.rettNota.top,
        `nota di «${riga.etichetta}» su riga propria a ${larghezza}px`,
      ).toBeGreaterThanOrEqual(riga.rettEtichetta.bottom);
    }
  }
});
