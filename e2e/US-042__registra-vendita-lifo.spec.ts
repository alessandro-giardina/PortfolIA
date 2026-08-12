/**
 * US-042: registrare la vendita parziale e poi totale di una posizione con
 * attribuzione LIFO — scenario dimostrativo.
 *
 * Dimostra esattamente ciò che la spec promette: partendo da **1.000 quote**, una
 * vendita di 400 iscrive una nuova riga di scarico nel registro e porta la
 * quantità residua a 600 con il prezzo medio **ricalcolato**; la vendita delle
 * restanti 600 porta il residuo a 0 — e nessun carico risulta modificato o
 * cancellato in nessuno dei due passaggi.
 *
 * Le due asserzioni che portano il peso dello scenario non sono visive:
 *
 * - il **prezzo medio del residuo**. I due carichi hanno prezzi diversi
 *   (€ 9,8000 su 600 quote e € 11,5000 su 400), e vendere 400 quote fa scendere
 *   il medio da € 10,4800 a € 9,8000 perché LIFO consuma il carico **più
 *   recente**. Con FIFO la stessa vendita lo farebbe *salire* a € 11,5000, e la
 *   quantità residua sarebbe identica: la cifra del medio è l'unica firma del
 *   criterio, e per questo qui è pinnata da entrambi i lati — il valore nuovo e
 *   quello precedente, barrato accanto;
 * - i **carichi riletti campo per campo**. Il criterio 2 non è dimostrabile
 *   contando le righe: un'implementazione che «scalasse» la vendita dalla
 *   quantità del lotto lascerebbe due carichi, una quantità residua corretta e
 *   ogni asserzione visiva verde. L'unico modo di provarlo è confrontare
 *   l'elenco dei carichi *prima* e *dopo* ogni vendita, oggetto per oggetto.
 *
 * Prezzi **e** quantità sono diversi fra i due carichi, e nessuna delle due
 * differenze è decorativa: a prezzi uguali LIFO e FIFO coincidono, e a quantità
 * uguali la media ponderata coincide con quella aritmetica. Sono i due casi che
 * verrebbe naturale scrivere per primi, e sono i due che non provano nulla.
 *
 * Le premesse sono in **giorni indietro da adesso** e non in date fisse: una data
 * scritta a mano invecchia, e il rapporto d'ordine fra carichi e vendite — che è
 * l'intero contenuto di LIFO — smetterebbe di essere quello che il test crede di
 * aver costruito.
 *
 * Titolo seminato: TITOLO_US_042, riservato a questo file. Il seme porta
 * `fetched_at` di adesso (il default di `seminaTitolo`) ed è la guardia contro un
 * recupero reale dalla fonte, che costerebbe 8-12 secondi non deterministici.
 */
import { test, expect } from './support/fixtures.js';
import { elencaPosizioni, elencaVendite, type Posizione } from './support/api.js';
import { TITOLO_US_042 } from './support/titoli.js';

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
  await page.video()?.saveAs('docs/test-results/US-042/demo-vendita-lifo.webm');
});

const ISIN = TITOLO_US_042.isin;
const GIORNO_IN_MS = 24 * 60 * 60 * 1000;

/**
 * La data civile di `giorni` fa, in `YYYY-MM-DD` **UTC**.
 *
 * L'UTC e non i campi locali: `load_date` e `sale_date` sono date civili
 * confrontate fra loro come stringhe, e comporle dal fuso locale le farebbe
 * scivolare di un giorno a ogni offset negativo. Uno scivolamento del genere può
 * invertire l'ordine fra un carico e la vendita che lo consuma, cioè rompere la
 * premessa dello scenario invece del codice.
 */
function dataCivileIndietro(giorni: number): string {
  const d = new Date(Date.now() - giorni * GIORNO_IN_MS);
  const mese = String(d.getUTCMonth() + 1).padStart(2, '0');
  const giorno = String(d.getUTCDate()).padStart(2, '0');
  return `${d.getUTCFullYear()}-${mese}-${giorno}`;
}

/** I due carichi dello scenario: 600 quote a € 9,8000 e 400 a € 11,5000. */
const CARICHI = [
  { giorniFa: 1200, prezzo: 9.8, quantita: 600 },
  { giorniFa: 500, prezzo: 11.5, quantita: 400 },
];

/** Le due vendite, entrambe successive a entrambi i carichi. */
const VENDITE = [
  { giorniFa: 60, prezzo: 12.5, quantita: 400 },
  { giorniFa: 10, prezzo: 12.9, quantita: 600 },
];

const QUANTITA_INIZIALE = CARICHI[0].quantita + CARICHI[1].quantita; // 1.000
const RESIDUO_DOPO_PRIMA_VENDITA = QUANTITA_INIZIALE - VENDITE[0].quantita; // 600

