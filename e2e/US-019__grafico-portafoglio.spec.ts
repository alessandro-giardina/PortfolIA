/**
 * US-019 — grafico del valore del portafoglio nel tempo: scenario dimostrativo
 * (TASK-12).
 *
 * Riproduce lo scenario di `docs/mockups/US-019/README.md` ("Lo scenario di
 * index.html"): due titoli con date di carico e di rilevazione che **non**
 * coincidono — la condizione normale dello storico rado di ADR-008, non un
 * caso patologico — così che il grafico del valore complessivo mostri cinque
 * punti distinti, uno per ciascuna data d'evento, e nessun punto dove non
 * cade alcun evento.
 *
 * Gli ISIN del mockup sono già riservati ad altri file (`US-025`, `US-030`,
 * si veda `e2e/support/titoli.ts`): questo file usa `TITOLO_US_019` /
 * `TITOLO_US_019_SECONDO`, riservati a questo stesso file da TASK-11 con la
 * stessa identità narrativa (Ishares Core MSCI World / Vanguard FTSE
 * All-World) e con `price` già coerente con l'ultima rilevazione che questo
 * scenario semina (vedi i commenti di `e2e/support/titoli.ts`).
 *
 * Le date restano quelle **assolute** del mockup (19.IX.2025 … 10.VIII.2026),
 * a differenza di altri file demo che le esprimono in "giorni fa" da adesso:
 * qui sono fatti storici fissi che la spec vuole dimostrare uno per uno, e
 * "giorni fa" renderebbe illeggibile il confronto con la tabella del mockup.
 * Cadono tutte nel passato rispetto a "oggi" nell'ambiente in cui questo file
 * è stato scritto (agosto 2026): se la suite gira anni dopo, i fatti restano
 * storicamente veri, cambia solo la distanza fra l'ultimo punto e "oggi" nel
 * grafico — non il numero di punti né i loro valori.
 *
 * **Perché il punto verificato in dettaglio titolo-per-titolo è il
 * 10.VIII.2026 e non il 3.VI.2026** che il mockup statico annota come "punto
 * della dimostrazione" (€ 16.636,00): il componente reale
 * (`client/src/components/GraficoPortafoglio.tsx`) scrive il dettaglio
 * completo — quale titolo è su rilevazione del giorno, quale su quotazione
 * riportata, di che data e con quanti giorni di età — soltanto nella sezione
 * `.composizione-punto`, e **soltanto per il punto più recente della serie**.
 * In questo scenario quel punto è il 10.VIII.2026 (la seconda rilevazione del
 * primo titolo), non il 3.VI.2026. Per il punto del 3.VI.2026 il test verifica
 * ciò che il componente realmente gli attacca: il valore (€ 16.636,00), la
 * copertura piena e il conteggio "1 su quotazione riportata" nel titolo SVG
 * del punto — senza la data e l'età del riporto, che a quel livello di
 * dettaglio il componente non scrive. Il discostamento è documentato anche nel
 * report finale del task.
 */
import { test, expect } from './support/fixtures.js';
import { TITOLO_US_019, TITOLO_US_019_SECONDO } from './support/titoli.js';

test.use({
  // `video: 'on'` da solo scala la registrazione a 800×450: la dimensione va
  // dichiarata esplicitamente perché il video corrisponda al viewport.
  video: { mode: 'on', size: { width: 1280, height: 720 } },
  launchOptions: { slowMo: 350 },
  viewport: { width: 1280, height: 720 },
});

// `outputDir` non è un'opzione di test.use() (è solo project/config-level),
// quindi il video va salvato a mano. `saveAs` attende la fine della
// registrazione, che avviene alla chiusura della pagina: va chiamato dopo
// `page.close()`.
test.afterEach(async ({ page }) => {
  await page.close();
  await page.video()?.saveAs('docs/test-results/US-019/demo-grafico-portafoglio.webm');
});

const ISIN_1 = TITOLO_US_019.isin;
const ISIN_2 = TITOLO_US_019_SECONDO.isin;

/**
 * Istante (unix, secondi) di mezzogiorno UTC di una data civile `YYYY-MM-DD`.
 *
 * Mezzogiorno e non mezzanotte: il giorno civile di una rilevazione (ADR-010,
 * `giornoCivilePunto` in `shared/domain/serieTitolo.ts`) si legge in fuso
 * *locale*, e la macchina che esegue la suite è in `Europe/Rome` — mezzogiorno
 * UTC cade alle 13 o alle 14 locali secondo l'ora legale, ben dentro lo stesso
 * giorno civile in qualunque fuso ragionevole in cui la suite potesse girare.
 */
