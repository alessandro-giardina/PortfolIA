/**
 * US-019: grafico del valore del portafoglio nel tempo — varianti.
 *
 * File sorello del demo (`US-019__grafico-portafoglio.spec.ts`, con video),
 * senza registrazione: stessa coppia `US-026__*` per la ragione già
 * documentata in `CLAUDE.md` — `launchOptions.slowMo` non è scopabile a un
 * solo `describe`, quindi gli scenari senza video vivono in un file proprio.
 *
 * Il demo dimostra la copertura **piena** con riporto dichiarato
 * (`docs/mockups/US-019/index.html`). Qui i quattro scenari mettono alla
 * prova ciò che quel caso non tocca (`docs/mockups/US-019/copertura-parziale.html`
 * e le varianti che quella pagina non mostra):
 *
 *  - un titolo detenuto e **mai rilevato** tiene l'intera finestra a
 *    copertura parziale, con le somme parziali dichiarate come tali;
 *  - un conto con carichi ma **nessuna rilevazione** dichiara «dato non
 *    disponibile» invece di disegnare una cornice vuota o una retta a zero;
 *  - la costruzione del grafico genera **un solo giro di richieste** al
 *    server (criterio 7): una a `…/series`, nessuna a
 *    `…/positions/:isin/detail` né a `/api/securities/*`;
 *  - una **vendita totale** a metà storia fa uscire il titolo dal perimetro
 *    (il punto vale zero, misurato) senza introdurre un titolo non
 *    valorizzato — i due zeri della nota di modulo di
 *    `serieValorePortafoglio.ts` non vanno confusi.
 *
 * Titolo seminato: `TITOLO_US_019_VARIANTI`, riservato a questo file — una
 * sola chiave basta perché gli scenari girano in serie
 * (`fullyParallel: false`) e ciascuno si costruisce la propria premessa con
 * `seminaOsservazioni`, che *sostituisce* lo storico. Il primo scenario usa
 * anche `ISIN_MAI_RILEVATO_US_019`, che questo file *rimuove* dalla cache
 * (mai seminato): rimuovere e ripristinare è la stessa pila di undo del
 * seeding, quindi vale comunque la riserva per file.
 *
 * Le premesse sono in giorni indietro da adesso e non in date fisse, per la
 * stessa ragione registrata in `US-045__grafico-riflette-vendite-varianti.spec.ts`:
 * una data scritta a mano invecchia, e il rapporto d'ordine fra carichi,
 * vendita e rilevazioni — l'intero contenuto dello scenario — smetterebbe di
 * essere quello che il test crede di aver costruito.
 */
import { test, expect } from './support/fixtures.js';
import { registraVendita } from './support/api.js';
import { ISIN_MAI_RILEVATO_US_019, TITOLO_US_019_VARIANTI } from './support/titoli.js';

const ISIN = TITOLO_US_019_VARIANTI.isin;
const ISIN_MAI_RILEVATO = ISIN_MAI_RILEVATO_US_019.isin;
const GIORNO_IN_SECONDI = 24 * 60 * 60;

/**
 * La data civile di `giorni` fa, in `YYYY-MM-DD` **UTC** — stessa regola e
 * stessa ragione del file demo di US-045: `Position.loadDate` e
 * `Sale.saleDate` sono date civili ancorate a mezzanotte UTC, e comporla dai
 * campi locali la farebbe scivolare di un giorno a ogni offset negativo.
 */
function dataCivileIndietro(giorni: number): string {
  const d = new Date(Date.now() - giorni * GIORNO_IN_SECONDI * 1000);
  const mese = String(d.getUTCMonth() + 1).padStart(2, '0');
  const giorno = String(d.getUTCDate()).padStart(2, '0');
  return `${d.getUTCFullYear()}-${mese}-${giorno}`;
}

// ---------------------------------------------------------------------------
// Scenario 1 — un titolo mai rilevato tiene l'intera finestra a copertura
// parziale, con la somma parziale dichiarata come tale (criterio 6)
// ---------------------------------------------------------------------------

