/**
 * US-044: elencare le posizioni chiuse in una sezione dedicata — scenario
 * dimostrativo.
 *
 * Il flusso che la spec promette (vedi `Dimostra` in `.archetipo/specs/US-044.yaml`):
 * dopo la vendita totale di un ISIN, la tabella dei titoli del portafoglio non lo
 * elenca più, mentre una sezione «Posizioni chiuse» ne mostra ISIN, quantità
 * complessivamente venduta, incasso e P&L realizzato; il valore attuale del
 * portafoglio non include più quel titolo.
 *
 * Lo scenario porta due titoli, per rendere visibile il contrasto che la spec
 * chiede: uno viene venduto per intero (due carichi a prezzi diversi — altrimenti
 * LIFO e FIFO attribuirebbero lo stesso costo — e una sola vendita che ne esaurisce
 * l'intero residuo), l'altro resta posseduto normalmente. La vendita è registrata
 * via API e non dal modulo di scarico: quel flusso è già il soggetto del video di
 * US-042, e ripeterlo qui distrarrebbe dal vero oggetto di questa spec — dove
 * finisce, e cosa resta visibile, di un titolo venduto per intero.
 *
 * Titoli seminati: TITOLO_US_044 e TITOLO_US_044_POSSEDUTO, riservati a questo
 * file (regola un-ISIN-per-file in e2e/support/titoli.ts).
 */
import { test, expect } from './support/fixtures.js';
import { registraVendita } from './support/api.js';
import { TITOLO_US_044, TITOLO_US_044_POSSEDUTO } from './support/titoli.js';

test.use({
  // `video: 'on'` da solo scala la registrazione a 800×450: la dimensione va
  // dichiarata esplicitamente perché il video corrisponda al viewport.
  video: { mode: 'on', size: { width: 1280, height: 720 } },
  launchOptions: { slowMo: 300 },
  viewport: { width: 1280, height: 720 },
});

// `outputDir` non è un'opzione di test.use() (è solo project/config-level),
// quindi il video va salvato a mano. `saveAs` attende la fine della
// registrazione, che avviene alla chiusura della pagina: va chiamato dopo
// `page.close()`.
test.afterEach(async ({ page }) => {
  await page.close();
  await page.video()?.saveAs('docs/test-results/US-044/demo-posizioni-chiuse.webm');
});

const ISIN_VENDUTO = TITOLO_US_044.isin;
const ISIN_POSSEDUTO = TITOLO_US_044_POSSEDUTO.isin;
const GIORNO_IN_MS = 24 * 60 * 60 * 1000;

/**
 * La data civile di `giorni` fa, in `YYYY-MM-DD` **UTC**.
 *
 * L'UTC e non i campi locali: `load_date` e `sale_date` sono date civili
 * confrontate fra loro come stringhe, e comporle dal fuso locale le farebbe
 * scivolare di un giorno a ogni offset negativo — proprio la premessa che lo
 * scenario deve costruire, non il codice sotto esame.
 */
function dataCivileIndietro(giorni: number): string {
  const d = new Date(Date.now() - giorni * GIORNO_IN_MS);
  const mese = String(d.getUTCMonth() + 1).padStart(2, '0');
  const giorno = String(d.getUTCDate()).padStart(2, '0');
  return `${d.getUTCFullYear()}-${mese}-${giorno}`;
}

