/**
 * US-054: quadro strumenti — iscrizione carichi e scarichi.
 *
 * Copre la scheda «Carico titoli» nel design «quadro» (EP-009), e non nel libro
 * mastro:
 *
 *  1. la **parità delle validazioni** fra le due rese sullo stesso input non
 *     valido, con nessuna richiesta verso il server — è il criterio 5, e l'unico
 *     modo di provarlo senza fidarsi del fatto che l'hook sia uno solo;
 *  2. la **precompilazione da «Aggiungi a portafoglio»** (US-025) nel quadro, e
 *     la conservazione di ciò che è digitato attraverso la commutazione di
 *     design — che è il motivo per cui gli hook restano nella pagina;
 *  3. lo **scarico parziale**, con le tre carte del residuo e la riga marcata
 *     nel registro;
 *  4. la **fascia dei lotti** nel quadro, con l'identità
 *     `costo attribuito + costo residuo = costo dei carichi`;
 *  5. il **lotto fuori data**, dichiarato «non attribuibile» invece di sparire;
 *  6. il **portafoglio senza giacenze**, che dichiara di non avere nulla da
 *     scaricare invece di mostrare campi inerti;
 *  7. **rettifica e rimozione** di un carico non consumato, e i comandi impediti
 *     col «perché» su un carico consumato da una vendita;
 *  8. le **due tabelle vuote** su un portafoglio nuovo;
 *  9. la sezione **«Posizioni chiuse»** resa nel quadro — verifica del criterio
 *     4, che US-051 ha già consegnato: nessuna seconda tabella per gli stessi
 *     dati.
 *
 * Lo scenario dimostrativo vive da solo in
 * `US-054__quadro-carico-scarico-demo.spec.ts`: `launchOptions` (slowMo) non è
 * scopabile in un `describe`, solo a livello di file.
 *
 * Le date sono **giorni indietro da adesso** e non date fisse: il rapporto
 * d'ordine fra carichi e vendite è l'intero contenuto di LIFO, e una data
 * scritta a mano invecchia.
 *
 * Titolo seminato: `TITOLO_US_054`, riservato a questo file. Il seme porta
 * `fetched_at` di adesso ed è la guardia contro un recupero reale dalla fonte,
 * che costerebbe 8-12 secondi non deterministici.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/fixtures.js';
import { elencaPosizioni, elencaVendite } from './support/api.js';
import { TITOLO_US_054 } from './support/titoli.js';

const ISIN = TITOLO_US_054.isin;
const GIORNO_IN_MS = 24 * 60 * 60 * 1000;

/**
 * La data civile di `giorni` fa, in `YYYY-MM-DD` **UTC**.
 *
 * L'UTC e non i campi locali: `load_date` e `sale_date` sono date civili
 * confrontate fra loro come stringhe, e comporle dal fuso locale le farebbe
 * scivolare di un giorno a ogni offset negativo — cioè invertire l'ordine fra un
 * carico e la vendita che lo consuma.
 */
function dataCivileIndietro(giorni: number): string {
  const d = new Date(Date.now() - giorni * GIORNO_IN_MS);
  const mese = String(d.getUTCMonth() + 1).padStart(2, '0');
  const giorno = String(d.getUTCDate()).padStart(2, '0');
  return `${d.getUTCFullYear()}-${mese}-${giorno}`;
}

/**
 * Apre la scheda «Carico titoli» di un portafoglio con il design «quadro» già
 * attivo.
 *
 * La preferenza è scritta in `localStorage` **prima** della navigazione: lo
 * script di bootstrap di `index.html` la applica a `data-design` prima che React
 * monti, così `Guscio` rende il quadro fin dal primo render. Commutare a pagina
 * caricata cambierebbe l'attributo ma non il guscio già montato — l'incoerenza
 * documentata in US-051.
 */