/** Il medio ponderato iniziale: (9,80 × 600 + 11,50 × 400) / 1.000 = 10,4800. */
const MEDIO_INIZIALE = (CARICHI[0].prezzo * CARICHI[0].quantita + CARICHI[1].prezzo * CARICHI[1].quantita) / QUANTITA_INIZIALE;

/**
 * Il medio del residuo dopo la prima vendita.
 *
 * LIFO consuma per intero il carico **più recente** — 400 quote a € 11,5000 —
 * lasciando le 600 del carico più antico: il medio è quindi il prezzo di *quel*
 * lotto. Non è un'approssimazione dello scenario, è la sua tesi.
 */
const MEDIO_RESIDUO = CARICHI[0].prezzo; // 9,8000

/** Il prezzo come lo scrive la pagina: quattro decimali con la virgola. */
function prezzoScritto(valore: number): string {
  return valore.toLocaleString('it-IT', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

/** Il prezzo come lo scrive la tabella aggregata, che usa `toFixed(4)` (punto decimale). */
function prezzoFisso(valore: number): string {
  return valore.toFixed(4);
}

test('demo: registra la vendita parziale e poi totale, con il residuo ricalcolato secondo LIFO', async ({
  page,
  archivio,
}) => {
  // ─── Premessa: il titolo in cache e i due carichi ─────────────────────────
  archivio.seminaTitolo(ISIN, TITOLO_US_042.campi);
  const portafoglio = await archivio.creaPortafoglio('US042-Vendita-LIFO');

  for (const carico of CARICHI) {
    await archivio.aggiungiPosizione(
      portafoglio.id,
      ISIN,
      dataCivileIndietro(carico.giorniFa),
      carico.prezzo,
      carico.quantita,
    );
  }

  // I carichi come risultano *prima* di ogni vendita: è il termine di confronto
  // del criterio 2, e va letto adesso perché dopo non è più ricostruibile.
  const carichiIniziali: Posizione[] = await elencaPosizioni(portafoglio.id);
  expect(carichiIniziali).toHaveLength(CARICHI.length);

  await page.goto(`/portfolio/${portafoglio.id}`);
  await page.locator('nav.linguette a', { hasText: 'Carico titoli' }).click();

  // 1. Lo stato di partenza: 1.000 quote al medio ponderato di € 10,4800
  const rigaAggregata = page.getByTestId(`summary-${ISIN}`);
  await expect(rigaAggregata).toBeVisible({ timeout: 8000 });
  await expect(rigaAggregata).toContainText(String(QUANTITA_INIZIALE));
  await expect(rigaAggregata).toContainText(prezzoFisso(MEDIO_INIZIALE));

  // 2. Il modulo di scarico è nella stessa linguetta del carico (criterio 1), e
  //    dichiara la giacenza del titolo scelto
  const moduloTitolo = page.getByTestId('scarico-titolo');
  await expect(moduloTitolo).toBeVisible();
  await expect(page.getByTestId('scarico-giacenza')).toContainText(String(QUANTITA_INIZIALE));

  // 3. La fascia dei lotti mostra i due carichi con l'identità del costo
  const fascia = page.getByTestId('fascia-lifo');
  await fascia.scrollIntoViewIfNeeded();
  await expect(fascia).toBeVisible();

  // ─── Prima vendita: 400 quote ─────────────────────────────────────────────
  await page.getByTestId('scarico-data').fill(dataCivileIndietro(VENDITE[0].giorniFa));
  await page.getByTestId('scarico-prezzo').fill(String(VENDITE[0].prezzo));
  await page.getByTestId('scarico-quantita').fill(String(VENDITE[0].quantita));
  await page.getByTestId('btn-iscrive-scarico').click();

  // 4. L'iscrizione è confermata, e la conferma dice la cosa che la spec promette
  const conferma = page.getByTestId('scarico-successo');
  await expect(conferma).toBeVisible({ timeout: 8000 });
  await expect(conferma).toContainText('Nessun carico è stato modificato o cancellato');

  // 5. Il registro porta una **nuova** riga di scarico, e i due carichi sono
  //    ancora al loro posto con la quantità nominale intatta
  const vendite = await elencaVendite(portafoglio.id);
  expect(vendite).toHaveLength(1);
  const rigaScarico = page.getByTestId(`scarico-${vendite[0].id}`);
  await rigaScarico.scrollIntoViewIfNeeded();
  await expect(rigaScarico).toContainText('Scarico');
  await expect(rigaScarico).toContainText(String(VENDITE[0].quantita));

  for (const carico of carichiIniziali) {
    await expect(page.getByTestId(`posizione-${carico.id}`)).toContainText(String(carico.quantity));
  }

  // 6. Il criterio 2 asserito e non dedotto: i carichi riletti sono **identici**
  expect(await elencaPosizioni(portafoglio.id)).toEqual(carichiIniziali);

  // 7. Il residuo del lotto, lotto per lotto: LIFO ha consumato il più recente
  const [caricoAntico, caricoRecente] = [...carichiIniziali].sort((a, b) =>
    a.loadDate < b.loadDate ? -1 : 1,
  );
  await expect(page.getByTestId(`residuo-lotto-${caricoAntico.id}`)).toHaveText(
    String(CARICHI[0].quantita),
  );
  await expect(page.getByTestId(`residuo-lotto-${caricoRecente.id}`)).toHaveText('0');

  // 8. Il riquadro del residuo: 600 quote, e il medio ricalcolato **accanto** a
  //    quello precedente. È la cifra che distingue LIFO da FIFO.
  const riquadro = page.getByTestId('riquadro-residuo');
  await riquadro.scrollIntoViewIfNeeded();
  await expect(page.getByTestId('residuo-quantita')).toHaveText(String(RESIDUO_DOPO_PRIMA_VENDITA));
  await expect(page.getByTestId('residuo-prezzo-medio')).toContainText(prezzoScritto(MEDIO_RESIDUO));
  await expect(riquadro).toContainText(prezzoScritto(MEDIO_INIZIALE));
  await expect(riquadro).toContainText(`Σ carichi ${QUANTITA_INIZIALE} − Σ vendite ${VENDITE[0].quantita}`);

  // 9. E la tabella aggregata dice la stessa cosa dell'altro capo della pagina
  await expect(rigaAggregata).toContainText(String(RESIDUO_DOPO_PRIMA_VENDITA));
  await expect(rigaAggregata).toContainText(prezzoFisso(MEDIO_RESIDUO));

  // 10. Sul carico consumato i comandi restano visibili e inerti, con la ragione
  //     scritta sotto: un bottone scomparso non spiega la propria scomparsa
  await expect(page.getByTestId(`btn-rimuovi-${caricoRecente.id}`)).toBeDisabled();
  await expect(page.getByTestId(`btn-modifica-${caricoRecente.id}`)).toBeDisabled();
  await expect(page.getByTestId(`perche-impedito-${caricoRecente.id}`)).toContainText('errata');
  // Il lotto intatto resta invece modificabile: FR-009 non è stato sospeso.
  await expect(page.getByTestId(`btn-rimuovi-${caricoAntico.id}`)).toBeEnabled();

  await page.waitForTimeout(1500);

  // ─── Seconda vendita: le restanti 600 quote ───────────────────────────────
  await page.getByTestId('scarico-data').fill(dataCivileIndietro(VENDITE[1].giorniFa));
  await page.getByTestId('scarico-prezzo').fill(String(VENDITE[1].prezzo));
  await page.getByTestId('scarico-quantita').fill(String(VENDITE[1].quantita));
  await page.getByTestId('btn-iscrive-scarico').click();

  // 11. Residuo 0, e il prezzo medio **dichiarato assente** — mai «0,0000», che
  //     affermerebbe di aver comprato a zero (ADR-003)
  await expect(page.getByTestId('residuo-quantita')).toHaveText('0', { timeout: 8000 });
  const medioAzzerato = page.getByTestId('residuo-prezzo-medio');
  await expect(medioAzzerato).toHaveText('—');
  await expect(medioAzzerato).toHaveClass(/dato-mancante/);

  // 12. Quattro iscrizioni a registro, nessuna cancellata: i due carichi ci sono
  //     ancora, identici, e le due vendite sono righe nuove
  expect(await elencaPosizioni(portafoglio.id)).toEqual(carichiIniziali);
  expect(await elencaVendite(portafoglio.id)).toHaveLength(2);
  for (const carico of carichiIniziali) {
    await expect(page.getByTestId(`posizione-${carico.id}`)).toBeVisible();
    await expect(page.getByTestId(`residuo-lotto-${carico.id}`)).toHaveText('0');
  }

  // 13. Con il residuo azzerato non c'è più nulla da scaricare, e il modulo lo
  //     dichiara invece di offrire campi che porterebbero a un rifiuto annunciato
  await expect(page.getByTestId('scarico-senza-giacenze')).toBeVisible();

  // Pausa finale: il residuo azzerato resta nel fotogramma registrato, invece di
  // essere spazzato via dal teardown un istante dopo l'ultima asserzione.
  await page.getByTestId('riquadro-residuo').scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
});
