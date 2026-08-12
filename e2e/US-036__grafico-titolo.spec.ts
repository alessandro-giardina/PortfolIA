/**
 * US-036: Il grafico dell'andamento del prezzo del titolo — scenario demo.
 *
 * Dimostra ciò che la spec promette: aprendo la scheda di un titolo con **due
 * carichi** e **due rilevazioni**, sotto la tabella «Storico prezzi» compare un
 * grafico con **quattro punti** — due prezzi di carico e due quotazioni rilevate,
 * graficamente distinti — attraversato dalla **linea orizzontale del prezzo medio
 * ponderato di carico**.
 *
 * Le due rilevazioni sono **seminate**, non provocate, per la stessa ragione già
 * registrata in `US-009__storico-prezzi.spec.ts`: provocarle richiederebbe due
 * sessioni di borsa distinte e due risposte diverse dalla fonte reale, e
 * intercettare la rotta con `route.fulfill()` non registrerebbe alcuna
 * osservazione in archivio — il grafico resterebbe senza i punti da tracciare.
 *
 * Le asserzioni guardano gli **attributi** che il componente espone
 * (`data-punti`, `data-origine`, `data-prezzo`, `data-istante`) e non la
 * geometria in pixel: le coordinate della tela cambiano a ogni ritocco di stile
 * senza che il comportamento cambi, e un test agganciato a quelle si romperebbe
 * per motivi che non riguardano l'utente.
 *
 * Il prezzo medio atteso è **calcolato qui** dai due carichi che il test stesso
 * iscrive — quantità × prezzo, diviso la quantità totale — e non letto dalla
 * pagina: così il test prova il valore invece di copiarlo da chi dovrebbe
 * dimostrarlo.
 *
 * Titolo seminato: TITOLO_US_036, riservato a questo file (regola un-ISIN-per-file
 * in e2e/support/titoli.ts).
 */
import { test, expect } from './support/fixtures.js';
import { TITOLO_US_036 } from './support/titoli.js';

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
  await page.video()?.saveAs('docs/test-results/US-036/demo-grafico-titolo.webm');
});

/**
 * I due carichi dello scenario: date civili anteriori alle rilevazioni, così
 * l'ordine dei punti della serie è noto — `componiSerieTitolo` ordina per
 * istante crescente, e i testid `punto-serie-N` seguono quell'ordine da 0.
 *
 * Le quantità sono **diverse** di proposito: con quantità uguali la media
 * ponderata coinciderebbe con quella aritmetica, e la linea di riferimento
 * dimostrerebbe la metà di quello che deve dimostrare.
 */
const CARICHI = [
  { data: '2026-02-16', prezzo: 76.4, quantita: 45 },
  { data: '2026-04-21', prezzo: 79.8, quantita: 15 },
];

/** Il prezzo della rilevazione più vecchia: diverso da quello in cache, di cinque giorni prima. */
const PREZZO_PRECEDENTE = 81.6;
const CINQUE_GIORNI_IN_SECONDI = 5 * 24 * 60 * 60;

/**
 * Il prezzo medio ponderato atteso, calcolato con la stessa formula e nello
 * stesso ordine del server (`Σ prezzo × quantità / Σ quantità`, sui carichi in
 * ordine di data): l'attesa è un numero derivato dalle premesse del test, non
 * una cifra trascritta a mano che potrebbe restare vera per caso.
 */
const QUANTITA_TOTALE = CARICHI.reduce((somma, c) => somma + c.quantita, 0);
const SOMMA_PONDERATA = CARICHI.reduce((somma, c) => somma + c.prezzo * c.quantita, 0);
const PREZZO_MEDIO_ATTESO = SOMMA_PONDERATA / QUANTITA_TOTALE;