/** Cifra con due decimali all'italiana, es. "12.500,00" — come la scrive il registro. */
function importo(valore: number): string {
  return valore.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** I due carichi del titolo che verrà interamente venduto. */
const CARICHI_VENDUTO = [
  { giorniFa: 800, prezzo: 9.8, quantita: 600 },
  { giorniFa: 400, prezzo: 11.5, quantita: 400 },
];
/** Lo scarico: esaurisce l'intero residuo in un solo colpo. */
const VENDITA_TOTALE = { giorniFa: 30, prezzo: 12.5, quantita: 1000 };

const INCASSO = VENDITA_TOTALE.prezzo * VENDITA_TOTALE.quantita; // 12.500,00
const COSTO_ATTRIBUITO = CARICHI_VENDUTO.reduce((s, c) => s + c.prezzo * c.quantita, 0); // 10.480,00
const REALIZZATO = INCASSO - COSTO_ATTRIBUITO; // + 2.020,00

/** Il titolo che resta posseduto: un solo carico, mai toccato da una vendita. */
const CARICO_POSSEDUTO = { giorniFa: 200, prezzo: 50.0, quantita: 200 };
const PREZZO_CORRENTE_POSSEDUTO = TITOLO_US_044_POSSEDUTO.campi.price as number;
const VALORE_ATTUALE_POSSEDUTO = PREZZO_CORRENTE_POSSEDUTO * CARICO_POSSEDUTO.quantita; // 13.000,00
const COSTO_POSSEDUTO = CARICO_POSSEDUTO.prezzo * CARICO_POSSEDUTO.quantita; // 10.000,00
const LATENTE_POSSEDUTO = VALORE_ATTUALE_POSSEDUTO - COSTO_POSSEDUTO; // + 3.000,00
const TOTALE_QUADRO = REALIZZATO + LATENTE_POSSEDUTO; // + 5.020,00

test('demo: un titolo venduto per intero esce dalla tabella dei posseduti e resta consultabile in Posizioni chiuse', async ({
  page,
  archivio,
}) => {
  // ─── Premessa: i due titoli in cache, i carichi, la vendita totale ─────────
  const ADESSO = Math.floor(Date.now() / 1000);
  archivio.seminaTitolo(ISIN_VENDUTO, { ...TITOLO_US_044.campi, fetched_at: ADESSO });
  archivio.seminaTitolo(ISIN_POSSEDUTO, { ...TITOLO_US_044_POSSEDUTO.campi, fetched_at: ADESSO });

  const portafoglio = await archivio.creaPortafoglio('US044-Posizioni-Chiuse');

  for (const carico of CARICHI_VENDUTO) {
    await archivio.aggiungiPosizione(
      portafoglio.id,
      ISIN_VENDUTO,
      dataCivileIndietro(carico.giorniFa),
      carico.prezzo,
      carico.quantita,
    );
  }
  await registraVendita(
    portafoglio.id,
    ISIN_VENDUTO,
    dataCivileIndietro(VENDITA_TOTALE.giorniFa),
    VENDITA_TOTALE.prezzo,
    VENDITA_TOTALE.quantita,
  );

  await archivio.aggiungiPosizione(
    portafoglio.id,
    ISIN_POSSEDUTO,
    dataCivileIndietro(CARICO_POSSEDUTO.giorniFa),
    CARICO_POSSEDUTO.prezzo,
    CARICO_POSSEDUTO.quantita,
  );

  // ─── 1. Il Riepilogo si apre sul titolo ancora posseduto ───────────────────
  await page.goto(`/portfolio/${portafoglio.id}`);

  const rigaPosseduto = page.getByTestId(`riepilogo-${ISIN_POSSEDUTO}`);
  await expect(rigaPosseduto).toBeVisible({ timeout: 8000 });
  await expect(rigaPosseduto).toContainText('200');
  await expect(rigaPosseduto).toContainText(importo(VALORE_ATTUALE_POSSEDUTO));

  // ─── 2. Il titolo venduto per intero non è più in tabella ──────────────────
  await expect(page.getByTestId(`riepilogo-${ISIN_VENDUTO}`)).toHaveCount(0);

  await page.waitForTimeout(600);

  // ─── 3. Il valore attuale totale è quello del solo titolo posseduto ────────
  const valoreTotale = page.getByTestId('valore-totale-portafoglio');
  await expect(valoreTotale).toBeVisible();
  await expect(valoreTotale).toContainText(importo(VALORE_ATTUALE_POSSEDUTO));

  await page.waitForTimeout(600);

  // ─── 4. Il quadro del risultato porta il realizzato del venduto e il
  //         latente del posseduto, entrambi nel totale ─────────────────────
  const quadro = page.getByTestId('quadro-risultato');
  await expect(quadro).toBeVisible();
  await quadro.scrollIntoViewIfNeeded();

  await expect(page.getByTestId('pnl-realizzato')).toContainText(importo(REALIZZATO));
  await expect(page.getByTestId('pnl-latente')).toContainText(importo(LATENTE_POSSEDUTO));
  await expect(page.getByTestId('pnl-totale')).toContainText(importo(TOTALE_QUADRO));

  await page.waitForTimeout(900);

  // ─── 5. «Posizioni chiuse» porta l'ISIN venduto con le sue cifre ───────────
  const tabellaChiuse = page.getByTestId('tabella-posizioni-chiuse');
  await tabellaChiuse.scrollIntoViewIfNeeded();
  await expect(tabellaChiuse).toBeVisible();

  const rigaChiusa = page.getByTestId(`posizione-chiusa-${ISIN_VENDUTO}`);
  await expect(rigaChiusa).toBeVisible();
  await expect(rigaChiusa).toContainText(ISIN_VENDUTO);
  // La quantità è un intero — "1.000", non "1.000,00" — mentre incasso e
  // realizzato sono importi a due decimali: la stessa distinzione che la
  // tabella disegna con classi CSS diverse (`.cifra` contro `.cifra euro`).
  await expect(rigaChiusa).toContainText(VENDITA_TOTALE.quantita.toLocaleString('it-IT'));
  await expect(rigaChiusa).toContainText(importo(INCASSO));
  await expect(rigaChiusa).toContainText(importo(REALIZZATO));

  // Pausa finale: la sezione «Posizioni chiuse» resta nel fotogramma
  // registrato, invece di essere spazzata via dal teardown un istante dopo.
  await page.waitForTimeout(1500);
});