async function apriCaricoInQuadro(page: Page, id: number): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('portfolia-design', 'quadro');
  });
  await page.goto(`/portfolio/${id}`);
  await expect(page.getByTestId('barra-laterale')).toBeVisible({ timeout: 8000 });
  await page.locator('.voce-nav', { hasText: 'Carico titoli' }).click();
  await expect(page.getByTestId('input-isin')).toBeVisible({ timeout: 8000 });
}

/** Apre la scheda «Carico titoli» nel design mastro, quello predefinito. */
async function apriCaricoInMastro(page: Page, id: number): Promise<void> {
  await page.goto(`/portfolio/${id}`);
  await page.locator('nav.linguette a', { hasText: 'Carico titoli' }).click();
  await expect(page.getByTestId('input-isin')).toBeVisible({ timeout: 8000 });
}

/** Compila il modulo di carico con un input volutamente non valido su tre campi. */
async function compilaCaricoNonValido(page: Page): Promise<void> {
  await page.getByTestId('input-isin').fill('IE00BJRH');
  await page.getByTestId('input-data').fill(dataCivileIndietro(30));
  await page.getByTestId('input-prezzo').fill('-3');
  await page.getByTestId('input-quantita').fill('1,2345678');
  await page.getByTestId('btn-iscrive').click();
}

// ─── Scenario 1: parità delle validazioni fra i due design ───────────────────

test('parità delle validazioni: i due design rifiutano lo stesso input con gli stessi messaggi', async ({
  page,
  archivio,
}) => {
  const portafoglio = await archivio.creaPortafoglio('US054-Parita');

  // Nessuna richiesta di iscrizione deve partire: la validazione di forma è
  // interamente lato client, ed è ciò che il criterio 5 promette.
  let iscrizioniTentate = 0;
  await page.route('**/api/portfolios/*/positions', (route) => {
    if (route.request().method() === 'POST') iscrizioniTentate += 1;
    void route.continue();
  });

  // ── Mastro ──
  await apriCaricoInMastro(page, portafoglio.id);
  await compilaCaricoNonValido(page);

  const mastro = {
    isin: await page.getByTestId('err-isin').innerText(),
    prezzo: await page.getByTestId('err-prezzo').innerText(),
    quantita: await page.getByTestId('err-quantita').innerText(),
  };
  // Il sommario del mastro elenca le voci; il conteggio è una cosa che il
  // quadro aggiunge, non un dato che le due rese devono ripetere uguale.
  const sommarioMastro = page.getByTestId('banner-errore');
  await expect(sommarioMastro).toContainText(mastro.isin);
  await expect(sommarioMastro).toContainText(mastro.prezzo);
  await expect(sommarioMastro).toContainText(mastro.quantita);

  // ── Quadro ──
  await apriCaricoInQuadro(page, portafoglio.id);
  await compilaCaricoNonValido(page);

  const quadro = {
    isin: await page.getByTestId('err-isin').innerText(),
    prezzo: await page.getByTestId('err-prezzo').innerText(),
    quantita: await page.getByTestId('err-quantita').innerText(),
  };

  expect(quadro).toEqual(mastro);

  // Il sommario dice **quante** voci sono da correggere; quale lo dicono gli
  // errori inline, accanto al campo che li ha prodotti.
  const sommario = page.getByTestId('banner-errore');
  await expect(sommario).toContainText('3 voci non valide');
  await expect(sommario).toContainText(mastro.isin);
  await expect(sommario).toContainText(mastro.prezzo);
  await expect(sommario).toContainText(mastro.quantita);

  // Nessuna delle due rese ha contattato il server.
  expect(iscrizioniTentate).toBe(0);
  expect(await elencaPosizioni(portafoglio.id)).toHaveLength(0);
});

// ─── Scenario 2: precompilazione da ricerca e commutazione a modulo compilato ─

