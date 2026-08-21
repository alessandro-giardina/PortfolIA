/**
 * US-066 — il pannello «Composizione» esclude le posizioni chiuse.
 *
 * Il bug: `Composizione.tsx` leggeva `enrichedPositions` — ogni posizione mai
 * iscritta, comprese quelle chiuse per intero (`totalQuantity === 0`) —
 * invece di `posizioniAperte`. Un ISIN venduto per intero ma con un prezzo
 * ancora valorizzato in cache entrava comunque nella ciambella come fetta a
 * valore zero, e il conteggio della nota di chiusura (`notaChiusura`) lo
 * contava fra le posizioni incluse invece di ignorarlo.
 *
 * Un solo scenario, tre posizioni che isolano ciascuna la propria variabile:
 *  - una posizione **aperta con prezzo**: deve comparire come unica fetta;
 *  - una posizione **aperta senza prezzo**: resta aperta (residuo > 0) ma va
 *    esclusa dal calcolo per prezzo mancante — e quell'esclusione va detta
 *    nella nota, non confusa con la chiusura;
 *  - una posizione **chiusa con prezzo residuo in cache**: la riproduzione
 *    esatta del difetto. Prima del fix comparirebbe comunque nel grafico
 *    (fetta a valore zero); dopo il fix non deve mai comparire, a prescindere
 *    dal prezzo che la cache conserva.
 *
 * La tabella «Posizioni chiuse» (EP-008) resta invariata: prova che il fix è
 * limitato al pannello Composizione, non alla vista nel suo complesso — la
 * stessa distinzione già verificata da US-065 per riquadro e coda di
 * aggiornamento.
 *
 * Titoli seminati: `TITOLO_US_066_APERTO_CON_PREZZO`,
 * `ISIN_US_066_APERTO_SENZA_PREZZO` (rimosso dalla cache, mai seminato) e
 * `TITOLO_US_066_CHIUSO_CON_PREZZO`, riservati a questo file (regola
 * un-ISIN-per-file in `e2e/support/titoli.ts`).
 */
import { test, expect } from './support/fixtures.js';
import { registraVendita } from './support/api.js';
import {
  ISIN_US_066_APERTO_SENZA_PREZZO,
  TITOLO_US_066_APERTO_CON_PREZZO,
  TITOLO_US_066_CHIUSO_CON_PREZZO,
} from './support/titoli.js';

const ISIN_APERTO_CON_PREZZO = TITOLO_US_066_APERTO_CON_PREZZO.isin;
const ISIN_APERTO_SENZA_PREZZO = ISIN_US_066_APERTO_SENZA_PREZZO.isin;
const ISIN_CHIUSO_CON_PREZZO = TITOLO_US_066_CHIUSO_CON_PREZZO.isin;

const QUANTITA_CHIUSA = 20;

test('il pannello Composizione esclude la posizione chiusa e conta correttamente le escluse per prezzo mancante', async ({
  page,
  archivio,
}) => {
  const { id: portfolioId } = await archivio.creaPortafoglio('Composizione Esclude Chiuse');

  // Le tre premesse, costruite esplicitamente e non ereditate.
  archivio.seminaTitolo(ISIN_APERTO_CON_PREZZO, TITOLO_US_066_APERTO_CON_PREZZO.campi);
  archivio.rimuoviTitolo(ISIN_APERTO_SENZA_PREZZO);
  archivio.seminaTitolo(ISIN_CHIUSO_CON_PREZZO, TITOLO_US_066_CHIUSO_CON_PREZZO.campi);

  await archivio.aggiungiPosizione(portfolioId, ISIN_APERTO_CON_PREZZO, '2026-01-10', 60.0, 10);
  await archivio.aggiungiPosizione(portfolioId, ISIN_APERTO_SENZA_PREZZO, '2026-01-15', 45.0, 5);

  // Il titolo chiuso: un carico e poi una vendita che ne esaurisce l'intero
  // residuo, la stessa fotografia esatta del difetto — quantità a zero, ma il
  // prezzo resta valorizzato in cache.
  await archivio.aggiungiPosizione(portfolioId, ISIN_CHIUSO_CON_PREZZO, '2025-06-01', 40.0, QUANTITA_CHIUSA);
  await registraVendita(portfolioId, ISIN_CHIUSO_CON_PREZZO, '2026-04-15', 50.0, QUANTITA_CHIUSA);

  // La preferenza di design va impostata prima della navigazione, così lo
  // script di bootstrap la applica prima ancora che React monti (stesso
  // pattern di `apriInQuadro` in `US-051__quadro-riepilogo.spec.ts` e di
  // `US-065__conteggio-solo-posizioni-aperte.spec.ts`, scenario (d)).
  await page.addInitScript(() => {
    localStorage.setItem('portfolia-design', 'quadro');
  });
  await page.goto(`/portfolio/${portfolioId}`);
  await expect(page.getByTestId('tabella-riepilogo')).toBeVisible({ timeout: 8000 });

  const composizione = page.getByTestId('composizione-portafoglio');
  await expect(composizione).toBeVisible();

  // Una sola fetta nella ciambella, ed è quella della posizione aperta e
  // valorizzata: né la posizione senza prezzo (esclusa per mancanza di
  // prezzo) né — soprattutto — quella chiusa (esclusa perché chiusa, a
  // prescindere dal prezzo che porta ancora in cache) compaiono come `<circle
  // data-isin>`.
  const fette = composizione.locator('circle[data-isin]');
  await expect(fette).toHaveCount(1);
  await expect(fette).toHaveAttribute('data-isin', ISIN_APERTO_CON_PREZZO);

  // La legenda concorda: una sola voce, quella del titolo aperto e
  // valorizzato.
  const quote = composizione.locator('.quota');
  await expect(quote).toHaveCount(1);
  await expect(quote).toContainText(ISIN_APERTO_CON_PREZZO);

  // Il titolo chiuso non compare in nessuna forma nel pannello — né come
  // fetta a valore zero (il difetto pre-fix), né nella legenda.
  await expect(composizione.getByText(ISIN_CHIUSO_CON_PREZZO)).toHaveCount(0);

  // La nota di chiusura conta esattamente 1 inclusa e 1 esclusa per prezzo
  // mancante: mai 2 incluse (che significherebbe che il titolo chiuso è
  // rientrato come fetta a valore zero), e mai la posizione chiusa contata
  // fra le escluse per prezzo — è aperta la posizione esclusa, non quella
  // chiusa.
  await expect(composizione.locator('.nota-composizione')).toHaveText(
    'Calcolato sulle 1 posizione con prezzo — 1 posizione esclusa per prezzo mancante.',
  );

  // La tabella «Posizioni chiuse» (EP-008) resta invariata dal fix: il
  // titolo chiuso vi compare ancora, a dimostrare che l'esclusione riguarda
  // solo il pannello Composizione.
  const tabellaChiuse = page.getByTestId('tabella-posizioni-chiuse');
  await expect(tabellaChiuse).toBeVisible();
  await expect(page.getByTestId(`posizione-chiusa-${ISIN_CHIUSO_CON_PREZZO}`)).toBeVisible();
});