test('demo: due carichi e due rilevazioni tracciano quattro punti distinti, attraversati dalla linea del prezzo medio', async ({
  page,
  archivio,
}) => {
  const { id: portfolioId } = await archivio.creaPortafoglio('Demo Grafico Titolo');

  // ─── Premesse possedute dal test, non ereditate ─────────────────────────────
  // Il titolo è seminato in cache: senza, l'apertura della scheda pagherebbe un
  // recupero reale dalla fonte (8-12 secondi, esito dipendente dall'ora del run).
  archivio.seminaTitolo(TITOLO_US_036.isin, TITOLO_US_036.campi);
  for (const carico of CARICHI) {
    await archivio.aggiungiPosizione(
      portfolioId,
      TITOLO_US_036.isin,
      carico.data,
      carico.prezzo,
      carico.quantita,
    );
  }

  // L'istante del recupero in cache è anche quello della rilevazione più recente:
  // così «Rilevato il» in cima alla scheda, la prima riga dello storico e l'ultimo
  // punto del grafico dichiarano tutti lo stesso momento.
  const rilevazioneRecente = archivio.leggiTitolo(TITOLO_US_036.isin)!.fetched_at;

  // `seminaOsservazioni` *sostituisce* quanto risulta in archivio: il conteggio
  // dei punti è una premessa garantita e non un'eredità del backfill d'avvio.
  archivio.seminaOsservazioni(TITOLO_US_036.isin, [
    {
      price: PREZZO_PRECEDENTE,
      observed_at: rilevazioneRecente - CINQUE_GIORNI_IN_SECONDI,
      data_source: 'borsaitaliana',
    },
    {
      price: TITOLO_US_036.campi.price!,
      observed_at: rilevazioneRecente,
      data_source: 'borsaitaliana',
    },
  ]);

  // 1. Il portafoglio si apre sul riepilogo, con il titolo in tabella
  await page.goto(`/portfolio/${portfolioId}`);
  const riga = page.getByTestId(`riepilogo-${TITOLO_US_036.isin}`);
  await expect(riga).toBeVisible({ timeout: 8000 });

  await page.waitForTimeout(1200);

  // 2. Il clic sulla riga apre la scheda titolo
  await riga.click();
  const scheda = page.getByTestId('scheda-titolo');
  await expect(scheda).toBeVisible({ timeout: 8000 });

  // 3. Le due sezioni che il grafico rilegge sono al loro posto: i carichi
  //    registrati e lo storico prezzi. Il grafico è la sezione *dopo*.
  await expect(page.getByTestId('tabella-carichi-titolo')).toBeVisible();
  const storico = page.getByTestId('tabella-storico-prezzi');
  await storico.scrollIntoViewIfNeeded();
  await expect(storico.locator('tbody tr')).toHaveCount(2);

  await page.waitForTimeout(800);

  // 4. Si scorre oltre «Storico prezzi»: in fondo alla scheda c'è «Andamento del
  //    titolo» — intestata al titolo e non al prezzo da US-039, che vi ha
  //    aggiunto la seconda vista
  const sezione = page.getByTestId('sezione-grafico-titolo');
  await sezione.scrollIntoViewIfNeeded();
  await expect(sezione).toBeVisible();
  await expect(sezione).toContainText('Andamento del titolo');

  // 5. Il grafico dichiara quattro punti d'archivio
  const grafico = page.getByTestId('grafico-titolo');
  await expect(grafico).toBeVisible();
  await expect(grafico).toHaveAttribute('data-punti', '4');
  await expect(grafico.locator('svg.tracciato')).toBeVisible();

  await page.waitForTimeout(800);

  // 6. I quattro punti, in ordine crescente di istante: prima i due carichi
  //    (date civili anteriori), poi le due rilevazioni. Ognuno dichiara la
  //    propria origine — è la distinzione grafica resa verificabile.
  const puntiAttesi = [
    {
      origine: 'carico',
      prezzo: CARICHI[0].prezzo,
      istante: Date.parse(`${CARICHI[0].data}T00:00:00Z`),
    },
    {
      origine: 'carico',
      prezzo: CARICHI[1].prezzo,
      istante: Date.parse(`${CARICHI[1].data}T00:00:00Z`),
    },
    {
      origine: 'rilevazione',
      prezzo: PREZZO_PRECEDENTE,
      istante: (rilevazioneRecente - CINQUE_GIORNI_IN_SECONDI) * 1000,
    },
    {
      origine: 'rilevazione',
      prezzo: TITOLO_US_036.campi.price!,
      istante: rilevazioneRecente * 1000,
    },
  ];

  for (const [indice, atteso] of puntiAttesi.entries()) {
    const punto = page.getByTestId(`punto-serie-${indice}`);
    await expect(punto).toHaveAttribute('data-origine', atteso.origine);
    await expect(punto).toHaveAttribute('data-prezzo', String(atteso.prezzo));
    await expect(punto).toHaveAttribute('data-istante', String(atteso.istante));
  }

  // Due di carico e due da rilevazione: nessuna terza origine, nessun punto in più
  await expect(grafico.locator('[data-origine="carico"]')).toHaveCount(2);
  await expect(grafico.locator('[data-origine="rilevazione"]')).toHaveCount(2);

  // 7. La legenda nomina i segni: senza di essa la distinzione fra rombo e
  //    cerchio resterebbe una convenzione privata del disegno
  const legenda = page.getByTestId('legenda-grafico');
  await expect(legenda).toBeVisible();
  await expect(legenda).toContainText('Prezzi di carico');
  await expect(legenda).toContainText('Rilevazioni registrate');
  await expect(legenda).toContainText('Prezzo medio ponderato di carico');

  await page.waitForTimeout(800);

  // 8. La linea orizzontale del prezzo medio ponderato di carico attraversa il
  //    tracciato, e dichiara il valore che il test ha calcolato dai suoi carichi.
  //    Nessun `toBeVisible()`: una `<line>` orizzontale ha un rettangolo di
  //    altezza nulla, che Playwright considera non visibile pur essendo disegnata.
  const lineaMedia = grafico.getByTestId('linea-prezzo-medio');
  await expect(lineaMedia).toHaveCount(1);
  await expect(lineaMedia).toHaveAttribute('data-prezzo', String(PREZZO_MEDIO_ATTESO));

  // 9. Il grafico dichiara di non chiedere nulla alla fonte e di non interpolare:
  //    con quattro punti non è la variante «senza andamento»
  const avviso = page.getByTestId('avviso-grafico-titolo');
  await expect(avviso).toBeVisible();
  await expect(avviso).not.toHaveClass(/senza-andamento/);
  await expect(avviso).toContainText('non li stima, non li interpola');

  // 10. Fino in fondo alla scheda: la nota che dichiara il perché del tratteggio
  const nota = page.getByTestId('nota-grafico-titolo');
  await nota.scrollIntoViewIfNeeded();
  await expect(nota).toBeVisible();
  await expect(nota).toContainText('Il tratteggio');

  // Pausa finale: il grafico completo resta nel fotogramma registrato, invece di
  // essere spazzato via dal teardown un istante dopo l'ultima asserzione.
  await page.waitForTimeout(2000);
});
