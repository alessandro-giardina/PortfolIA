/**
 * US-032 — le varianti delle due nuove colonne del riepilogo.
 *
 * Il file fratello `US-032__prezzo-e-rilevamento.spec.ts` registra il video del
 * percorso principale; qui vivono i rami che un video renderebbe solo confuso:
 * il titolo senza prezzo in archivio, la riga in cache priva di quotazione,
 * l'allineamento della riga di totale e l'attivazione da tastiera. Nessuno di
 * questi test registra artefatti.
 *
 * Tutti gli scenari lavorano su ISIN_SENZA_PREZZO_US_032, l'ISIN riservato a
 * questo file: il primo lo rimuove dalla cache, il secondo lo semina senza
 * quotazione, gli ultimi due con un prezzo noto. Rimuovere e seminare sono la
 * stessa pila di undo dell'archivio, e gli scenari girano in serie dentro il file
 * (`fullyParallel: false`), quindi la fixture ripristina comunque lo stato di
 * partenza.
 */
import { test, expect } from './support/fixtures.js';
import { ISIN_SENZA_PREZZO_US_032 } from './support/titoli.js';

const ISIN = ISIN_SENZA_PREZZO_US_032.isin;

/** Prezzo e istante seminati dagli scenari che hanno bisogno di una posizione valorizzata. */
const PREZZO_CORRENTE = 84.5;
const RILEVATO_IL = Math.floor(new Date(2026, 5, 3, 9, 5).getTime() / 1000);

test('un titolo senza prezzo in archivio mostra «–» in entrambe le nuove colonne', async ({
  page,
  archivio,
}) => {
  const { id: portfolioId } = await archivio.creaPortafoglio('Riepilogo Senza Prezzo');

  // La premessa dello scenario va garantita, non ereditata: senza riga in cache
  // né il prezzo né l'istante di rilevamento esistono.
  archivio.rimuoviTitolo(ISIN);
  await archivio.aggiungiPosizione(portfolioId, ISIN, '2026-01-20', 78.0, 12);

  await page.goto(`/portfolio/${portfolioId}`);
  await expect(page.getByTestId('tabella-riepilogo')).toBeVisible({ timeout: 8000 });

  const prezzoAttuale = page.getByTestId(`prezzo-attuale-${ISIN}`);
  const rilevamento = page.getByTestId(`rilevamento-${ISIN}`);

  await expect(prezzoAttuale).toHaveText('–');
  await expect(rilevamento).toHaveText('–');

  // Il trattino non è un valore qualsiasi: è il segno del dato mancante, lo
  // stesso già usato da «Valore attuale» e «Differenza».
  await expect(prezzoAttuale).toHaveClass(/dato-mancante/);
  await expect(rilevamento).toHaveClass(/dato-mancante/);
  await expect(page.getByTestId(`diff-${ISIN}`)).toHaveText('–');
});

test('una riga in cache senza prezzo non mostra comunque alcun istante di rilevamento', async ({
  page,
  archivio,
}) => {
  const { id: portfolioId } = await archivio.creaPortafoglio('Riepilogo Prezzo Nullo');

  // La fonte può registrare l'anagrafica senza quotazione: la riga esiste, con un
  // `fetched_at` valorizzato, ma `price` è nullo. Mostrare lì una data direbbe che
  // «il prezzo è stato rilevato» accanto a un «–» che afferma il contrario.
  archivio.seminaTitolo(ISIN, {
    name: 'Titolo Senza Quotazione',
    price: null,
    fetched_at: RILEVATO_IL,
  });
  await archivio.aggiungiPosizione(portfolioId, ISIN, '2026-01-20', 78.0, 12);

  await page.goto(`/portfolio/${portfolioId}`);
  await expect(page.getByTestId('tabella-riepilogo')).toBeVisible({ timeout: 8000 });

  const prezzoAttuale = page.getByTestId(`prezzo-attuale-${ISIN}`);
  const rilevamento = page.getByTestId(`rilevamento-${ISIN}`);

  await expect(prezzoAttuale).toHaveText('–');
  await expect(rilevamento).toHaveText('–');
  await expect(rilevamento).toHaveClass(/dato-mancante/);
});

test('la riga di totale resta allineata alle sette colonne', async ({ page, archivio }) => {
  const { id: portfolioId } = await archivio.creaPortafoglio('Riepilogo Totale Allineato');

  archivio.seminaTitolo(ISIN, {
    name: 'Titolo Con Prezzo Noto',
    price: PREZZO_CORRENTE,
    fetched_at: RILEVATO_IL,
  });
  await archivio.aggiungiPosizione(portfolioId, ISIN, '2026-01-20', 78.0, 12);

  await page.goto(`/portfolio/${portfolioId}`);
  const tabella = page.getByTestId('tabella-riepilogo');
  await expect(tabella).toBeVisible({ timeout: 8000 });

  // Tre celle: l'etichetta che copre le prime cinque colonne, poi i due totali.
  const celleTotale = tabella.locator('tfoot tr td');
  await expect(celleTotale).toHaveCount(3);
  await expect(celleTotale.nth(0)).toHaveAttribute('colspan', '5');

  // Allineamento vero, misurato: ogni totale cade sotto la propria intestazione.
  const intestazioni = tabella.locator('thead th');
  for (const [indiceTotale, indiceIntestazione] of [
    [1, 5],
    [2, 6],
  ]) {
    const totale = await celleTotale.nth(indiceTotale).boundingBox();
    const intestazione = await intestazioni.nth(indiceIntestazione).boundingBox();
    expect(totale).not.toBeNull();
    expect(intestazione).not.toBeNull();
    expect(Math.round(totale!.x)).toBe(Math.round(intestazione!.x));
    expect(Math.round(totale!.width)).toBe(Math.round(intestazione!.width));
  }

  // Con un'unica posizione valorizzata il totale coincide con la cella di riga…
  const valoreDiRiga = await tabella
    .locator(`[data-testid="riepilogo-${ISIN}"] td`)
    .nth(5)
    .textContent();
  await expect(celleTotale.nth(1)).toHaveText(valoreDiRiga ?? '');

  // …e con il riquadro «Valore attuale totale», che legge gli stessi dati.
  const riquadro = await page
    .getByTestId('valore-totale-portafoglio')
    .locator('.cifra-totale')
    .textContent();
  await expect(celleTotale.nth(1)).toHaveText((riquadro ?? '').replace('EUR', '').trim());
});

test('il tasto Invio sulla riga apre la scheda del titolo come il clic', async ({
  page,
  archivio,
}) => {
  const { id: portfolioId } = await archivio.creaPortafoglio('Riepilogo Tastiera');

  archivio.seminaTitolo(ISIN, {
    name: 'Titolo Con Prezzo Noto',
    price: PREZZO_CORRENTE,
    fetched_at: RILEVATO_IL,
  });
  await archivio.aggiungiPosizione(portfolioId, ISIN, '2026-01-20', 78.0, 12);

  await page.goto(`/portfolio/${portfolioId}`);
  await expect(page.getByTestId('tabella-riepilogo')).toBeVisible({ timeout: 8000 });

  const riga = page.getByTestId(`riepilogo-${ISIN}`);
  await riga.focus();
  await riga.press('Enter');

  const scheda = page.getByTestId('scheda-titolo');
  await expect(scheda).toBeVisible({ timeout: 8000 });
  await expect(scheda).toHaveAttribute('data-isin', ISIN);
});
