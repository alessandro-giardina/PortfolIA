/**
 * US-044: elencare le posizioni chiuse in una sezione dedicata — casi limite,
 * senza video.
 *
 * File sorello del demo `US-044__posizioni-chiuse.spec.ts`, per la stessa ragione
 * della coppia `US-026__*` e `US-043__*`: `launchOptions.slowMo` non si può
 * scoppiare a un solo `describe` (forza un nuovo worker), quindi il file che
 * registra il video resta unico e gli scenari che non lo richiedono vivono qui,
 * con la configurazione di default (`video: 'off'`).
 *
 * Tre casi, ripresi da `docs/mockups/US-044/riapertura.html` ed
 * `esaurito.html`:
 *
 * - **riapertura.** Un ISIN chiuso — uscito dalla tabella dei posseduti, entrato
 *   in «Posizioni chiuse» — riceve un nuovo carico: deve tornare in tabella con
 *   il badge «riaperta» e uscire da «Posizioni chiuse», mentre il registro
 *   unificato di «Carico titoli» continua a mostrare la vendita storica — è il
 *   criterio 4, e la riga che verifica che «non cancellare Posizioni chiuse» e
 *   «non cancellare la riga storica della vendita» sono due promesse diverse;
 * - **due posizioni chiuse.** Un secondo ISIN venduto per intero compare
 *   accanto al primo in «Posizioni chiuse», ciascuno con le proprie cifre;
 * - **portafoglio interamente venduto.** Con ogni posizione azzerata, la
 *   tabella dei posseduti mostra lo stato vuoto dedicato (distinto da quello di
 *   un portafoglio mai popolato), il valore attuale totale è € 0,00 misurato,
 *   «Posizioni chiuse» porta l'intero portafoglio, e il quadro del risultato
 *   mostra il realizzato pieno con il latente a zero misurato.
 *
 * Titoli seminati: TITOLO_US_044_VARIANTI e TITOLO_US_044_VARIANTI_SECONDO,
 * riservati a questo file (regola un-ISIN-per-file in e2e/support/titoli.ts).
 */
import { test, expect } from './support/fixtures.js';
import { registraVendita } from './support/api.js';
import { TITOLO_US_044_VARIANTI, TITOLO_US_044_VARIANTI_SECONDO } from './support/titoli.js';

const ISIN_1 = TITOLO_US_044_VARIANTI.isin;
const ISIN_2 = TITOLO_US_044_VARIANTI_SECONDO.isin;
const GIORNO_IN_MS = 24 * 60 * 60 * 1000;

/** La data civile di `giorni` fa, in `YYYY-MM-DD` UTC — stessa ragione del file demo. */
function dataCivileIndietro(giorni: number): string {
  const d = new Date(Date.now() - giorni * GIORNO_IN_MS);
  const mese = String(d.getUTCMonth() + 1).padStart(2, '0');
  const giorno = String(d.getUTCDate()).padStart(2, '0');
  return `${d.getUTCFullYear()}-${mese}-${giorno}`;
}

