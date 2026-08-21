/**
 * US-051/TASK-10: quadro strumenti — riepilogo del portafoglio.
 *
 * Copre, contro il nuovo design «quadro» (US-050/US-051) e non contro il
 * libro mastro:
 *  1. il guscio (barra laterale) e le cinque carte KPI, con cifre coerenti
 *     su un mix di rilevamenti (fresco, obsoleto, mai rilevato);
 *  2. l'apertura della scheda titolo da una riga, col guscio quadro che
 *     resta montato invece di sparire;
 *  3. il commutatore di tema, con persistenza dopo un ricaricamento;
 *  4. la navigazione dalla barra laterale (Portafogli, Carico titoli);
 *  5. il pannello Composizione — percentuali che sommano a ~100% e la
 *     posizione senza prezzo esplicitamente esclusa;
 *  6. il grafico del portafoglio, montato con un tracciato reale.
 *
 * Tre titoli, riservati a questo file (regola un-ISIN-per-file, verificata da
 * `verifica-chiavi.ts`): uno rilevato adesso, uno rilevato in una sessione di
 * borsa ormai chiusa (quattordici giorni indietro — resta obsoleto a
 * qualunque ora giri la suite, stesso argomento di
 * `US-034__rilevamento-obsoleto.spec.ts`), uno mai iscritto in cache. Il
 * terzetto è ciò che rende non banali le carte «Da aggiornare» e «Senza
 * prezzo»: con un solo titolo, o con titoli tutti allineati, resterebbero
 * entrambe a zero e non proverebbero nulla.
 *
 * Solo il titolo «fresco» porta osservazioni di prezzo esplicite
 * (`archivio.seminaOsservazioni`): è l'unico modo per ottenere un tracciato
 * reale nel grafico del portafoglio. `GET /api/portfolios/:id/series` legge
 * la tabella `price_observations`, mai la cache `securities` — il prezzo
 * seminato lì con `seminaTitolo` alimenta le carte KPI e la tabella, non il
 * grafico. Il backfill che genera un'osservazione dalla cache gira una sola
 * volta, all'avvio del server: con `reuseExistingServer` il server è già in
 * ascolto da prima che questo file semini i propri ISIN, quindi quel
 * backfill non si applica a righe seminate a metà suite.
 *
 * Ogni scenario ricrea da capo il proprio portafoglio con
 * `archivio.creaPortafoglio`: nessuno stato condiviso fra test. Seminare più
 * volte, nello stesso file, gli stessi tre ISIN è sicuro — la regola
 * un-ISIN-per-file vieta la condivisione *fra* file, non le seminagioni
 * ripetute dentro uno stesso file, che gira in serie con sé stesso
 * (`fullyParallel: false`).
 */
import { test, expect } from './support/fixtures.js';
import type { GestoreArchivio } from './support/fixtures.js';
import {
  ISIN_MAI_RILEVATO_US_051,
  TITOLO_US_051_FRESCO,
  TITOLO_US_051_OBSOLETO,
} from './support/titoli.js';
import type { Page } from '@playwright/test';

const GIORNO = 24 * 60 * 60;

const ISIN_FRESCO = TITOLO_US_051_FRESCO.isin;
const ISIN_OBSOLETO = TITOLO_US_051_OBSOLETO.isin;
const ISIN_MAI_RILEVATO = ISIN_MAI_RILEVATO_US_051.isin;

/**
 * Rilevamento fissato quattordici giorni indietro *da adesso*, non a una data
 * di calendario: quattordici giorni contengono sempre almeno una sessione di
 * borsa conclusa, a qualunque ora e in qualunque giorno la suite giri (stesso
 * argomento di `TITOLO_US_034_OBSOLETO` in `US-034__rilevamento-obsoleto.spec.ts`).
 */
const RILEVATO_IL = Math.floor(Date.now() / 1000) - 14 * GIORNO;