function mezzogiornoUtc(dataCivile: string): number {
  const [anno, mese, giorno] = dataCivile.split('-').map(Number);
  return Math.floor(Date.UTC(anno, mese - 1, giorno, 12, 0, 0) / 1000);
}

// ─── Lo scenario di docs/mockups/US-019/README.md ("Lo scenario di index.html") ──

const CARICO_1 = { data: '2025-09-19', prezzo: 58.4, quantita: 80 }; // 19.IX.2025
const CARICO_2 = { data: '2026-03-04', prezzo: 71.2, quantita: 120 }; // 04.III.2026

const RILEVAZIONE_1A = { data: '2026-05-12', prezzo: 96.2 }; // 12.V.2026
const RILEVAZIONE_1B = { data: '2026-08-10', prezzo: TITOLO_US_019.campi.price! }; // 10.VIII.2026
const RILEVAZIONE_2 = { data: '2026-06-03', prezzo: TITOLO_US_019_SECONDO.campi.price! }; // 03.VI.2026

// Il punto della dimostrazione del mockup: 80×96,20 + 120×74,50.
const VALORE_3_VI_2026 = CARICO_1.quantita * RILEVAZIONE_1A.prezzo + CARICO_2.quantita * RILEVAZIONE_2.prezzo;

test(`demo: il grafico del valore del portafoglio mostra un punto per ciascuna data d'evento, e dichiara il riporto del prezzo titolo per titolo`, async ({
  page,
  archivio,
}) => {
  const { id: portfolioId } = await archivio.creaPortafoglio('Demo Grafico Portafoglio');

  // ─── Premesse possedute dal test, non ereditate ───────────────────────────
  archivio.seminaTitolo(ISIN_1, TITOLO_US_019.campi);
  archivio.seminaTitolo(ISIN_2, TITOLO_US_019_SECONDO.campi);

  await archivio.aggiungiPosizione(portfolioId, ISIN_1, CARICO_1.data, CARICO_1.prezzo, CARICO_1.quantita);
  await archivio.aggiungiPosizione(portfolioId, ISIN_2, CARICO_2.data, CARICO_2.prezzo, CARICO_2.quantita);

  // `seminaOsservazioni` *sostituisce* quanto risulta in archivio: il numero
  // dei punti del grafico è una premessa garantita, non un'eredità del
  // backfill d'avvio o di un run precedente.
  archivio.seminaOsservazioni(ISIN_1, [
    {
      price: RILEVAZIONE_1A.prezzo,
      observed_at: mezzogiornoUtc(RILEVAZIONE_1A.data),
      data_source: 'borsaitaliana',
    },
    {
      price: RILEVAZIONE_1B.prezzo,
      observed_at: mezzogiornoUtc(RILEVAZIONE_1B.data),
      data_source: 'borsaitaliana',
    },
  ]);
  archivio.seminaOsservazioni(ISIN_2, [
    {
      price: RILEVAZIONE_2.prezzo,
      observed_at: mezzogiornoUtc(RILEVAZIONE_2.data),
      data_source: 'borsaitaliana',
    },
  ]);

  // 1. Il portafoglio si apre già sulla scheda Riepilogo
  await page.goto(`/portfolio/${portfolioId}`);
  const tabellaRiepilogo = page.getByTestId('tabella-riepilogo');
  await expect(tabellaRiepilogo).toBeVisible({ timeout: 8000 });

  await page.waitForTimeout(800);

  // 2. Sotto il quadro del risultato, la sezione «Andamento del portafoglio»
  const sezione = page.locator('.sezione-titolo').filter({ hasText: 'Andamento del portafoglio' });
  await sezione.scrollIntoViewIfNeeded();
  await expect(sezione).toBeVisible();

  // 3. Il grafico: perimetro di 2 titoli, 5 date d'evento, copertura ancora
  //    parziale in testa alla finestra (criterio 6 — nessuna curva finta)
  const grafico = page.getByTestId('grafico-portafoglio');
  await expect(grafico).toBeVisible();
  await expect(grafico).toHaveAttribute('data-titoli', '2');
  await expect(grafico).toHaveAttribute('data-punti', '5');
  await expect(grafico).toHaveAttribute('data-copertura', 'parziale');

  const cornice = grafico.getByTestId('grafico-portafoglio-parziale');
  await expect(cornice).toBeVisible();

  await page.waitForTimeout(800);

  // 4. Le due date di carico: titoli detenuti, ma nessuno ancora valorizzato —
  //    «non affermabile», non zero (i due zeri di ADR-010)
  const puntoCarico1 = grafico.getByTestId('punto-portafoglio-0');
  await expect(puntoCarico1).toHaveAttribute('data-origine', 'carico');
  await expect(puntoCarico1).toHaveAttribute('data-copertura', 'parziale');
  expect(await puntoCarico1.getAttribute('data-valore')).toBeNull();

  const puntoCarico2 = grafico.getByTestId('punto-portafoglio-1');
  await expect(puntoCarico2).toHaveAttribute('data-origine', 'carico');
  await expect(puntoCarico2).toHaveAttribute('data-copertura', 'parziale');
  expect(await puntoCarico2.getAttribute('data-valore')).toBeNull();

  await page.waitForTimeout(800);

  // 5. La rilevazione del 12.V.2026: solo il primo titolo è valorizzato — la
  //    somma (€ 7.696,00) è parziale, non il valore del portafoglio
  const puntoRilevazione1 = grafico.getByTestId('punto-portafoglio-2');
  await expect(puntoRilevazione1).toHaveAttribute('data-origine', 'rilevazione');
  await expect(puntoRilevazione1).toHaveAttribute('data-copertura', 'parziale');
  await expect(puntoRilevazione1).toHaveAttribute('data-valore', '7696');

  await page.waitForTimeout(800);

  // 6. Il punto del 3.VI.2026 — quello che il mockup annota come dimostrazione:
  //    da qui in avanti la copertura è piena, ed € 16.636,00 è per la prima
  //    volta un valore complessivo affermabile, non una somma parziale
  const puntoDimostrazione = grafico.getByTestId('punto-portafoglio-3');
  await puntoDimostrazione.scrollIntoViewIfNeeded();
  await expect(puntoDimostrazione).toHaveAttribute('data-origine', 'rilevazione');
  await expect(puntoDimostrazione).toHaveAttribute('data-copertura', 'piena');
  await expect(puntoDimostrazione).toHaveAttribute('data-valore', String(VALORE_3_VI_2026));

  // Il titolo SVG del punto dichiara la cifra e quanti titoli sono su
  // quotazione riportata: è il solo dettaglio che il componente attacca a
  // *questo* punto (non è l'ultimo della serie — vedi il commento di testata).
  const titoloSvgDimostrazione = puntoDimostrazione.locator('title');
  await expect(titoloSvgDimostrazione).toContainText('16.636,00');
  await expect(titoloSvgDimostrazione).toContainText('1 su quotazione riportata');

  // La barra del perimetro dichiara in parole da quando comincia la copertura piena
  await expect(grafico.locator('.verdetto')).toContainText('copertura piena dal 03.VI.2026');

  await page.waitForTimeout(1200);

  // 7. La composizione del punto più recente della serie — il 10.VIII.2026, non
  //    il 3.VI.2026: qui il componente scrive quale titolo è su rilevazione del
  //    giorno, quale su quotazione riportata, di quando e da quanti giorni
  const composizione = grafico.locator('.composizione-punto');
  await composizione.scrollIntoViewIfNeeded();
  await expect(composizione).toBeVisible();
  await expect(composizione.locator('.data-punto')).toContainText('Punto del 10.VIII.2026');
  await expect(composizione.locator('.conto-punto')).toContainText('1 titolo su rilevazione del giorno');
  await expect(composizione.locator('.conto-punto')).toContainText('1 su quotazione riportata');
  await expect(composizione.locator('.conto-punto')).toContainText('0 non valorizzati');
  await expect(composizione.locator('.cifra-punto')).toContainText('€ 19.216,80');

  await page.waitForTimeout(1000);

  // 8. Riga per riga: il primo titolo è rilevato quel giorno stesso, il
  //    secondo porta il timbro d'ottone del riporto — data e età dichiarate
  const rigaTitolo1 = composizione.locator('.riga-contributo').filter({ hasText: ISIN_1 });
  await rigaTitolo1.scrollIntoViewIfNeeded();
  await expect(rigaTitolo1.locator('.timbro-riporto')).toContainText('rilevazione del 10.VIII.2026');

  const rigaTitolo2 = composizione.locator('.riga-contributo').filter({ hasText: ISIN_2 });
  await expect(rigaTitolo2.locator('.timbro-riporto')).toContainText('quotazione del 03.VI.2026');
  await expect(rigaTitolo2.locator('.timbro-riporto')).toContainText('68 giorni');
  await expect(rigaTitolo2).toHaveClass(/riportata/);

  // Pausa finale: lo stato resta nel fotogramma registrato, invece di essere
  // spazzato via dal teardown un istante dopo l'ultima asserzione.
  await page.waitForTimeout(1500);
});