test('precompilazione da «Aggiungi a portafoglio» nel quadro, conservata attraverso la commutazione', async ({
  page,
  archivio,
}) => {
  archivio.seminaTitolo(ISIN, TITOLO_US_054.campi);
  const portafoglio = await archivio.creaPortafoglio('US054-Precompila');

  await page.addInitScript(() => {
    localStorage.setItem('portfolia-design', 'quadro');
  });
  await page.goto('/ricerca');
  await page.getByLabel('Codice ISIN del titolo').fill(ISIN);
  await page.getByRole('button', { name: 'Recupera anagrafica' }).click();

  await expect(page.getByTestId('btn-aggiungi-portafoglio')).toBeVisible({ timeout: 30000 });
  await page.getByTestId('btn-aggiungi-portafoglio').click();
  await page.getByTestId(`portafoglio-option-${portafoglio.id}`).click();
  await page.getByTestId('btn-conferma-dialog').click();

  await page.waitForURL(`**/portfolio/${portafoglio.id}`);

  // La scheda carico si apre da sola, nella veste del quadro, con ISIN e prezzo
  // già scritti e la denominazione dichiarata proveniente dalla ricerca.
  await expect(page.locator('html')).toHaveAttribute('data-design', 'quadro');
  await expect(page.getByTestId('input-isin')).toHaveValue(ISIN);
  await expect(page.getByTestId('input-prezzo')).toHaveValue(String(TITOLO_US_054.campi.price));

  const denominazione = page.getByTestId('input-nome-titolo');
  await expect(denominazione).toHaveValue(TITOLO_US_054.campi.name!);
  await expect(denominazione).toBeDisabled();

  // L'utente completa il modulo a mano…
  const dataCarico = dataCivileIndietro(400);
  await page.getByTestId('input-data').fill(dataCarico);
  await page.getByTestId('input-quantita').fill('12,5');

  // …e commuta design a modulo compilato: gli hook vivono nella pagina, non
  // nelle viste, quindi il ternario scambia la resa e non lo stato. Se
  // `useFormCarico` fosse chiamato dentro la vista, il rimontaggio azzererebbe
  // tutto — e il `prefill`, consumato una volta sola al mount, sarebbe perso.
  await page.getByRole('button', { name: /libro mastro/i }).click();
  await expect(page.locator('html')).toHaveAttribute('data-design', 'mastro');

  await expect(page.getByTestId('input-isin')).toHaveValue(ISIN);
  await expect(page.getByTestId('input-data')).toHaveValue(dataCarico);
  await expect(page.getByTestId('input-prezzo')).toHaveValue(String(TITOLO_US_054.campi.price));
  await expect(page.getByTestId('input-quantita')).toHaveValue('12,5');
  await expect(page.getByTestId('input-nome-titolo')).toHaveValue(TITOLO_US_054.campi.name!);
});

// ─── Scenario 3: scarico parziale, residuo e riga marcata nel registro ───────

