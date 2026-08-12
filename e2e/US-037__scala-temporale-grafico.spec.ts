/**
 * US-037: la scala temporale del grafico del titolo — scenario dimostrativo.
 *
 * Dimostra ciò che la spec promette: la scheda si apre su «Tutto lo storico» con
 * tutti i punti d'archivio; scegliendo «Ultimo mese» il tracciato si restringe a
 * quell'intervallo e restano i soli punti che vi cadono; scegliendo «Ultimi 10
 * anni» l'orizzonte resta pieno — non si accorcia fino al primo dato — e la
 * pagina dichiara da quando la copertura comincia davvero.
 *
 * Le premesse sono in **giorni indietro da adesso** e non in date fisse: una
 * data scritta a mano invecchia, e fra sei mesi «ultimo mese» smetterebbe di
 * contenere ciò che il test crede di averci messo. Così invece lo scenario resta
 * vero in qualunque giorno la suite giri.
 *
 * Le asserzioni guardano gli attributi che il componente espone (`data-scala`,
 * `data-copertura`, `data-punti`, `data-inizio-dati`, `aria-pressed`) e mai la
 * geometria in pixel: le coordinate della tela cambiano a ogni ritocco di stile
 * senza che il comportamento cambi.
 *
 * Titolo seminato: TITOLO_US_037, riservato a questo file. Il seme porta
 * `fetched_at` di adesso (il default di `seminaTitolo`) ed è la guardia che
 * impedisce un recupero reale dalla fonte: un recupero registrerebbe
 * un'osservazione a oggi e cambierebbe il conteggio dei punti sotto i piedi del
 * test.
 */
import { test, expect } from './support/fixtures.js';
import { TITOLO_US_037 } from './support/titoli.js';

test.use({
  // `video: 'on'` da solo scala la registrazione a 800×450: la dimensione va
  // dichiarata esplicitamente perché il video corrisponda al viewport.
  video: { mode: 'on', size: { width: 1280, height: 720 } },
  launchOptions: { slowMo: 300 },
  viewport: { width: 1280, height: 720 },
});

// `outputDir` non è un'opzione di test.use() (è solo project/config-level), quindi
// il video va salvato a mano. `saveAs` attende la fine della registrazione, che
// avviene alla chiusura della pagina: va chiamato dopo `page.close()`.
test.afterEach(async ({ page }) => {
  await page.close();
  await page.video()?.saveAs('docs/test-results/US-037/demo-scala-temporale.webm');
});

const ISIN = TITOLO_US_037.isin;
const GIORNO_IN_SECONDI = 24 * 60 * 60;

/**
 * La data civile di `giorni` fa, in `YYYY-MM-DD` **UTC**.
 *
 * L'UTC non è un dettaglio: `Position.loadDate` è una data civile che il grafico
 * àncora a mezzanotte UTC, e comporla dai campi locali la farebbe scivolare di un
 * giorno a ogni offset negativo.
 */
function dataCivileIndietro(giorni: number): string {
  const d = new Date(Date.now() - giorni * GIORNO_IN_SECONDI * 1000);
  const mese = String(d.getUTCMonth() + 1).padStart(2, '0');
  const giorno = String(d.getUTCDate()).padStart(2, '0');
  return `${d.getUTCFullYear()}-${mese}-${giorno}`;
}

/**
 * Due carichi lontani e una rilevazione di mezzo, tutti **fuori** dall'ultimo
 * mese; due rilevazioni recenti, dentro. Il margine è largo — 40 giorni contro
 * un mese civile — perché il confine non deve cadere vicino a un estremo: un
 * test che passa per un giorno di scarto è un test che fallirà da solo.
 */
const CARICHI = [
  { giorniFa: 150, prezzo: 88.4, quantita: 40 },
  { giorniFa: 90, prezzo: 91.1, quantita: 20 },
];
const RILEVAZIONE_LONTANA = { giorniFa: 40, prezzo: 89.7 };
const RILEVAZIONE_RECENTE = { giorniFa: 10, prezzo: 92.5 };

/** Il primo punto d'archivio: il carico più antico, ancorato a mezzanotte UTC. */
const ISTANTE_PRIMO_PUNTO = () => Date.parse(`${dataCivileIndietro(CARICHI[0].giorniFa)}T00:00:00Z`);