test('un titolo mai rilevato tiene la finestra a copertura parziale, con la somma parziale barrata', async ({
  page,
  archivio,
}) => {
  const { id: portfolioId } = await archivio.creaPortafoglio('Copertura Parziale');

  // ─── Premesse possedute da questo scenario ────────────────────────────────
  // Il titolo "mai rilevato" non è mai stato in cache: garantisce il cache
  // miss anche se un run precedente lo avesse lasciato seminato altrove.
  archivio.rimuoviTitolo(ISIN_MAI_RILEVATO);
  archivio.seminaTitolo(ISIN, TITOLO_US_019_VARIANTI.campi);

  // Carico del titolo mai rilevato: 90 giorni fa, 40 quote. Nessuna
  // rilevazione lo raggiungerà mai in questo scenario.
  await archivio.aggiungiPosizione(portfolioId, ISIN_MAI_RILEVATO, dataCivileIndietro(90), 10, 40);

  // Carico del secondo titolo: 80 giorni fa, 25 quote.
  await archivio.aggiungiPosizione(portfolioId, ISIN, dataCivileIndietro(80), 60, 25);

  // Una sola rilevazione, 10 giorni fa, a € 84,00: valorizza il secondo
  // titolo senza mai valorizzare il primo. La copertura piena non comincia
  // quindi a nessuna data della finestra.
  const adesso = archivio.leggiTitolo(ISIN)!.fetched_at;
  archivio.seminaOsservazioni(ISIN, [
    { price: 84, observed_at: adesso - 10 * GIORNO_IN_SECONDI, data_source: 'borsaitaliana' },
  ]);

  await page.goto(`/portfolio/${portfolioId}`);

  const grafico = page.getByTestId('grafico-portafoglio');
  await expect(grafico).toBeVisible({ timeout: 8000 });

  // Il perimetro: due titoli detenuti, tre date d'evento, mai a copertura
  // piena — il ramo "parziale" e non il ramo "assente" (dato non
  // disponibile), perché almeno un contributo resta sempre valorizzabile.
  await expect(grafico).toHaveAttribute('data-titoli', '2');
  await expect(grafico).toHaveAttribute('data-punti', '3');
  await expect(grafico).toHaveAttribute('data-copertura', 'parziale');
  await expect(page.getByTestId('grafico-portafoglio-parziale')).toBeVisible();

  // Il conteggio dichiarato: un titolo su due senza alcun prezzo noto.
  await expect(page.locator('.conteggio-titoli')).toContainText('senza alcun prezzo noto');
  await expect(page.locator('.conteggio-titoli')).toContainText('1');

  // Il verdetto: la copertura piena non comincia mai in questa finestra.
  const verdetto = grafico.locator('.verdetto');
  await expect(verdetto).toHaveClass(/assente/);
  await expect(verdetto).toHaveText('copertura parziale su tutta la finestra');

  // Nessun punto è mai a copertura piena: i tre punti d'evento sono tutti
  // "parziale", mai "piena".
  for (let indice = 0; indice < 3; indice += 1) {
    await expect(page.getByTestId(`punto-portafoglio-${indice}`)).toHaveAttribute(
      'data-copertura',
      'parziale',
    );
  }

  // Curva assente: nessun segno pieno (rombo/cerchio/quadrato colmi) è
  // disegnato, e nessun segmento a copertura piena unisce due punti.
  await expect(page.locator('.tracciato .punto-carico, .tracciato .punto-rilevazione, .tracciato .punto-vendita')).toHaveCount(0);
  await expect(page.locator('.tracciato .segmento-vuoto line')).toHaveCount(0);

  // La somma parziale del punto più recente non è "non affermabile": è la
  // somma dei soli titoli valorizzati (25 quote × € 84,00 = € 2.100,00),
  // dichiarata come parziale e barrata (criterio 6), non come valore vero.
  const ultimoPunto = page.getByTestId('punto-portafoglio-2');
  await expect(ultimoPunto).toHaveAttribute('data-valore', '2100');

  const cifraPunto = page.locator('.cifra-punto');
  await expect(cifraPunto).not.toHaveText('non affermabile');
  await expect(cifraPunto).toHaveCSS('text-decoration-line', 'line-through');

  // La sezione dedicata dichiara la ragione a parole: il titolo mai rilevato
  // non ha mai avuto una rilevazione, la copertura piena non comincia a
  // nessuna data, le somme restano scritte ma barrate.
  const coperturaParziale = page.getByTestId('copertura-parziale');
  await expect(coperturaParziale).toContainText('non ha mai avuto una rilevazione');
  await expect(coperturaParziale).toContainText('non viene mai disegnata');
  await expect(coperturaParziale).toContainText('barrate');
});