test('scarico parziale nel quadro: tre carte del residuo e riga di scarico nel registro', async ({
  page,
  archivio,
}) => {
  archivio.seminaTitolo(ISIN, TITOLO_US_054.campi);
  const portafoglio = await archivio.creaPortafoglio('US054-Scarico');

  // Due carichi a prezzi diversi: a prezzi uguali LIFO e FIFO coinciderebbero e
  // il prezzo medio del residuo non proverebbe nulla.
  await archivio.aggiungiPosizione(portafoglio.id, ISIN, dataCivileIndietro(900), 9.8, 60);
  await archivio.aggiungiPosizione(portafoglio.id, ISIN, dataCivileIndietro(400), 11.5, 40);

  await apriCaricoInQuadro(page, portafoglio.id);

  // La giacenza dichiarata accanto alla select: 100 quote.
  await expect(page.getByTestId('scarico-giacenza')).toContainText('100');

  await page.getByTestId('scarico-data').fill(dataCivileIndietro(30));
  await page.getByTestId('scarico-prezzo').fill('12.5');
  await page.getByTestId('scarico-quantita').fill('40');
  await page.getByTestId('btn-iscrive-scarico').click();

  // 1. L'esito, nel linguaggio del quadro
  const conferma = page.getByTestId('scarico-successo');
  await expect(conferma).toBeVisible({ timeout: 8000 });
  await expect(conferma).toContainText('Nessun carico è stato modificato o cancellato');

  // 2. Le tre carte del residuo. LIFO consuma il carico **più recente** (40
  //    quote a € 11,5000) e lascia le 60 del più antico: il medio scende a
  //    € 9,8000, e la carta porta accanto il valore precedente barrato.
  const residuo = page.getByTestId('riquadro-residuo');
  await residuo.scrollIntoViewIfNeeded();
  await expect(page.getByTestId('residuo-quantita')).toHaveText('60');
  await expect(page.getByTestId('residuo-prezzo-medio')).toContainText('9,8000');
  await expect(residuo.locator('.carta-residuo s')).toContainText('10,4800');
  await expect(page.getByTestId('residuo-controvalore')).toContainText('588,00');

  // 3. La riga di scarico è **nuova** nel registro: nessun carico è stato
  //    riscritto, e le due posizioni conservano la quantità nominale.
  const vendite = await elencaVendite(portafoglio.id);
  expect(vendite).toHaveLength(1);

  const rigaScarico = page.getByTestId(`scarico-${vendite[0].id}`);
  await rigaScarico.scrollIntoViewIfNeeded();
  await expect(rigaScarico).toHaveClass(/riga-nuova/);
  await expect(rigaScarico.locator('.marca-iscrizione.scarico')).toHaveText('Scarico');
  await expect(rigaScarico).toContainText('40');

  const carichi = await elencaPosizioni(portafoglio.id);
  expect(carichi).toHaveLength(2);
  const [antico, recente] = [...carichi].sort((a, b) => (a.loadDate < b.loadDate ? -1 : 1));
  await expect(page.getByTestId(`residuo-lotto-${antico.id}`)).toHaveText('60');
  await expect(page.getByTestId(`residuo-lotto-${recente.id}`)).toHaveText('0');
});

// ─── Scenario 4: la fascia dei lotti nel quadro ──────────────────────────────

test('la fascia dei lotti nel quadro: ordine di consumo e identità del costo', async ({
  page,
  archivio,
}) => {
  archivio.seminaTitolo(ISIN, TITOLO_US_054.campi);
  const portafoglio = await archivio.creaPortafoglio('US054-Fascia');

  await archivio.aggiungiPosizione(portafoglio.id, ISIN, dataCivileIndietro(900), 10, 12);
  await archivio.aggiungiPosizione(portafoglio.id, ISIN, dataCivileIndietro(600), 20, 20);
  await archivio.aggiungiPosizione(portafoglio.id, ISIN, dataCivileIndietro(300), 30, 18);

  await apriCaricoInQuadro(page, portafoglio.id);

  const fascia = page.getByTestId('fascia-lifo');
  await fascia.scrollIntoViewIfNeeded();
  await expect(fascia).toBeVisible();

  // I lotti stanno dal più recente al più antico — l'ordine esatto in cui il
  // criterio li consuma — e la numerazione è quella di **registro**.
  const carichi = await elencaPosizioni(portafoglio.id);
  const perData = [...carichi].sort((a, b) => (a.loadDate < b.loadDate ? -1 : 1));
  const idNellaFascia = await fascia
    .locator('.lotto')
    .evaluateAll((lotti) => lotti.map((l) => l.getAttribute('data-testid')));
  expect(idNellaFascia).toEqual([...perData].reverse().map((c) => `lotto-${c.id}`));

  // Nessuna vendita ancora: ogni lotto è intatto e l'identità del costo si
  // riduce a «tutto residuo». 10×12 + 20×20 + 30×18 = 1.060,00.
  const identita = page.getByTestId('identita-costo');
  await expect(identita).toContainText('costo attribuito € 0,00');
  await expect(identita).toContainText('costo residuo € 1060,00');
  await expect(identita).toContainText('costo dei carichi € 1060,00');

  // Una vendita di 7 quote consuma il lotto più recente (30,00 × 7 = 210,00) e
  // lascia intatti gli altri due: l'identità resta verificabile a occhio.
  await page.getByTestId('scarico-data').fill(dataCivileIndietro(10));
  await page.getByTestId('scarico-prezzo').fill('33');
  await page.getByTestId('scarico-quantita').fill('7');
  await page.getByTestId('btn-iscrive-scarico').click();

  await expect(page.getByTestId('scarico-successo')).toBeVisible({ timeout: 8000 });
  await fascia.scrollIntoViewIfNeeded();

  await expect(identita).toContainText('costo attribuito € 210,00');
  await expect(identita).toContainText('costo residuo € 850,00');
  await expect(identita).toContainText('costo dei carichi € 1060,00');

  // Il lotto più recente porta le due quote nella stessa barra, e le due
  // etichette sono **dentro** la barra (regressione della centratura: con
  // `place-items` su griglia `overflow: hidden` se le mangerebbe).
  const lottoRecente = page.getByTestId(`lotto-${perData[2].id}`);
  await expect(lottoRecente.locator('.quota.consumata')).toContainText('7 consumate');
  await expect(lottoRecente.locator('.quota.residua')).toContainText('11 residue');
  const larghezzaEtichetta = await lottoRecente
    .locator('.quota.consumata')
    .evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
  expect(larghezzaEtichetta, 'l\'etichetta della quota sta dentro la barra').toBe(true);

  await expect(page.getByTestId(`esito-lotto-${perData[2].id}`)).toContainText('consumato in parte');
  await expect(page.getByTestId(`esito-lotto-${perData[1].id}`)).toContainText('non toccato');
});