const QUANTITA_FRESCO = 10;
const PREZZO_CARICO_FRESCO = 90;
const QUANTITA_OBSOLETO = 8;
const PREZZO_CARICO_OBSOLETO = 70;
const QUANTITA_MAI_RILEVATO = 15;
const PREZZO_CARICO_MAI_RILEVATO = 40;

/**
 * Crea un portafoglio con i tre titoli (fresco, obsoleto, mai rilevato) e
 * restituisce id e nome. La premessa è garantita qui, non ereditata: ogni
 * scenario la richiama da capo.
 */
async function creaPortafoglioDiProva(archivio: GestoreArchivio) {
  const { id, name } = await archivio.creaPortafoglio('Quadro Riepilogo');

  archivio.seminaTitolo(ISIN_FRESCO, TITOLO_US_051_FRESCO.campi);
  archivio.seminaTitolo(ISIN_OBSOLETO, { ...TITOLO_US_051_OBSOLETO.campi, fetched_at: RILEVATO_IL });
  archivio.rimuoviTitolo(ISIN_MAI_RILEVATO);

  await archivio.aggiungiPosizione(id, ISIN_FRESCO, '2026-01-10', PREZZO_CARICO_FRESCO, QUANTITA_FRESCO);
  await archivio.aggiungiPosizione(id, ISIN_OBSOLETO, '2026-02-05', PREZZO_CARICO_OBSOLETO, QUANTITA_OBSOLETO);
  await archivio.aggiungiPosizione(
    id,
    ISIN_MAI_RILEVATO,
    '2026-03-01',
    PREZZO_CARICO_MAI_RILEVATO,
    QUANTITA_MAI_RILEVATO,
  );

  // Solo il fresco porta osservazioni: è l'unico modo per un tracciato reale
  // nel grafico, che legge `price_observations` e non la cache `securities`
  // (vedi intestazione del file). Due prezzi diversi, non uno solo: un punto
  // solo non disegnerebbe un segmento da poter definire "tracciato".
  const adesso = archivio.leggiTitolo(ISIN_FRESCO)!.fetched_at;
  archivio.seminaOsservazioni(ISIN_FRESCO, [
    { price: 95, observed_at: adesso - 60 * GIORNO, data_source: 'borsaitaliana' },
    {
      price: TITOLO_US_051_FRESCO.campi.price!,
      observed_at: adesso - 10 * GIORNO,
      data_source: 'borsaitaliana',
    },
  ]);

  return { id, name };
}

/**
 * Apre il portafoglio già nel design «quadro».
 *
 * Non tramite il bottone «Vista Quadro Strumenti» di `Foglio` (il meccanismo di
 * `US-050__commutatore-design.spec.ts`): su questa pagina `Guscio` e `Foglio`
 * chiamano ciascuno una propria istanza di `useDesign()` — due `useState`
 * indipendenti che leggono lo stesso `document.documentElement.dataset` solo
 * al proprio montaggio. Un clic sul bottone dentro `Foglio` aggiorna lo stato
 * *di `Foglio`* (da cui l'etichetta «Vista Libro Mastro» dopo il clic) e l'attributo
 * globale sul `<html>`, ma non quello di `Guscio`, che quindi continua a
 * renderizzare `<Foglio>` invece di passare a `<Quadro>` — un'incoerenza reale
 * dell'app, invisibile a `US-050` perché quella spec verifica solo l'attributo
 * e l'etichetta del bottone, mai la presenza del guscio quadro sotto di essi.
 *
 * La preferenza è quindi impostata in `localStorage` **prima** della
 * navigazione, cosicché lo script di bootstrap di `index.html` la applichi
 * all'attributo `data-design` prima ancora che React monti: ogni istanza di
 * `useDesign()`, `Guscio` compreso, legge così lo stesso valore corretto fin
 * dal primo render, e il guscio quadro compare da subito.
 */