test('demo: la scheda si apre su tutto lo storico, «ultimo mese» restringe il tracciato e «ultimi 10 anni» dichiara da quando i dati esistono', async ({
  page,
  archivio,
}) => {
  const { id: portfolioId } = await archivio.creaPortafoglio('Demo Scala Temporale');

  // ─── Premesse possedute dal test, non ereditate ─────────────────────────────
  archivio.seminaTitolo(ISIN, TITOLO_US_037.campi);

  const dateCarico = CARICHI.map((carico) => dataCivileIndietro(carico.giorniFa));
  for (const [indice, carico] of CARICHI.entries()) {
    await archivio.aggiungiPosizione(
      portfolioId,
      ISIN,
      dateCarico[indice],
      carico.prezzo,
      carico.quantita,
    );
  }

  // L'istante del recupero in cache è anche quello della rilevazione più recente:
  // così «Rilevato il» in cima alla scheda, la prima riga dello storico e l'ultimo
  // punto del grafico dichiarano tutti lo stesso momento.
  const adesso = archivio.leggiTitolo(ISIN)!.fetched_at;

  // `seminaOsservazioni` *sostituisce* quanto risulta in archivio: il conteggio
  // dei punti è una premessa garantita e non un'eredità del backfill d'avvio.
  archivio.seminaOsservazioni(ISIN, [
    {
      price: RILEVAZIONE_LONTANA.prezzo,
      observed_at: adesso - RILEVAZIONE_LONTANA.giorniFa * GIORNO_IN_SECONDI,
      data_source: 'borsaitaliana',
    },
    {
      price: RILEVAZIONE_RECENTE.prezzo,
      observed_at: adesso - RILEVAZIONE_RECENTE.giorniFa * GIORNO_IN_SECONDI,
      data_source: 'borsaitaliana',
    },
    {
      // La più recente resta sul prezzo che la scheda dichiara come attuale: una
      // divergenza fra cima dello storico e cartellino non farebbe fallire nulla,
      // e mostrerebbe comunque un dato falso proprio nel filmato della spec.
      price: TITOLO_US_037.campi.price!,
      observed_at: adesso,
      data_source: 'borsaitaliana',
    },
  ]);

  // 1. Il portafoglio si apre sul riepilogo, con il titolo in tabella
  await page.goto(`/portfolio/${portfolioId}`);
  const riga = page.getByTestId(`riepilogo-${ISIN}`);
  await expect(riga).toBeVisible({ timeout: 8000 });

  await page.waitForTimeout(1000);

  // 2. Il clic sulla riga apre la scheda titolo
  await riga.click();
  await expect(page.getByTestId('scheda-titolo')).toBeVisible({ timeout: 8000 });

  // 3. In fondo alla scheda, «Andamento del prezzo»
  const sezione = page.getByTestId('sezione-grafico-titolo');
  await sezione.scrollIntoViewIfNeeded();
  await expect(sezione).toBeVisible();

  await page.waitForTimeout(800);

  // 4. All'apertura la scala è «Tutto lo storico» (criterio 2), e il tracciato
  //    porta tutti e cinque i punti d'archivio: due carichi e tre rilevazioni
  const grafico = page.getByTestId('grafico-titolo');
  await expect(grafico).toBeVisible();
  await expect(grafico).toHaveAttribute('data-scala', 'tutto');
  await expect(grafico).toHaveAttribute('data-punti', '5');
  await expect(grafico).toHaveAttribute('data-copertura', 'piena');
  await expect(page.getByTestId('scala-tutto')).toHaveAttribute('aria-pressed', 'true');
  await expect(grafico.locator('[data-origine="carico"]')).toHaveCount(2);
  await expect(grafico.locator('[data-origine="rilevazione"]')).toHaveCount(3);

  // Il selettore offre tutte e cinque le scale (criterio 1)
  const selettore = page.getByTestId('scala-temporale');
  await expect(selettore).toBeVisible();
  await expect(selettore.locator('button')).toHaveCount(5);

  await page.waitForTimeout(1200);

  // 5. «Ultimo mese»: il tracciato si restringe ai soli punti dell'intervallo
  //    (criterio 3). I tre punti anteriori escono — e nessuno di essi viene
  //    trascinato dentro la finestra come «ultimo prezzo noto».
  await page.getByTestId('scala-mese').click();
  await expect(grafico).toHaveAttribute('data-scala', 'mese');
  await expect(grafico).toHaveAttribute('data-punti', '2');
  await expect(page.getByTestId('scala-mese')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('scala-tutto')).toHaveAttribute('aria-pressed', 'false');

  // I due punti rimasti sono le rilevazioni recenti, non un residuo dei carichi
  await expect(grafico.locator('[data-origine="carico"]')).toHaveCount(0);
  await expect(grafico.locator('[data-origine="rilevazione"]')).toHaveCount(2);
  await expect(page.getByTestId('punto-serie-0')).toHaveAttribute(
    'data-prezzo',
    String(RILEVAZIONE_RECENTE.prezzo),
  );

  // La riga del prezzo medio non si ricalcola sulla finestra: è un fatto della
  // posizione, non del ritaglio, e resta quella dei due carichi
  const quantitaTotale = CARICHI.reduce((somma, c) => somma + c.quantita, 0);
  const sommaPonderata = CARICHI.reduce((somma, c) => somma + c.prezzo * c.quantita, 0);
  await expect(grafico.getByTestId('linea-prezzo-medio')).toHaveAttribute(
    'data-prezzo',
    String(sommaPonderata / quantitaTotale),
  );

  await page.waitForTimeout(1200);

  // 6. «Ultimi 10 anni»: l'orizzonte chiesto resta pieno — i punti tornano tutti
  //    e cinque — ma la copertura è dichiarata parziale, e la dichiarazione dice
  //    da quando i dati esistono davvero (criterio 5)
  await page.getByTestId('scala-dieci-anni').click();
  await expect(grafico).toHaveAttribute('data-scala', 'dieci-anni');
  await expect(grafico).toHaveAttribute('data-punti', '5');
  await expect(grafico).toHaveAttribute('data-copertura', 'parziale');

  const dichiarazione = page.getByTestId('dichiarazione-copertura');
  await dichiarazione.scrollIntoViewIfNeeded();
  await expect(dichiarazione).toBeVisible();
  await expect(dichiarazione).toHaveAttribute('data-inizio-dati', String(ISTANTE_PRIMO_PUNTO()));
  await expect(dichiarazione).toContainText('i dati cominciano il');

  // L'asse non si è accorciato fino al primo dato: il tracciato è ancora
  // disegnato, e non è degradato alla dichiarazione di dato non disponibile
  await expect(grafico.locator('svg.tracciato')).toBeVisible();
  await expect(page.getByTestId('dato-non-disponibile')).toHaveCount(0);

  // Pausa finale: la dichiarazione di copertura resta nel fotogramma registrato,
  // invece di essere spazzata via dal teardown un istante dopo l'ultima asserzione.
  await page.waitForTimeout(2000);
});