// ─── Scenario 5: lotto fuori data ────────────────────────────────────────────

test('lotto fuori data: dichiarato «non attribuibile» invece di sparire dalla fascia', async ({
  page,
  archivio,
}) => {
  archivio.seminaTitolo(ISIN, TITOLO_US_054.campi);
  const portafoglio = await archivio.creaPortafoglio('US054-FuoriData');

  await archivio.aggiungiPosizione(portafoglio.id, ISIN, dataCivileIndietro(900), 10, 20);
  await archivio.aggiungiPosizione(portafoglio.id, ISIN, dataCivileIndietro(100), 15, 10);

  await apriCaricoInQuadro(page, portafoglio.id);

  const carichi = await elencaPosizioni(portafoglio.id);
  const recente = [...carichi].sort((a, b) => (a.loadDate < b.loadDate ? -1 : 1))[1];

  // Una data di vendita **anteriore** al carico più recente.
  await page.getByTestId('scarico-data').fill(dataCivileIndietro(300));

  const fascia = page.getByTestId('fascia-lifo');
  await fascia.scrollIntoViewIfNeeded();

  // Il lotto non sparisce — sparire direbbe «non esiste» — ed è invece
  // dichiarato fuori data: «esiste, ma non a quella data».
  const lottoFuoriData = page.getByTestId(`lotto-${recente.id}`);
  await expect(lottoFuoriData).toBeVisible();
  await expect(lottoFuoriData.locator('.quota.futura')).toContainText('non ancora avvenuto');
  await expect(page.getByTestId(`esito-lotto-${recente.id}`)).toContainText('non attribuibile');
});

// ─── Scenario 6: portafoglio senza giacenze ──────────────────────────────────

test('senza giacenze il quadro dichiara che non c\'è nulla da scaricare', async ({
  page,
  archivio,
}) => {
  archivio.seminaTitolo(ISIN, TITOLO_US_054.campi);
  const portafoglio = await archivio.creaPortafoglio('US054-SenzaGiacenze');

  // Un carico interamente venduto: il registro conserva le iscrizioni, ma non
  // resta quantità residua da scaricare.
  await archivio.aggiungiPosizione(portafoglio.id, ISIN, dataCivileIndietro(500), 10, 25);

  await apriCaricoInQuadro(page, portafoglio.id);
  await page.getByTestId('scarico-data').fill(dataCivileIndietro(20));
  await page.getByTestId('scarico-prezzo').fill('12');
  await page.getByTestId('scarico-quantita').fill('25');
  await page.getByTestId('btn-iscrive-scarico').click();

  const senzaGiacenze = page.getByTestId('scarico-senza-giacenze');
  await expect(senzaGiacenze).toBeVisible({ timeout: 8000 });
  await expect(senzaGiacenze).toContainText('non c');
  await expect(senzaGiacenze).toHaveClass(/placeholder-quadro/);

  // Nessun campo inerte al posto del messaggio.
  await expect(page.getByTestId('scarico-titolo')).toHaveCount(0);
  await expect(page.getByTestId('btn-iscrive-scarico')).toHaveCount(0);
});