async function apriInQuadro(page: Page, id: number, name: string) {
  await page.addInitScript(() => {
    localStorage.setItem('portfolia-design', 'quadro');
  });
  await page.goto(`/portfolio/${id}`);
  // Il nome del conto compare due volte nel guscio quadro: nelle briciole
  // (`<b>`) e nell'`h1` di `.titolo-pagina` (US-051, rework/TASK-13) — un
  // `getByText` semplice sarebbe ambiguo. L'`h1` è il riferimento univoco.
  await expect(page.locator('.titolo-pagina h1')).toHaveText(name, { timeout: 8000 });

  await expect(page.locator('html')).toHaveAttribute('data-design', 'quadro');
  await expect(page.getByTestId('barra-laterale')).toBeVisible();
}

test('guscio quadro e le cinque carte KPI mostrano cifre coerenti col mix di rilevamenti', async ({
  page,
  archivio,
}) => {
  const { id, name } = await creaPortafoglioDiProva(archivio);
  await apriInQuadro(page, id, name);

  // Il guscio: barra laterale visibile, con le voci di navigazione attese.
  await expect(page.getByTestId('barra-laterale')).toBeVisible();
  await expect(page.getByTestId(`riepilogo-${ISIN_FRESCO}`)).toBeVisible({ timeout: 8000 });
  await expect(page.getByTestId(`riepilogo-${ISIN_OBSOLETO}`)).toBeVisible();
  await expect(page.getByTestId(`riepilogo-${ISIN_MAI_RILEVATO}`)).toBeVisible();

  // Valore attuale: solo le due posizioni con prezzo (102,5×10 + 76,3×8 = 1635,40;
  // sotto le 10.000 unità 'it-IT' non raggruppa le migliaia, per Intl.NumberFormat).
  const kpiValore = page.getByTestId('kpi-valore-attuale');
  await expect(kpiValore).toContainText('1635,40');
  await expect(kpiValore).toContainText('2 di 3');

  // Capitale investito: il costo di carico di TUTTE le posizioni aperte,
  // prezzo o non prezzo (90×10 + 70×8 + 40×15 = 2060,00).
  const kpiCapitale = page.getByTestId('kpi-capitale-investito');
  await expect(kpiCapitale).toContainText('2060,00');
  await expect(kpiCapitale).toContainText('3 posizioni aperte');

  // Differenza: sulle sole posizioni valorizzate (125,00 + 50,40 = +175,40;
  // 175,40 / 1.460,00 × 100 ≈ +12,01 %).
  const kpiDifferenza = page.getByTestId('kpi-differenza');
  await expect(kpiDifferenza).toContainText('+175,40');
  await expect(kpiDifferenza).toContainText('+12,01');

  // Da aggiornare: un solo titolo con rilevamento obsoleto.
  await expect(page.getByTestId('kpi-da-aggiornare')).toContainText('1');

  // Senza prezzo: un solo titolo mai rilevato, escluso dal totale.
  await expect(page.getByTestId('kpi-senza-prezzo')).toContainText('1');
});

test('una riga apre la scheda titolo, e il guscio quadro resta montato', async ({ page, archivio }) => {
  const { id, name } = await creaPortafoglioDiProva(archivio);
  await apriInQuadro(page, id, name);

  await page.getByTestId(`riepilogo-${ISIN_FRESCO}`).click();

  await expect(page.getByTestId('btn-torna-riepilogo')).toBeVisible();
  // Il guscio non viene smontato dal cambio di scheda interna: è lo stesso
  // albero React, solo il contenuto centrale cambia.
  await expect(page.getByTestId('barra-laterale')).toBeVisible();
});

