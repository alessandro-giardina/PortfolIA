/**
 * US-018: dettaglio di un titolo la cui anagrafica non è in archivio.
 *
 * Il criterio di accettazione più severo della spec: ciò che manca va dichiarato,
 * non riempito. Qui l'ISIN è rimosso dalla cache prima dello scenario, così la
 * scheda deve mostrare i dati di posizione calcolati dai soli carichi e
 * dichiarare tutto il resto — anagrafica, valore attuale, differenza, fonte.
 *
 * Nessun video: lo scenario dimostrativo è quello di US-018__dettaglio-titolo.
 *
 * ISIN riservato a questo file (regola un-ISIN-per-file in e2e/support/titoli.ts).
 * Il file non lo semina, lo rimuove: anche la rimozione è uno stack di undo, e
 * condividere la chiave con un altro file lascerebbe lo stesso residuo.
 */
import { test, expect } from './support/fixtures.js';
import { ISIN_SENZA_ANAGRAFICA_US_018 } from './support/titoli.js';

/** Le nove voci anagrafiche che, senza riga in cache, non hanno un valore. */
const VOCI_SENZA_DATO = [
  'Denominazione',
  'Ticker',
  'Tipo strumento',
  'Commissioni annue',
  'Valuta',
  'Emittente',
  'Segmento',
  'Politica dividendi',
  'Prezzo attuale',
];

test('senza anagrafica in archivio la scheda dichiara ogni campo assente, senza inventare valori', async ({
  page,
  archivio,
}) => {
  const { id: portfolioId } = await archivio.creaPortafoglio('Scheda Titolo Senza Anagrafica');

  // Il cache miss è la premessa dello scenario: va garantita, non ereditata.
  archivio.rimuoviTitolo(ISIN_SENZA_ANAGRAFICA_US_018);

  await archivio.aggiungiPosizione(
    portfolioId,
    ISIN_SENZA_ANAGRAFICA_US_018,
    '2026-05-03',
    242.50,
    40,
  );

  await page.goto(`/portfolio/${portfolioId}`);
  const riga = page.getByTestId(`riepilogo-${ISIN_SENZA_ANAGRAFICA_US_018}`);
  await expect(riga).toBeVisible({ timeout: 8000 });
  await riga.click();

  const scheda = page.getByTestId('scheda-titolo');
  await expect(scheda).toBeVisible({ timeout: 8000 });

  // 1. I dati di posizione ci sono: derivano dai soli carichi, non dalla cache
  await expect(page.getByTestId('dettaglio-quantita')).toHaveText('40');
  await expect(page.getByTestId('dettaglio-prezzo-medio')).toHaveText('€ 242,5000');

  // 2. Valore attuale e differenza sono dichiarati non disponibili, non azzerati
  await expect(page.getByTestId('dettaglio-valore-attuale')).toHaveText('Dato non disponibile');
  await expect(page.getByTestId('dettaglio-differenza')).toHaveText('Dato non disponibile');
  await expect(scheda.locator('.orizzonte.non-valorizzato')).toHaveCount(2);

  // 3. Ogni campo anagrafico è dichiarato assente; l'ISIN, che il portafoglio
  //    conosce da sé, resta l'unica voce valorizzata
  const anagrafica = page.getByTestId('anagrafica-titolo');
  for (const etichetta of VOCI_SENZA_DATO) {
    await expect(
      anagrafica.locator('.voce-def', { hasText: etichetta }).locator('.dato'),
    ).toHaveText('Dato non disponibile');
  }
  await expect(anagrafica.locator('.dato.assente')).toHaveCount(VOCI_SENZA_DATO.length);
  await expect(
    anagrafica.locator('.voce-def', { hasText: 'ISIN' }).locator('.dato'),
  ).toHaveText(ISIN_SENZA_ANAGRAFICA_US_018);

  // 4. La provenienza è dichiarata non registrata: nessuna fonte attribuita d'ufficio
  const fonte = page.getByTestId('fonte-dato');
  await expect(fonte.locator('.timbro-fonte')).toHaveText('Fonte non registrata');
  await expect(fonte).not.toContainText('Borsa Italiana');
  await expect(fonte).not.toContainText('MorningStar');
  // Il rimedio è nella riga stessa: fino a US-030 questa riga rimandava alla
  // Ricerca titoli, l'unico percorso allora disponibile per compilare
  // l'anagrafica. Ora il recupero si fa da qui, e il comando cambia verbo
  // perché non c'è nulla da rinfrescare.
  await expect(fonte.getByTestId('btn-aggiorna-dati')).toHaveText(/Recupera dati/);

  // 5. I carichi restano leggibili: sono l'unico dato certo di questa posizione
  const carichi = page.getByTestId('tabella-carichi-titolo').locator('tbody tr');
  await expect(carichi).toHaveCount(1);
  await expect(carichi.first()).toContainText('03.V.2026');
  // 242,50 × 40 = 9.700,00 — senza separatore di migliaia, come vuole la
  // convenzione italiana sui numeri a quattro cifre.
  await expect(carichi.first()).toContainText('9700,00');

  // 6. Nessun prezzo o valore inventato in pagina: niente zeri al posto del vuoto
  await expect(scheda).not.toContainText('€ 0,00');
  await expect(scheda).not.toContainText('0,0000');
});