// ─── Scenario 7: rettifica, rimozione e comandi impediti ─────────────────────

test('rettifica e rimozione nel quadro; su un carico consumato i comandi sono impediti col «perché»', async ({
  page,
  archivio,
}) => {
  archivio.seminaTitolo(ISIN, TITOLO_US_054.campi);
  const portafoglio = await archivio.creaPortafoglio('US054-Rettifica');

  const idConsumato = await archivio.aggiungiPosizione(
    portafoglio.id, ISIN, dataCivileIndietro(900), 10, 20,
  );
  const idIntatto = await archivio.aggiungiPosizione(
    portafoglio.id, ISIN, dataCivileIndietro(800), 12, 15,
  );

  await apriCaricoInQuadro(page, portafoglio.id);

  // ── Il carico non consumato si rettifica dentro la tabella ──
  await page.getByTestId(`btn-modifica-${idIntatto}`).click();
  const rigaInRettifica = page.getByTestId(`edit-riga-${idIntatto}`);
  await expect(rigaInRettifica).toHaveClass(/in-rettifica/);

  const nuovaData = dataCivileIndietro(780);
  await page.getByTestId('edit-input-data').fill(nuovaData);
  await page.getByTestId('edit-input-prezzo').fill('13.25');
  await page.getByTestId('edit-input-quantita').fill('16,5');
  await page.getByTestId(`btn-salva-modifica-${idIntatto}`).click();

  // `toFixed(4)` — il punto decimale, come nel mastro: la colonna del prezzo di
  // carico non passa da `prezzo()`, in nessuno dei due design.
  await expect(page.getByTestId(`posizione-${idIntatto}`)).toContainText('13.2500', {
    timeout: 8000,
  });
  await expect(page.getByTestId(`residuo-lotto-${idIntatto}`)).toHaveText('16,5');

  // ── Una vendita consuma in parte il carico più antico ──
  //    (LIFO consuma prima il più recente: 16,5 quote, poi 3,5 dal più antico)
  await page.getByTestId('scarico-data').fill(dataCivileIndietro(30));
  await page.getByTestId('scarico-prezzo').fill('14');
  await page.getByTestId('scarico-quantita').fill('20');
  await page.getByTestId('btn-iscrive-scarico').click();
  await expect(page.getByTestId('scarico-successo')).toBeVisible({ timeout: 8000 });

  // I comandi del carico consumato sono impediti, e il «perché» sta accanto a
  // essi — non in un tooltip: un vincolo spiegato solo al passaggio del mouse
  // non si spiega su un telefono.
  const rigaConsumata = page.getByTestId(`posizione-${idConsumato}`);
  await rigaConsumata.scrollIntoViewIfNeeded();
  await expect(page.getByTestId(`btn-modifica-${idConsumato}`)).toBeDisabled();
  await expect(page.getByTestId(`btn-rimuovi-${idConsumato}`)).toBeDisabled();

  const perche = page.getByTestId(`perche-impedito-${idConsumato}`);
  await expect(perche).toBeVisible();
  await expect(perche).toContainText('consumato in parte');
  await expect(perche).toContainText('si rettifica solo un');

  // Il lotto esaurito resta a registro, marcato, invece di sparire.
  const rigaEsaurita = page.getByTestId(`posizione-${idIntatto}`);
  await expect(rigaEsaurita).toHaveClass(/lotto-esaurito/);
  await expect(rigaEsaurita.locator('.marca-iscrizione.esaurito')).toContainText('esaurito');
});