// ---------------------------------------------------------------------------
// Scenario 2 — carichi senza alcuna rilevazione: «dato non disponibile»,
// mai una retta a zero (ADR-003)
// ---------------------------------------------------------------------------

test('carichi senza alcuna rilevazione dichiarano "dato non disponibile", senza disegnare alcuna retta a zero', async ({
  page,
  archivio,
}) => {
  const { id: portfolioId } = await archivio.creaPortafoglio('Nessuna Rilevazione');

  archivio.seminaTitolo(ISIN, TITOLO_US_019_VARIANTI.campi);
  await archivio.aggiungiPosizione(portfolioId, ISIN, dataCivileIndietro(30), 50, 15);

  // Premessa asserita, non ereditata: nessuna osservazione per questo ISIN,
  // qualunque cosa un run precedente (o il backfill d'avvio) possa aver
  // lasciato in archivio.
  archivio.rimuoviOsservazioni(ISIN);

  await page.goto(`/portfolio/${portfolioId}`);

  const grafico = page.getByTestId('grafico-portafoglio');
  await expect(grafico).toBeVisible({ timeout: 8000 });

  await expect(grafico).toHaveAttribute('data-titoli', '1');
  await expect(grafico).toHaveAttribute('data-copertura', 'assente');
  await expect(page.getByTestId('valore-portafoglio-non-disponibile')).toBeVisible();
  await expect(page.locator('.timbro-grande')).toHaveText('Dato non disponibile');
  await expect(page.locator('.riga-intervallo')).toContainText('nessuna rilevazione');

  // Verifica negativa: nessun elemento SVG del grafico — quindi nessuna
  // curva e in particolare nessuna retta piatta appoggiata allo zero. Il
  // ramo "dato non disponibile" non disegna alcuna cornice, vuota o no.
  await expect(page.locator('[data-testid="grafico-portafoglio"] svg')).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// Scenario 3 — un solo giro di richieste: una a `…/series`, nessuna a
// `…/positions/:isin/detail` né a `/api/securities/*` (criterio 7)
// ---------------------------------------------------------------------------

test('la costruzione del grafico genera un solo giro di richieste: una a /series, nessuna a /detail o /api/securities', async ({
  page,
  archivio,
}) => {
  const { id: portfolioId } = await archivio.creaPortafoglio('Giro Unico Richieste');

  archivio.seminaTitolo(ISIN, TITOLO_US_019_VARIANTI.campi);
  await archivio.aggiungiPosizione(portfolioId, ISIN, dataCivileIndietro(20), 65, 10);

  const adesso = archivio.leggiTitolo(ISIN)!.fetched_at;
  archivio.seminaOsservazioni(ISIN, [
    { price: TITOLO_US_019_VARIANTI.campi.price!, observed_at: adesso - 5 * GIORNO_IN_SECONDI, data_source: 'borsaitaliana' },
  ]);

  const richieste: string[] = [];
  page.on('request', (richiesta) => richieste.push(richiesta.url()));

  await page.goto(`/portfolio/${portfolioId}`);
  await expect(page.getByTestId('grafico-portafoglio')).toBeVisible({ timeout: 8000 });

  const richiesteSeries = richieste.filter((url) => /\/api\/portfolios\/\d+\/series(?:\?|$)/.test(url));
  const richiesteDettaglio = richieste.filter((url) => /\/positions\/[^/]+\/detail(?:\?|$)/.test(url));
  const richiesteSecurities = richieste.filter((url) => /\/api\/securities\//.test(url));

  expect(richiesteSeries).toHaveLength(1);
  expect(richiesteDettaglio).toHaveLength(0);
  expect(richiesteSecurities).toHaveLength(0);
});

// ---------------------------------------------------------------------------
// Scenario 4 — vendita totale a metà storia: il titolo esce dal perimetro
// (valore zero, misurato) senza rendere parziale il punto
// ---------------------------------------------------------------------------

test('una vendita totale a metà storia fa uscire il titolo dal perimetro, senza rendere parziale il punto', async ({
  page,
  archivio,
}) => {
  const { id: portfolioId } = await archivio.creaPortafoglio('Vendita Totale Portafoglio');

  archivio.seminaTitolo(ISIN, TITOLO_US_019_VARIANTI.campi);

  // Carico: 300 giorni fa, 200 quote.
  await archivio.aggiungiPosizione(portfolioId, ISIN, dataCivileIndietro(300), 40, 200);

  // Vendita totale: le stesse 200 quote, 150 giorni fa.
  await registraVendita(portfolioId, ISIN, dataCivileIndietro(150), 52, 200);

  // Due rilevazioni: una prima della vendita (il titolo è ancora detenuto),
  // una dopo (il titolo non è più nel perimetro, e non deve contare come
  // "non valorizzato").
  const adesso = archivio.leggiTitolo(ISIN)!.fetched_at;
  archivio.seminaOsservazioni(ISIN, [
    { price: 45, observed_at: adesso - 250 * GIORNO_IN_SECONDI, data_source: 'borsaitaliana' },
    { price: TITOLO_US_019_VARIANTI.campi.price!, observed_at: adesso, data_source: 'borsaitaliana' },
  ]);

  await page.goto(`/portfolio/${portfolioId}`);

  const grafico = page.getByTestId('grafico-portafoglio');
  await expect(grafico).toBeVisible({ timeout: 8000 });

  // Quattro date d'evento: carico, rilevazione ante-vendita, vendita,
  // rilevazione post-vendita.
  await expect(grafico).toHaveAttribute('data-titoli', '1');
  await expect(grafico).toHaveAttribute('data-punti', '4');

  const puntoCarico = page.getByTestId('punto-portafoglio-0');
  const puntoAnteVendita = page.getByTestId('punto-portafoglio-1');
  const puntoVendita = page.getByTestId('punto-portafoglio-2');
  const puntoPostVendita = page.getByTestId('punto-portafoglio-3');

  // Prima della prima rilevazione, il titolo è detenuto ma non valorizzato:
  // quel punto è "parziale" — un fatto ortogonale a ciò che questo scenario
  // mette alla prova, e non lo riguarda.
  await expect(puntoCarico).toHaveAttribute('data-copertura', 'parziale');

  await expect(puntoAnteVendita).toHaveAttribute('data-copertura', 'piena');
  await expect(puntoAnteVendita).toHaveAttribute('data-valore', String(45 * 200));

  // Il criterio che regge lo scenario: il punto della vendita e quello
  // successivo sono a copertura "piena" (mai "parziale") e a valore zero
  // *misurato* — non "non affermabile" e non un titolo "senza prezzo noto".
  await expect(puntoVendita).toHaveAttribute('data-origine', 'vendita');
  await expect(puntoVendita).toHaveAttribute('data-copertura', 'piena');
  await expect(puntoVendita).toHaveAttribute('data-valore', '0');

  await expect(puntoPostVendita).toHaveAttribute('data-origine', 'rilevazione');
  await expect(puntoPostVendita).toHaveAttribute('data-copertura', 'piena');
  await expect(puntoPostVendita).toHaveAttribute('data-valore', '0');

  // Il titolo ha già avuto rilevazioni reali (quella ante-vendita): non è
  // mai "senza alcun prezzo noto", nonostante sia ora completamente venduto.
  // La vendita riduce il perimetro, non introduce un titolo non valorizzato.
  await expect(page.locator('.conteggio-titoli')).not.toContainText('senza alcun prezzo noto');
});
