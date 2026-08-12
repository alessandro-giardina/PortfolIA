/**
 * US-034 — le varianti della marcatura dei rilevamenti nel riepilogo.
 *
 * Il file fratello `US-034__rilevamento-obsoleto.spec.ts` registra il video del
 * percorso principale; qui vivono i due rami che un video renderebbe solo
 * confusi: il portafoglio interamente allineato — dove la verifica è che il
 * riquadro *resti*, anziché lasciare uno spazio vuoto — e il titolo mai
 * rilevato, la cui postilla è distinta da quella dell'obsoleto. Nessuno di
 * questi test registra artefatti.
 *
 * I due scenari lavorano su ISIN riservati a questo file: TITOLO_US_034_VARIANTI
 * viene seminato, ISIN_MAI_RILEVATO_US_034 viene rimosso dalla cache. Seminare e
 * rimuovere sono la stessa pila di undo dell'archivio, e gli scenari girano in
 * serie dentro il file (`fullyParallel: false`), quindi la fixture ripristina
 * comunque lo stato di partenza.
 */
import { test, expect } from './support/fixtures.js';
import { ISIN_MAI_RILEVATO_US_034, TITOLO_US_034_VARIANTI } from './support/titoli.js';

const ISIN_ALLINEATO = TITOLO_US_034_VARIANTI.isin;
const ISIN_MAI_RILEVATO = ISIN_MAI_RILEVATO_US_034.isin;

test('un portafoglio rilevato per intero adesso non ha marcature, ma il riquadro resta', async ({
  page,
  archivio,
}) => {
  const { id: portfolioId } = await archivio.creaPortafoglio('Riepilogo Tutto Allineato');

  // Seminato senza `fetched_at`: il default è adesso, e un rilevamento «adesso»
  // non può risultare obsoleto a nessuna ora — `classifyRefetch(now, now)` è
  // `intra-session` o `no-session`, mai `none`.
  archivio.seminaTitolo(ISIN_ALLINEATO, { ...TITOLO_US_034_VARIANTI.campi });
  await archivio.aggiungiPosizione(portfolioId, ISIN_ALLINEATO, '2026-01-20', 95.0, 18);

  await page.goto(`/portfolio/${portfolioId}`);
  await expect(page.getByTestId('tabella-riepilogo')).toBeVisible({ timeout: 8000 });

  // Nessuna riga è marcata: non solo quella del titolo seminato — nessuna, in
  // tutta la pagina.
  await expect(page.locator('[data-testid^="marca-rilevamento-"]')).toHaveCount(0);

  // E il riquadro non sparisce: uno spazio vuoto sarebbe indistinguibile da una
  // funzionalità che non ha caricato. A zero cambia frase, non esistenza.
  const conteggio = page.getByTestId('conteggio-da-aggiornare');
  await expect(conteggio).toBeVisible();
  await expect(page.getByTestId('frase-conteggio')).toHaveText(
    'L’unico titolo è allineato all’ultima sessione di borsa.',
  );
});

test('un titolo mai rilevato porta una postilla distinta e rientra nel conteggio', async ({
  page,
  archivio,
}) => {
  const { id: portfolioId } = await archivio.creaPortafoglio('Riepilogo Mai Rilevato');

  // La premessa va garantita, non ereditata: senza riga in cache non esistono né
  // il prezzo né l'istante di rilevamento.
  archivio.rimuoviTitolo(ISIN_MAI_RILEVATO);
  await archivio.aggiungiPosizione(portfolioId, ISIN_MAI_RILEVATO, '2026-01-20', 78.0, 12);

  await page.goto(`/portfolio/${portfolioId}`);
  await expect(page.getByTestId('tabella-riepilogo')).toBeVisible({ timeout: 8000 });

  // La postilla dice *quale* delle due assenze si sta guardando, e lo dice con
  // parole diverse da «da aggiornare»: le due condizioni restano distinguibili
  // anche senza colore.
  const marca = page.getByTestId(`marca-rilevamento-${ISIN_MAI_RILEVATO}`);
  await expect(marca).toBeVisible();
  await expect(marca).toHaveText('mai rilevato');
  await expect(marca).not.toHaveText('da aggiornare');

  // La postilla non riscrive la cella: il «–» stabilito da US-032 resta identico.
  const rilevamento = page.getByTestId(`rilevamento-${ISIN_MAI_RILEVATO}`);
  await expect(rilevamento).toHaveText('–');
  await expect(rilevamento).toHaveClass(/dato-mancante/);

  // E il titolo rientra fra quelli da aggiornare, come l'obsoleto.
  await expect(page.getByTestId('frase-conteggio')).toHaveText('1 titolo su 1 mai rilevato.');
});