test('un carico non consumato si rimuove dal registro nel quadro', async ({ page, archivio }) => {
  archivio.seminaTitolo(ISIN, TITOLO_US_054.campi);
  const portafoglio = await archivio.creaPortafoglio('US054-Rimozione');

  const idDaRimuovere = await archivio.aggiungiPosizione(
    portafoglio.id, ISIN, dataCivileIndietro(700), 11, 9,
  );

  await apriCaricoInQuadro(page, portafoglio.id);
  await expect(page.getByTestId(`posizione-${idDaRimuovere}`)).toBeVisible();

  // La rimozione passa da `window.confirm`, che Playwright respinge in
  // automatico se nessuno la gestisce.
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByTestId(`btn-rimuovi-${idDaRimuovere}`).click();

  await expect(page.getByTestId(`posizione-${idDaRimuovere}`)).toHaveCount(0, { timeout: 8000 });
  expect(await elencaPosizioni(portafoglio.id)).toHaveLength(0);
});

// ─── Scenario 8: le due tabelle vuote ────────────────────────────────────────

test('su un portafoglio nuovo entrambe le tabelle mostrano il placeholder del quadro', async ({
  page,
  archivio,
}) => {
  const portafoglio = await archivio.creaPortafoglio('US054-Vuoto');

  await apriCaricoInQuadro(page, portafoglio.id);

  // Non un'intestazione senza righe: il placeholder che dichiara il vuoto.
  await expect(page.getByTestId('tabella-posizioni')).toHaveCount(0);
  await expect(page.getByTestId('tabella-registro-carichi')).toHaveCount(0);

  const posizioniVuote = page.getByTestId('tabella-posizioni-vuota');
  await expect(posizioniVuote).toBeVisible();
  await expect(posizioniVuote).toContainText('Nessuna posizione iscritta');

  const registroVuoto = page.getByTestId('tabella-registro-vuota');
  await expect(registroVuoto).toBeVisible();
  await expect(registroVuoto).toContainText('Nessuna iscrizione registrata');

  // Nemmeno il modulo di scarico ha qualcosa da offrire.
  await expect(page.getByTestId('scarico-senza-giacenze')).toBeVisible();
  await expect(page.getByTestId('contatore-posizioni')).toContainText('0 ISIN');
});

// ─── Scenario 9: posizioni chiuse nel quadro (verifica US-051) ───────────────

test('la sezione «Posizioni chiuse» è resa nel quadro — verifica, non duplicazione', async ({
  page,
  archivio,
}) => {
  archivio.seminaTitolo(ISIN, TITOLO_US_054.campi);
  const portafoglio = await archivio.creaPortafoglio('US054-Chiuse');

  await archivio.aggiungiPosizione(portafoglio.id, ISIN, dataCivileIndietro(600), 10, 30);

  await apriCaricoInQuadro(page, portafoglio.id);
  await page.getByTestId('scarico-data').fill(dataCivileIndietro(20));
  await page.getByTestId('scarico-prezzo').fill('13');
  await page.getByTestId('scarico-quantita').fill('30');
  await page.getByTestId('btn-iscrive-scarico').click();
  await expect(page.getByTestId('scarico-successo')).toBeVisible({ timeout: 8000 });

  // La sezione vive nella scheda Riepilogo, che US-051 ha già consegnato:
  // ricostruirla nella scheda carico creerebbe una seconda tabella per gli
  // stessi dati.
  await page.locator('.voce-nav', { hasText: 'Riepilogo' }).click();

  const chiuse = page.getByTestId('tabella-posizioni-chiuse');
  await expect(chiuse).toBeVisible({ timeout: 8000 });
  await expect(chiuse).toContainText(ISIN);

  // Una sola tabella delle posizioni chiuse in tutta l'applicazione.
  await expect(page.getByTestId('tabella-posizioni-chiuse')).toHaveCount(1);
});