test('il commutatore di tema cambia il dataset e la preferenza resta dopo un ricaricamento', async ({
  page,
  archivio,
}) => {
  const { id, name } = await creaPortafoglioDiProva(archivio);
  await apriInQuadro(page, id, name);

  // Nessuna preferenza salvata in un contesto di browser nuovo: il tema
  // predefinito è "scuro" (`useTema`, bootstrap di `index.html`).
  await expect(page.locator('html')).toHaveAttribute('data-tema', 'scuro');

  await page.getByTestId('toggle-tema').click();
  await expect(page.locator('html')).toHaveAttribute('data-tema', 'chiaro');

  await page.reload();

  await expect(page.locator('html')).toHaveAttribute('data-tema', 'chiaro');
  // Anche il design "quadro" persiste al ricaricamento (già coperto da
  // US-050, riverificato qui perché è la premessa di questo intero file).
  await expect(page.locator('html')).toHaveAttribute('data-design', 'quadro');
});

test('la barra laterale porta all\'elenco portafogli e alla scheda "Carico titoli"', async ({
  page,
  archivio,
}) => {
  const { id, name } = await creaPortafoglioDiProva(archivio);
  await apriInQuadro(page, id, name);

  const barraLaterale = page.getByTestId('barra-laterale');

  await barraLaterale.getByRole('link', { name: /portafogli/i }).click();
  await expect(page).toHaveURL('/');

  await page.goBack();
  await expect(page.getByTestId('barra-laterale')).toBeVisible();

  await barraLaterale.locator('a', { hasText: 'Carico titoli' }).click();
  // Il `data-testid` e non l'`id` del modulo: da US-054 la scheda carico ha una
  // resa quadro propria (`CaricoQuadro`), e `#form-carico` era il modulo del
  // mastro che il quadro rendeva finché la sua gemella non esisteva. Il
  // comportamento asserito è lo stesso — la voce di navigazione apre la scheda
  // carico — e il `data-testid` è condiviso dalle due rese per costruzione.
  await expect(page.getByTestId('input-isin')).toBeVisible({ timeout: 8000 });
});

test('il pannello Composizione somma a circa 100% ed esplicita la posizione esclusa', async ({
  page,
  archivio,
}) => {
  const { id, name } = await creaPortafoglioDiProva(archivio);
  await apriInQuadro(page, id, name);

  const composizione = page.getByTestId('composizione-portafoglio');
  await expect(composizione).toBeVisible();

  // Solo le due posizioni valorizzate entrano nella ciambella: il titolo mai
  // rilevato non compare fra le fette.
  const percentuali = await composizione.locator('.quota .valori span:last-child').allTextContents();
  expect(percentuali).toHaveLength(2);

  const somma = percentuali.reduce((totale, testo) => {
    const numero = Number(testo.replace('%', '').trim().replace(/\./g, '').replace(',', '.'));
    return totale + numero;
  }, 0);
  expect(somma).toBeGreaterThan(99.9);
  expect(somma).toBeLessThan(100.1);

  // La posizione esclusa è dichiarata per esteso, non solo omessa in silenzio.
  await expect(composizione.locator('.nota-composizione')).toHaveText(
    'Calcolato sulle 2 posizioni con prezzo — 1 posizione esclusa per prezzo mancante.',
  );
});

test('il grafico del portafoglio monta un tracciato reale', async ({ page, archivio }) => {
  const { id, name } = await creaPortafoglioDiProva(archivio);
  await apriInQuadro(page, id, name);

  const grafico = page.getByTestId('grafico-portafoglio');
  await expect(grafico).toBeVisible({ timeout: 8000 });
  await expect(grafico.locator('svg.tracciato')).toBeVisible();
});

test('il titolo di pagina porta il nome del conto, senza il timbro da registro del mastro', async ({
  page,
  archivio,
}) => {
  const { id, name } = await creaPortafoglioDiProva(archivio);
  await apriInQuadro(page, id, name);

  await expect(page.locator('.titolo-pagina h1')).toHaveText(name);

  // Il timbro da libro mastro (VOL./ANNO/numero progressivo) è una semantica
  // del solo design mastro (Foglio.tsx): il guscio quadro non deve mostrarne
  // traccia (US-051, rework — Quadro.tsx non consuma più `registro`).
  await expect(page.getByText('VOL.')).toHaveCount(0);
  await expect(page.getByText('Portafoglio n.')).toHaveCount(0);
});