/** Cifra con due decimali all'italiana, es. "8.000,00" — come la scrive il registro. */
function importo(valore: number): string {
  return valore.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

test('un nuovo carico su un ISIN chiuso lo riapre in tabella con il badge, e non cancella la vendita storica', async ({
  page,
  archivio,
}) => {
  archivio.seminaTitolo(ISIN_1, TITOLO_US_044_VARIANTI.campi);
  const portafoglio = await archivio.creaPortafoglio('US044V-Riapertura');

  // Due carichi a prezzi diversi (altrimenti LIFO e FIFO coinciderebbero) e
  // una vendita che esaurisce l'intero residuo.
  await archivio.aggiungiPosizione(portafoglio.id, ISIN_1, dataCivileIndietro(600), 8.0, 500);
  await archivio.aggiungiPosizione(portafoglio.id, ISIN_1, dataCivileIndietro(300), 9.5, 300);
  const venditaChiusura = await registraVendita(portafoglio.id, ISIN_1, dataCivileIndietro(60), 10.0, 800);

  const INCASSO = 10.0 * 800; // 8.000,00
  const COSTO = 8.0 * 500 + 9.5 * 300; // 6.850,00
  const REALIZZATO = INCASSO - COSTO; // + 1.150,00

  await page.goto(`/portfolio/${portafoglio.id}`);

  // ─── Prima: la posizione è chiusa ──────────────────────────────────────────
  await expect(page.getByTestId(`riepilogo-${ISIN_1}`)).toHaveCount(0);
  const rigaChiusaPrima = page.getByTestId(`posizione-chiusa-${ISIN_1}`);
  await expect(rigaChiusaPrima).toBeVisible();
  // La quantità è un intero — "800", non "800,00" — mentre incasso e
  // realizzato sono importi a due decimali.
  await expect(rigaChiusaPrima).toContainText((800).toLocaleString('it-IT'));
  await expect(rigaChiusaPrima).toContainText(importo(INCASSO));
  await expect(rigaChiusaPrima).toContainText(importo(REALIZZATO));

  // ─── Un nuovo carico sullo stesso ISIN ──────────────────────────────────────
  await archivio.aggiungiPosizione(portafoglio.id, ISIN_1, dataCivileIndietro(5), 11.0, 150);
  await page.reload();

  // ─── Dopo: la posizione è di nuovo in tabella, con il badge ────────────────
  const rigaRiaperta = page.getByTestId(`riepilogo-${ISIN_1}`);
  await expect(rigaRiaperta).toBeVisible();
  await expect(rigaRiaperta).toContainText('150');
  await expect(page.getByTestId(`badge-riaperta-${ISIN_1}`)).toBeVisible();
  await expect(page.getByTestId(`badge-riaperta-${ISIN_1}`)).toContainText('riaperta');

  // E non compare più fra le posizioni chiuse.
  await expect(page.getByTestId(`posizione-chiusa-${ISIN_1}`)).toHaveCount(0);

  // ─── Il registro unificato non ha perduto la vendita storica ──────────────
  await page.locator('nav.linguette a', { hasText: 'Carico titoli' }).click();
  const rigaScarico = page.getByTestId(`scarico-${venditaChiusura.id}`);
  await expect(rigaScarico).toBeVisible();
  await expect(rigaScarico).toContainText(ISIN_1);
  await expect(rigaScarico).toContainText('800');
  await expect(rigaScarico).toContainText(importo(INCASSO));
});

test('un secondo ISIN venduto per intero compare accanto al primo in Posizioni chiuse, con cifre proprie', async ({
  page,
  archivio,
}) => {
  archivio.seminaTitolo(ISIN_1, TITOLO_US_044_VARIANTI.campi);
  archivio.seminaTitolo(ISIN_2, TITOLO_US_044_VARIANTI_SECONDO.campi);
  const portafoglio = await archivio.creaPortafoglio('US044V-Due-Chiuse');

  await archivio.aggiungiPosizione(portafoglio.id, ISIN_1, dataCivileIndietro(400), 7.0, 200);
  await registraVendita(portafoglio.id, ISIN_1, dataCivileIndietro(40), 9.0, 200);
  const INCASSO_1 = 9.0 * 200; // 1.800,00
  const REALIZZATO_1 = INCASSO_1 - 7.0 * 200; // + 400,00

  await archivio.aggiungiPosizione(portafoglio.id, ISIN_2, dataCivileIndietro(350), 20.0, 100);
  await registraVendita(portafoglio.id, ISIN_2, dataCivileIndietro(35), 25.0, 100);
  const INCASSO_2 = 25.0 * 100; // 2.500,00
  const REALIZZATO_2 = INCASSO_2 - 20.0 * 100; // + 500,00

  await page.goto(`/portfolio/${portafoglio.id}`);

  const tabellaChiuse = page.getByTestId('tabella-posizioni-chiuse');
  await expect(tabellaChiuse).toBeVisible();
  await expect(tabellaChiuse).toContainText('Totale posizioni chiuse (2)');

  const riga1 = page.getByTestId(`posizione-chiusa-${ISIN_1}`);
  await expect(riga1).toBeVisible();
  await expect(riga1).toContainText(importo(INCASSO_1));
  await expect(riga1).toContainText(importo(REALIZZATO_1));

  const riga2 = page.getByTestId(`posizione-chiusa-${ISIN_2}`);
  await expect(riga2).toBeVisible();
  await expect(riga2).toContainText(importo(INCASSO_2));
  await expect(riga2).toContainText(importo(REALIZZATO_2));

  // Nessuna delle due è più fra i posseduti.
  await expect(page.getByTestId(`riepilogo-${ISIN_1}`)).toHaveCount(0);
  await expect(page.getByTestId(`riepilogo-${ISIN_2}`)).toHaveCount(0);
});

test('con ogni posizione azzerata, il riepilogo mostra lo stato vuoto dedicato, il valore € 0,00 misurato e il realizzato pieno', async ({
  page,
  archivio,
}) => {
  archivio.seminaTitolo(ISIN_1, TITOLO_US_044_VARIANTI.campi);
  archivio.seminaTitolo(ISIN_2, TITOLO_US_044_VARIANTI_SECONDO.campi);
  const portafoglio = await archivio.creaPortafoglio('US044V-Interamente-Venduto');

  await archivio.aggiungiPosizione(portafoglio.id, ISIN_1, dataCivileIndietro(400), 7.0, 200);
  await registraVendita(portafoglio.id, ISIN_1, dataCivileIndietro(40), 9.0, 200);
  const REALIZZATO_1 = 9.0 * 200 - 7.0 * 200; // + 400,00

  await archivio.aggiungiPosizione(portafoglio.id, ISIN_2, dataCivileIndietro(350), 20.0, 100);
  await registraVendita(portafoglio.id, ISIN_2, dataCivileIndietro(35), 25.0, 100);
  const REALIZZATO_2 = 25.0 * 100 - 20.0 * 100; // + 500,00

  const REALIZZATO_TOTALE = REALIZZATO_1 + REALIZZATO_2; // + 900,00

  await page.goto(`/portfolio/${portafoglio.id}`);

  // ─── La tabella dei posseduti è vuota, e non con lo stesso messaggio di un
  //      portafoglio mai popolato ───────────────────────────────────────────
  await expect(page.getByTestId('riepilogo-tutte-chiuse')).toBeVisible();
  await expect(page.getByTestId('riepilogo-vuoto')).toHaveCount(0);
  await expect(page.getByTestId('tabella-riepilogo')).toHaveCount(0);

  // ─── Il valore attuale totale è zero, misurato — mai un trattino ──────────
  const valoreTotale = page.getByTestId('valore-totale-portafoglio');
  await expect(valoreTotale).toBeVisible();
  await expect(valoreTotale).toContainText('0,00');
  await expect(valoreTotale).not.toContainText('–');

  // ─── «Posizioni chiuse» porta l'intero portafoglio ─────────────────────────
  const tabellaChiuse = page.getByTestId('tabella-posizioni-chiuse');
  await expect(tabellaChiuse).toBeVisible();
  await expect(tabellaChiuse).toContainText('Totale posizioni chiuse (2)');
  await expect(page.getByTestId(`posizione-chiusa-${ISIN_1}`)).toBeVisible();
  await expect(page.getByTestId(`posizione-chiusa-${ISIN_2}`)).toBeVisible();

  // ─── Il quadro del risultato: tutto realizzato, nulla latente ──────────────
  const quadro = page.getByTestId('quadro-risultato');
  await expect(quadro).toBeVisible();
  await expect(page.getByTestId('pnl-realizzato')).toContainText(importo(REALIZZATO_TOTALE));

  const latente = page.getByTestId('pnl-latente');
  await expect(latente).toContainText('0,00');
  await expect(latente.locator('.cifra-pl')).toHaveClass(/zero-misurato/);

  await expect(page.getByTestId('pnl-totale')).toContainText(importo(REALIZZATO_TOTALE));
});
