/**
 * US-042 — l'attribuzione LIFO dei lotti alle vendite.
 *
 * Il guasto temuto qui non è un'eccezione: è un **ordine sbagliato che produce
 * numeri plausibili**. LIFO, FIFO e media ponderata danno tutti e tre un prezzo
 * medio del residuo credibile, tutti e tre lasciano la quantità residua corretta,
 * e differiscono solo per *quale* costo è uscito e quale è rimasto. Un test che
 * si limitasse a contare le quote passerebbe su tutte e tre le implementazioni.
 *
 * Da qui la forma dei casi di questo file:
 *
 * - i lotti hanno **prezzi diversi**, sempre. A prezzi uguali LIFO e FIFO
 *   coincidono, cioè proprio nel caso che verrebbe naturale scrivere per primo;
 * - le **quantità sono diverse fra i lotti**, perché la media ponderata e quella
 *   aritmetica si distinguono solo così (è la lezione di `metricheTitolo.test.ts`);
 * - l'ordine di **ingresso** delle vendite è a volte l'inverso di quello
 *   cronologico: se la funzione non riordinasse, due letture dello stesso registro
 *   darebbero residui per lotto diversi e nulla lo segnalerebbe;
 * - due carichi cadono **lo stesso giorno**, il solo caso in cui l'ordine LIFO è
 *   ambiguo sulla sola data e deve essere sciolto dall'`id`. Senza questo caso
 *   l'esito dipenderebbe dall'ordine in cui l'archivio restituisce le righe.
 *
 * Le due invarianti sono verificate come invarianti, non come numeri attesi:
 * `quantitaResidua >= 0` anche su un registro incoerente (FR-024), e
 * `costoAttribuito + costoResiduo = costo dei carichi` — l'identità che i mockup
 * mostrano a schermo e che US-043 userà come base della percentuale.
 *
 * Lo scenario ricorrente è quello dei mockup di US-042, così che i numeri siano
 * confrontabili a occhio con le tre pagine di `docs/mockups/US-042/`.
 *
 * Le funzioni sono pure: nessuna rete, nessun archivio, nessun orologio.
 */
import { describe, it, expect } from 'vitest';
import {
  calcolaPnlDaCarico,
  quantitaDisponibileA,
  residuoPerIsin,
  rigiocaRegistro,
  verificaVendita,
  type CaricoLotto,
  type VenditaLotto,
} from '@portfolia/shared';

/** Un carico, nella forma ridotta che l'attribuzione legge. */
const carico = (id: number, loadDate: string, quantity: number, loadPrice: number): CaricoLotto => ({
  id,
  loadDate,
  loadPrice,
  quantity,
});

/**
 * Una vendita, nella forma ridotta che l'attribuzione legge.
 *
 * `salePrice` è opzionale e non `12.5` per pigrizia: i casi che questo file
 * verificava prima di US-043 (attribuzione, quantità residua, invarianti 3/4)
 * non hanno bisogno di un prezzo di vendita specifico, e un default qualunque
 * lascia quei casi di leggere come prima. I test del P&L realizzato lo passano
 * sempre esplicito.
 */
const vendita = (id: number, saleDate: string, quantity: number, salePrice = 12.5): VenditaLotto => ({
  id,
  saleDate,
  quantity,
  salePrice,
});

// ─── Lo scenario dei mockup ─────────────────────────────────────────────────
// Carico n. 1: 12.IV.2023 · 600 quote a € 9,8000  = € 5.880,00
// Carico n. 2: 07.II.2025 · 400 quote a € 11,5000 = € 4.600,00
// Prezzo medio ponderato prima di ogni vendita: € 10,4800 su 1.000 quote.
const CARICO_1 = carico(1, '2023-04-12', 600, 9.8);
const CARICO_2 = carico(2, '2025-02-07', 400, 11.5);
const CARICHI = [CARICO_1, CARICO_2];

/** Il costo dei carichi, calcolato con la stessa aritmetica del dominio. */
const COSTO_CARICHI = 9.8 * 600 + 11.5 * 400;

/** Quote consumate dal lotto `caricoId` in `registro`, sommate su tutte le vendite. */
function consumatoDa(
  registro: ReturnType<typeof rigiocaRegistro>,
  caricoId: number,
): number {
  return registro.vendite
    .flatMap((v) => v.attribuzioni)
    .filter((a) => a.caricoId === caricoId)
    .reduce((somma, a) => somma + a.quantita, 0);
}

describe('rigiocaRegistro — l\'ordine di consumo', () => {
  it('consuma per primo il lotto più recente fra quelli attribuibili', () => {
    const registro = rigiocaRegistro({
      carichi: CARICHI,
      vendite: [vendita(1, '2026-06-03', 400)],
    });

    // Una sola attribuzione, e sul carico n. 2: è il più recente, non il primo
    // iscritto. Con FIFO l'attribuzione sarebbe sul carico n. 1 e la quantità
    // residua sarebbe la stessa — è esattamente la confusione che questo caso
    // esiste per escludere.
    const [venduta] = registro.vendite;
    expect(venduta.attribuzioni).toHaveLength(1);
    expect(venduta.attribuzioni[0].caricoId).toBe(2);
    expect(venduta.attribuzioni[0].quantita).toBe(400);
    expect(venduta.costoAttribuito).toBeCloseTo(4600, 8);
    expect(venduta.scoperto).toBe(0);

    // Il carico n. 1 non è stato toccato, e il n. 2 conserva la sua quantità
    // nominale: la vendita non riscrive i carichi (ADR-009).
    const [lotto1, lotto2] = registro.lotti;
    expect(lotto1).toMatchObject({ caricoId: 1, quantita: 600, quantitaResidua: 600, quantitaConsumata: 0 });
    expect(lotto2).toMatchObject({ caricoId: 2, quantita: 400, quantitaResidua: 0, quantitaConsumata: 400 });
  });

  it('attraversa più lotti quando uno non basta, sempre dal più recente', () => {
    const registro = rigiocaRegistro({
      carichi: CARICHI,
      vendite: [vendita(1, '2026-06-03', 700)],
    });

    const [venduta] = registro.vendite;
    // L'ordine dell'array *è* l'ordine di consumo: prima il n. 2 per intero,
    // poi il residuo dal n. 1.
    expect(venduta.attribuzioni.map((a) => [a.caricoId, a.quantita])).toEqual([
      [2, 400],
      [1, 300],
    ]);
    expect(venduta.costoAttribuito).toBeCloseTo(11.5 * 400 + 9.8 * 300, 8);
    expect(venduta.scoperto).toBe(0);
    expect(registro.quantitaResidua).toBe(300);
  });

  it('consuma un lotto solo in parte quando la vendita è più piccola', () => {
    const registro = rigiocaRegistro({
      carichi: CARICHI,
      vendite: [vendita(1, '2026-06-03', 150)],
    });

    const [lotto1, lotto2] = registro.lotti;
    expect(lotto2).toMatchObject({ caricoId: 2, quantita: 400, quantitaResidua: 250, quantitaConsumata: 150 });
    expect(lotto1.quantitaResidua).toBe(600);
    expect(registro.quantitaResidua).toBe(850);
  });

  it('non consuma due volte lo stesso lotto su due vendite in sequenza', () => {
    const registro = rigiocaRegistro({
      carichi: CARICHI,
      // In ordine cronologico inverso di proposito: la funzione deve riordinare.
      // Se non lo facesse, la vendita del 10.VIII troverebbe 1.000 quote e
      // consumerebbe il n. 2 per 400 e il n. 1 per 200, lasciando alla vendita del
      // 03.VI un residuo diverso — a parità di registro.
      vendite: [vendita(2, '2026-08-10', 600), vendita(1, '2026-06-03', 400)],
    });

    expect(registro.vendite.map((v) => v.venditaId)).toEqual([1, 2]);

    const [prima, seconda] = registro.vendite;
    expect(prima.attribuzioni.map((a) => [a.caricoId, a.quantita])).toEqual([[2, 400]]);
    expect(seconda.attribuzioni.map((a) => [a.caricoId, a.quantita])).toEqual([[1, 600]]);

    // Nessun lotto consumato oltre la propria quantità nominale: è la forma
    // osservabile del «nessun doppio consumo».
    for (const lotto of registro.lotti) {
      expect(consumatoDa(registro, lotto.caricoId)).toBe(lotto.quantita);
      expect(lotto.quantitaResidua).toBe(0);
    }
    expect(registro.quantitaResidua).toBe(0);
    expect(registro.quantitaVenduta).toBe(1000);
  });

  it('scioglie con l\'id il pari merito fra due carichi dello stesso giorno', () => {
    // Stessa data, prezzi diversi: la sola cosa che distingue i due lotti
    // nell'ordine LIFO è l'id, cioè l'ordine di iscrizione. Il più recente a
    // pari data è quello iscritto per ultimo.
    const registro = rigiocaRegistro({
      carichi: [carico(7, '2024-03-01', 100, 10), carico(8, '2024-03-01', 150, 20)],
      vendite: [vendita(1, '2024-06-01', 100)],
    });

    const [venduta] = registro.vendite;
    expect(venduta.attribuzioni.map((a) => a.caricoId)).toEqual([8]);
    expect(venduta.costoAttribuito).toBeCloseTo(20 * 100, 8);
  });

  it('esclude dall\'attribuzione i lotti successivi alla data di vendita', () => {
    // Vendita del 01.I.2024: il carico n. 2 del 07.II.2025 non era ancora
    // avvenuto, e non diventa attribuibile perché servirebbe.
    const registro = rigiocaRegistro({
      carichi: CARICHI,
      vendite: [vendita(1, '2024-01-01', 400)],
    });

    const [venduta] = registro.vendite;
    expect(venduta.attribuzioni.map((a) => a.caricoId)).toEqual([1]);
    expect(venduta.attribuzioni[0].quantita).toBe(400);

    const [lotto1, lotto2] = registro.lotti;
    expect(lotto1.quantitaResidua).toBe(200);
    expect(lotto2.quantitaResidua).toBe(400);
  });

  it('non intacca i lotti oltre il loro residuo quando il registro è incoerente', () => {
    // Un archivio scritto a mano, o da una versione anteriore alla guardia:
    // 1.200 quote vendute su 1.000 caricate. La lettura non deve cadere né
    // inventare lotti, e la quantità residua non deve mai essere negativa
    // (FR-024) — nemmeno qui, dove la sottrazione ingenua darebbe −200.
    const registro = rigiocaRegistro({
      carichi: CARICHI,
      vendite: [vendita(1, '2026-06-03', 1200)],
    });

    expect(registro.quantitaResidua).toBe(0);
    expect(registro.quantitaResidua).toBeGreaterThanOrEqual(0);
    expect(registro.vendite[0].scoperto).toBe(200);
    expect(registro.scopertoTotale).toBe(200);
    for (const lotto of registro.lotti) {
      expect(lotto.quantitaResidua).toBeGreaterThanOrEqual(0);
      expect(lotto.quantitaConsumata).toBeLessThanOrEqual(lotto.quantita);
    }
  });

  it('non muta i carichi ricevuti', () => {
    // Le quantità nominali dei carichi passati in ingresso restano quelle: il
    // residuo vive in una struttura a parte, e una funzione pura che riscrivesse
    // gli argomenti del chiamante attuerebbe nel codice proprio la cosa che
    // ADR-009 vieta nel modello di dati.
    const carichi = [{ ...CARICO_1 }, { ...CARICO_2 }];
    rigiocaRegistro({ carichi, vendite: [vendita(1, '2026-06-03', 400)] });
    expect(carichi).toEqual([CARICO_1, CARICO_2]);
  });
});

describe('rigiocaRegistro — le invarianti', () => {
  const casi: Array<{ nome: string; vendite: VenditaLotto[] }> = [
    { nome: 'senza vendite', vendite: [] },
    { nome: 'vendita parziale su un solo lotto', vendite: [vendita(1, '2026-06-03', 400)] },
    { nome: 'vendita che attraversa due lotti', vendite: [vendita(1, '2026-06-03', 700)] },
    {
      nome: 'due vendite fino all\'azzeramento',
      vendite: [vendita(1, '2026-06-03', 400), vendita(2, '2026-08-10', 600)],
    },
    { nome: 'vendita antedatata', vendite: [vendita(1, '2024-01-01', 250)] },
  ];

  it.each(casi)('costo attribuito + costo residuo = costo dei carichi ($nome)', ({ vendite }) => {
    const registro = rigiocaRegistro({ carichi: CARICHI, vendite });
    // L'identità che la fascia dei lotti dei mockup scrive a schermo. Il
    // confronto è ravvicinato e non esatto perché il costo residuo si somma per
    // lotto: un lotto spezzato dà `p×q₁ + p×q₂`, che in virgola mobile può
    // differire da `p×(q₁+q₂)` nell'ultimo bit. Un centesimo di scarto
    // farebbe fallire questo test; un bit no, ed è corretto così.
    expect(registro.costoAttribuito + registro.costoResiduo).toBeCloseTo(COSTO_CARICHI, 8);
  });

  it.each(casi)('la quantità residua non è mai negativa ($nome)', ({ vendite }) => {
    const registro = rigiocaRegistro({ carichi: CARICHI, vendite });
    expect(registro.quantitaResidua).toBeGreaterThanOrEqual(0);
    for (const lotto of registro.lotti) {
      expect(lotto.quantitaResidua).toBeGreaterThanOrEqual(0);
    }
  });

  it.each(casi)('su registro coerente il residuo è Σ carichi − Σ vendite ($nome)', ({ vendite }) => {
    const registro = rigiocaRegistro({ carichi: CARICHI, vendite });
    expect(registro.scopertoTotale).toBe(0);
    // La forma in cui il criterio 3 enuncia la quantità residua. Vale su ogni
    // registro coerente, e il caso incoerente è provato a parte.
    expect(registro.quantitaResidua).toBe(registro.quantitaCaricata - registro.quantitaVenduta);
  });
});

describe('rigiocaRegistro — il P&L realizzato (US-043)', () => {
  it('calcola il realizzato di una vendita su un solo lotto come ricavo meno costo attribuito', () => {
    // Vendita di 150 quote a 12,00: consuma solo il carico n. 2 (il più
    // recente), costo attribuito 150 × 11,50 = 1.725,00.
    const registro = rigiocaRegistro({
      carichi: CARICHI,
      vendite: [vendita(1, '2026-06-03', 150, 12.0)],
    });

    const [venduta] = registro.vendite;
    expect(venduta.ricavo).toBeCloseTo(150 * 12.0, 8);
    expect(venduta.costoAttribuito).toBeCloseTo(150 * 11.5, 8);
    expect(venduta.pnlRealizzato).toBeCloseTo(150 * 12.0 - 150 * 11.5, 8);
  });

  it('calcola il realizzato di una vendita che attraversa due lotti sul costo attribuito complessivo', () => {
    // 700 quote a 12,00: costo attribuito = 400 × 11,50 (carico 2) + 300 × 9,80 (carico 1).
    const registro = rigiocaRegistro({
      carichi: CARICHI,
      vendite: [vendita(1, '2026-06-03', 700, 12.0)],
    });

    const [venduta] = registro.vendite;
    const costoAtteso = 11.5 * 400 + 9.8 * 300;
    expect(venduta.costoAttribuito).toBeCloseTo(costoAtteso, 8);
    expect(venduta.ricavo).toBeCloseTo(700 * 12.0, 8);
    expect(venduta.pnlRealizzato).toBeCloseTo(700 * 12.0 - costoAtteso, 8);
  });

  it('il pnlRealizzato di registro è la somma dei pnlRealizzato di ciascuna vendita', () => {
    const registro = rigiocaRegistro({
      carichi: CARICHI,
      vendite: [vendita(1, '2026-06-03', 400, 12.5), vendita(2, '2026-08-10', 600, 12.9)],
    });

    const sommaAttesa = registro.vendite.reduce((somma, v) => somma + v.pnlRealizzato, 0);
    expect(registro.pnlRealizzato).toBeCloseTo(sommaAttesa, 8);
    // Nessuna vendita: il realizzato è 0, misurato e non assente.
    expect(rigiocaRegistro({ carichi: CARICHI, vendite: [] }).pnlRealizzato).toBe(0);
  });

  // ─── US-044 — l'incasso complessivo ───────────────────────────────────────

  it('il ricavoTotale di registro è la somma dei ricavi di ciascuna vendita sullo stesso ISIN', () => {
    const registro = rigiocaRegistro({
      carichi: CARICHI,
      vendite: [vendita(1, '2026-06-03', 400, 12.5), vendita(2, '2026-08-10', 600, 12.9)],
    });

    const sommaAttesa = registro.vendite.reduce((somma, v) => somma + v.ricavo, 0);
    expect(registro.ricavoTotale).toBeCloseTo(sommaAttesa, 8);
    expect(registro.ricavoTotale).toBeCloseTo(400 * 12.5 + 600 * 12.9, 8);
  });

  it('nessuna vendita: il ricavoTotale è 0, misurato e non assente', () => {
    expect(rigiocaRegistro({ carichi: CARICHI, vendite: [] }).ricavoTotale).toBe(0);
  });
});

describe('quantitaDisponibileA', () => {
  const registro = rigiocaRegistro({ carichi: CARICHI, vendite: [] });

  it('include i lotti caricati **il giorno stesso** della data indicata', () => {
    // L'estremo incluso non è una comodità: un titolo comprato e rivenduto lo
    // stesso giorno è un'operazione ordinaria, e un `<` stretto la renderebbe
    // impossibile da iscrivere.
    expect(quantitaDisponibileA(registro, '2025-02-07')).toBe(1000);
    expect(quantitaDisponibileA(registro, '2025-02-06')).toBe(600);
  });

  it('esclude i lotti caricati dopo la data indicata', () => {
    expect(quantitaDisponibileA(registro, '2023-04-12')).toBe(600);
    expect(quantitaDisponibileA(registro, '2023-04-11')).toBe(0);
  });

  it('conta il residuo dei lotti, non la loro quantità nominale', () => {
    const dopoVendita = rigiocaRegistro({
      carichi: CARICHI,
      vendite: [vendita(1, '2026-06-03', 400)],
    });
    // Il carico n. 2 è esaurito: alla stessa data di prima ne restano 600.
    expect(quantitaDisponibileA(dopoVendita, '2026-06-03')).toBe(600);
  });
});

describe('verificaVendita', () => {
  const registro = { carichi: CARICHI, vendite: [] as VenditaLotto[] };

  it('accetta una vendita entro la quantità disponibile alla data', () => {
    const esito = verificaVendita({ ...registro, saleDate: '2026-06-03', quantita: 400 });
    expect(esito.esito).toBe('ok');
    expect(esito.disponibileAllaData).toBe(1000);
  });

  it('accetta una vendita pari all\'intera disponibilità', () => {
    expect(verificaVendita({ ...registro, saleDate: '2026-06-03', quantita: 1000 }).esito).toBe('ok');
  });

  it('rifiuta come quantità eccedente ciò che supera la giacenza complessiva', () => {
    const esito = verificaVendita({ ...registro, saleDate: '2026-06-03', quantita: 1200 });
    expect(esito.esito).toBe('quantita-eccedente');
    if (esito.esito !== 'quantita-eccedente') return;
    expect(esito.disponibileTotale).toBe(1000);
    // Il messaggio nomina la quantità disponibile: chi legge deve sapere a quale
    // cifra correggere, non solo che la sua è sbagliata. Le cifre sono nel
    // formato italiano che il client usa già in ogni cella — «1000» senza punto,
    // perché l'italiano non raggruppa sotto le cinque cifre — così il testo del
    // rifiuto non stona accanto alle quantità della stessa pagina.
    expect(esito.messaggio).toContain('1000');
    expect(esito.messaggio).toContain('1200');
  });

  it('rifiuta come anteriore al carico ciò che la giacenza coprirebbe ma non a quella data', () => {
    // 800 quote su 1.000 caricate: la giacenza complessiva basterebbe. Alla data
    // indicata però il carico n. 2 non era ancora avvenuto, e ne risultano 600.
    const esito = verificaVendita({ ...registro, saleDate: '2024-01-01', quantita: 800 });
    expect(esito.esito).toBe('anteriore-al-carico');
    if (esito.esito !== 'anteriore-al-carico') return;
    expect(esito.disponibileAllaData).toBe(600);
    expect(esito.disponibileTotale).toBe(1000);
    expect(esito.messaggio).toContain('600');
  });

  it('dà ai due rifiuti due messaggi distinti', () => {
    // È la ragione per cui gli esiti sono due valori e non un booleano: la
    // correzione è la quantità nel primo caso e la data nel secondo, e un
    // messaggio unico costringerebbe a indovinare quale premessa è saltata.
    const eccedente = verificaVendita({ ...registro, saleDate: '2026-06-03', quantita: 1200 });
    const anteriore = verificaVendita({ ...registro, saleDate: '2024-01-01', quantita: 800 });
    if (eccedente.esito === 'ok' || anteriore.esito === 'ok') throw new Error('attesi due rifiuti');
    expect(eccedente.messaggio).not.toBe(anteriore.messaggio);
    expect(anteriore.messaggio).toContain('data');
  });

  it('tiene conto delle vendite già iscritte', () => {
    // Dopo lo scarico di 400 quote la stessa richiesta che prima passava non
    // passa più: la verifica legge il residuo, non i carichi.
    const conVendita = { carichi: CARICHI, vendite: [vendita(1, '2026-06-03', 400)] };
    expect(verificaVendita({ ...conVendita, saleDate: '2026-08-10', quantita: 600 }).esito).toBe('ok');
    expect(verificaVendita({ ...conVendita, saleDate: '2026-08-10', quantita: 601 }).esito).toBe(
      'quantita-eccedente',
    );
  });

  it('rifiuta ogni vendita quando nessun lotto è ancora stato caricato a quella data', () => {
    const esito = verificaVendita({ ...registro, saleDate: '2020-01-01', quantita: 1 });
    expect(esito.esito).toBe('anteriore-al-carico');
    expect(esito.disponibileAllaData).toBe(0);
  });
});

describe('residuoPerIsin', () => {
  it('ricalcola il prezzo medio sui soli lotti non consumati', () => {
    const residuo = residuoPerIsin({
      carichi: CARICHI,
      vendite: [vendita(1, '2026-06-03', 400)],
    });

    expect(residuo.loadedQuantity).toBe(1000);
    expect(residuo.soldQuantity).toBe(400);
    expect(residuo.totalQuantity).toBe(600);
    // Consumato il carico n. 2, resta solo il n. 1: il medio scende da 10,4800 a
    // 9,8000. Con FIFO sarebbe salito a 11,5000 — la cifra è la firma del criterio.
    expect(residuo.avgLoadPrice).toBeCloseTo(9.8, 10);
    expect(residuo.totalLoadValue).toBeCloseTo(5880, 8);
  });

  it('dichiara assente il prezzo medio a residuo 0, e non lo scrive zero', () => {
    const residuo = residuoPerIsin({
      carichi: CARICHI,
      vendite: [vendita(1, '2026-06-03', 400), vendita(2, '2026-08-10', 600)],
    });

    expect(residuo.totalQuantity).toBe(0);
    // `null` e non `0`: «0,0000» affermerebbe di aver comprato a zero (ADR-003).
    expect(residuo.avgLoadPrice).toBeNull();
    // Lo zero del controvalore invece è **misurato**: zero quote costano zero, e
    // il titolo contribuisce zero al valore del portafoglio.
    expect(residuo.totalLoadValue).toBe(0);
    expect(residuo.loadedQuantity).toBe(1000);
    expect(residuo.soldQuantity).toBe(1000);
  });

  it('misura il valore attuale sulle quote residue e non su quelle caricate', () => {
    const residuo = residuoPerIsin({
      carichi: CARICHI,
      vendite: [vendita(1, '2026-06-03', 400)],
      currentPrice: 12.5,
    });

    expect(residuo.currentValue).toBeCloseTo(12.5 * 600, 8);
    expect(residuo.difference).toBeCloseTo(12.5 * 600 - 9.8 * 600, 8);
    expect(residuo.differencePercent).not.toBeNull();
  });

  it('a residuo 0 porta a zero il valore attuale e lascia indefinita la percentuale', () => {
    const residuo = residuoPerIsin({
      carichi: CARICHI,
      vendite: [vendita(1, '2026-06-03', 1000)],
      currentPrice: 12.5,
    });

    expect(residuo.currentValue).toBe(0);
    expect(residuo.difference).toBe(0);
    // Nessun `Infinity` da divisione per zero: la percentuale non è calcolabile
    // e viene dichiarata assente.
    expect(residuo.differencePercent).toBeNull();
  });

  it('lascia nulli i valori correnti quando il prezzo non è in archivio', () => {
    const residuo = residuoPerIsin({ carichi: CARICHI, vendite: [], currentPrice: null });
    expect(residuo.currentValue).toBeNull();
    expect(residuo.difference).toBeNull();
    expect(residuo.differencePercent).toBeNull();
    // L'assenza del prezzo corrente non cancella ciò che i carichi sanno.
    expect(residuo.avgLoadPrice).not.toBeNull();
    expect(residuo.totalQuantity).toBe(1000);
  });

  it('senza vendite restituisce cifra per cifra la media ponderata di prima', () => {
    // La regressione che US-042 non deve introdurre: il passaggio
    // dall'aggregazione SQL al dominio non deve muovere un centesimo su nessuna
    // posizione esistente. Il confronto è con `toBe` e non con `toBeCloseTo` —
    // `toBeCloseTo` è cieco esattamente allo scarto che qui si teme.
    const atteso = calcolaPnlDaCarico({
      loads: CARICHI.map((c) => ({ loadPrice: c.loadPrice, quantity: c.quantity })),
      currentPrice: 12.5,
    });
    const residuo = residuoPerIsin({ carichi: CARICHI, vendite: [], currentPrice: 12.5 });

    expect(residuo.totalQuantity).toBe(atteso.totalQuantity);
    expect(residuo.avgLoadPrice).toBe(atteso.avgLoadPrice);
    expect(residuo.totalLoadValue).toBe(atteso.totalLoadValue);
    expect(residuo.currentValue).toBe(atteso.currentValue);
    expect(residuo.difference).toBe(atteso.difference);
    expect(residuo.differencePercent).toBe(atteso.differencePercent);
  });

  it('espone il registro rigiocato per la resa lotto per lotto', () => {
    const residuo = residuoPerIsin({
      carichi: CARICHI,
      vendite: [vendita(1, '2026-06-03', 400)],
    });
    expect(residuo.registro.lotti.map((l) => [l.caricoId, l.quantitaResidua])).toEqual([
      [1, 600],
      [2, 0],
    ]);
  });

  // ─── US-043 — realizzato, latente e totale ────────────────────────────────

  it('congela il realizzato: due letture con lo stesso registro e prezzi diversi non lo muovono', () => {
    // Lo scenario dei mockup: 400 quote vendute a 12,50 sul carico n. 2.
    const carichi = CARICHI;
    const vendite = [vendita(1, '2026-06-03', 400, 12.5)];

    const primaLettura = residuoPerIsin({ carichi, vendite, currentPrice: 12.5 });
    const secondaLettura = residuoPerIsin({ carichi, vendite, currentPrice: 12.9 });

    // Il realizzato è identico al bit: non dipende dal prezzo corrente passato.
    expect(secondaLettura.realizedPnl).toBe(primaLettura.realizedPnl);
    expect(primaLettura.realizedPnl).toBeCloseTo(5000 - 4600, 8);
    // Il latente invece si muove con il nuovo prezzo, com'è giusto che sia.
    expect(secondaLettura.latentPnl).not.toBe(primaLettura.latentPnl);
  });

  it('a residuo 0 il latente è zero misurato, anche senza prezzo corrente in archivio', () => {
    const residuo = residuoPerIsin({
      carichi: CARICHI,
      vendite: [vendita(1, '2026-06-03', 400), vendita(2, '2026-08-10', 600)],
      currentPrice: null,
    });

    expect(residuo.totalQuantity).toBe(0);
    // `0`, non `null`: zero quote non hanno nulla in sospeso sul mercato.
    expect(residuo.latentPnl).toBe(0);
    // Il totale è quindi calcolabile — pari al solo realizzato — anche senza prezzo.
    expect(residuo.totalPnl).toBe(residuo.realizedPnl);
  });

  it('a residuo non nullo senza prezzo corrente il latente resta assente, non zero', () => {
    const residuo = residuoPerIsin({
      carichi: CARICHI,
      vendite: [vendita(1, '2026-06-03', 400)],
      currentPrice: null,
    });

    expect(residuo.totalQuantity).toBe(600);
    expect(residuo.latentPnl).toBeNull();
    expect(residuo.totalPnl).toBeNull();
  });

  it('il totale è la somma di realizzato e latente', () => {
    const residuo = residuoPerIsin({
      carichi: CARICHI,
      vendite: [vendita(1, '2026-06-03', 400, 12.5)],
      currentPrice: 12.5,
    });

    expect(residuo.totalPnl).toBeCloseTo(residuo.realizedPnl + (residuo.latentPnl ?? NaN), 8);
  });

  it('senza vendite il realizzato è 0 misurato e il totale coincide con il solo latente', () => {
    const residuo = residuoPerIsin({ carichi: CARICHI, vendite: [], currentPrice: 12.5 });

    expect(residuo.realizedPnl).toBe(0);
    expect(residuo.totalPnl).toBe(residuo.latentPnl);
  });
});

describe('residuoPerIsin — soldRevenue, l\'incasso complessivo (US-044)', () => {
  it('è 0 misurato, non assente, su un registro senza vendite', () => {
    const residuo = residuoPerIsin({ carichi: CARICHI, vendite: [], currentPrice: 12.5 });
    expect(residuo.soldRevenue).toBe(0);
  });

  it('è coerente con Σ(salePrice × quantity) su più lotti e vendite parziali', () => {
    // Due vendite parziali che insieme esauriscono il residuo: 400 quote a
    // 12,50 (consuma il carico n. 2) e 600 a 12,90 (consuma il resto del
    // carico n. 2 e tutto il carico n. 1) — lo stesso scenario già usato per
    // il realizzato di registro.
    const vendite = [vendita(1, '2026-06-03', 400, 12.5), vendita(2, '2026-08-10', 600, 12.9)];
    const residuo = residuoPerIsin({ carichi: CARICHI, vendite });

    const ricavoAtteso = vendite.reduce((somma, v) => somma + v.salePrice * v.quantity, 0);
    expect(residuo.soldRevenue).toBeCloseTo(ricavoAtteso, 8);
    expect(residuo.soldRevenue).toBe(residuo.registro.ricavoTotale);
  });

  it('è la somma dei ricavi anche con vendite su più iscrizioni dello stesso ISIN', () => {
    const residuo = residuoPerIsin({
      carichi: CARICHI,
      vendite: [vendita(1, '2026-06-03', 150, 12.0), vendita(2, '2026-07-01', 100, 13.0)],
    });

    expect(residuo.soldRevenue).toBeCloseTo(150 * 12.0 + 100 * 13.0, 8);
  });

  it('non muove i campi esistenti: realizedPnl, totalLoadCost e totalPnl restano invariati', () => {
    const vendite = [vendita(1, '2026-06-03', 400, 12.5), vendita(2, '2026-08-10', 600, 12.9)];
    const residuo = residuoPerIsin({ carichi: CARICHI, vendite, currentPrice: 12.9 });

    expect(residuo.realizedPnl).toBeCloseTo(400 * 12.5 + 600 * 12.9 - COSTO_CARICHI, 8);
    expect(residuo.totalLoadCost).toBeCloseTo(COSTO_CARICHI, 8);
    expect(residuo.totalPnl).toBe(residuo.realizedPnl);
  });
});

// ─── Quantità frazionarie (US-048) ────────────────────────────────────────────
// Carichi: 12,345 + 7,5 = 19,845 quote. Vendita parziale di 5,005 →
// residuo 14,84. Vendita totale di 14,84 → residuo esattamente 0.
describe('quantità frazionarie', () => {
  const CARICO_F1 = carico(10, '2024-01-15', 12.345, 10);
  const CARICO_F2 = carico(11, '2024-06-01', 7.5, 15);
  const CARICHI_F = [CARICO_F1, CARICO_F2];

  it('vendita parziale frazionaria: LIFO consuma dal lotto più recente', () => {
    const registro = rigiocaRegistro({
      carichi: CARICHI_F,
      vendite: [vendita(100, '2025-01-10', 5.005, 18)],
    });

    // LIFO: consuma 5,005 dal lotto n. 2 (7,5 quote) → residuo lotto 2 = 2,495
    const lotto2 = registro.lotti.find((l) => l.caricoId === 11)!;
    expect(lotto2.quantitaResidua).toBe(2.495);
    expect(lotto2.quantitaConsumata).toBe(5.005);

    // Lotto 1 intatto
    const lotto1 = registro.lotti.find((l) => l.caricoId === 10)!;
    expect(lotto1.quantitaResidua).toBe(12.345);
    expect(lotto1.quantitaConsumata).toBe(0);

    // Quantità residua totale: 12,345 + 2,495 = 14,84
    const totResiduo = registro.lotti.reduce((s, l) => s + l.quantitaResidua, 0);
    expect(totResiduo).toBe(14.84);
  });

  it('vendita totale frazionaria: residuo esattamente 0 (non ~1e-16)', () => {
    const registro = rigiocaRegistro({
      carichi: CARICHI_F,
      vendite: [
        vendita(100, '2025-01-10', 5.005, 18),
        vendita(101, '2025-02-15', 14.84, 20),
      ],
    });

    const totResiduo = registro.lotti.reduce((s, l) => s + l.quantitaResidua, 0);
    expect(totResiduo).toBe(0);
    expect(registro.scopertoTotale).toBe(0);
  });

  it('verificaVendita accetta vendita di quantità uguale alla giacenza frazionaria', () => {
    const registroInput = {
      carichi: CARICHI_F,
      vendite: [vendita(100, '2025-01-10', 5.005, 18)],
    };
    const esito = verificaVendita({ ...registroInput, saleDate: '2025-02-15', quantita: 14.84 });
    expect(esito.esito).toBe('ok');
  });

  it('verificaVendita rifiuta vendita di 14,841 su 14,84 disponibili', () => {
    const registroInput = {
      carichi: CARICHI_F,
      vendite: [vendita(100, '2025-01-10', 5.005, 18)],
    };
    const esito = verificaVendita({ ...registroInput, saleDate: '2025-02-15', quantita: 14.841 });
    expect(esito.esito).toBe('quantita-eccedente');
  });

  it('residuoPerIsin a residuo zero: totalQuantity === 0, avgLoadPrice null, latentPnl 0', () => {
    const residuo = residuoPerIsin({
      carichi: CARICHI_F,
      vendite: [
        vendita(100, '2025-01-10', 5.005, 18),
        vendita(101, '2025-02-15', 14.84, 20),
      ],
      currentPrice: 25,
    });

    expect(residuo.totalQuantity).toBe(0);
    expect(residuo.avgLoadPrice).toBeNull();
    expect(residuo.latentPnl).toBe(0);
  });
});

describe('residuoPerIsin — invariante del criterio 4: vendere a prezzo di mercato non crea né distrugge', () => {
  it('il totale prima e dopo una vendita al prezzo corrente esatto è identico al centesimo', () => {
    // Prima dello scarico: 1.000 quote, nessuna vendita, prezzo di mercato 12,50.
    const prima = residuoPerIsin({ carichi: CARICHI, vendite: [], currentPrice: 12.5 });
    expect(prima.realizedPnl).toBe(0);

    // Dopo lo scarico di 400 quote esattamente al prezzo di mercato: il
    // risultato si sposta dal latente al realizzato, ma il totale non cambia.
    const dopo = residuoPerIsin({
      carichi: CARICHI,
      vendite: [vendita(1, '2026-06-03', 400, 12.5)],
      currentPrice: 12.5,
    });

    expect(dopo.totalPnl).toBeCloseTo(prima.totalPnl ?? NaN, 8);
    // Il realizzato si è mosso da 0 a un valore positivo: qualcosa È cambiato,
    // solo non il totale.
    expect(dopo.realizedPnl).toBeGreaterThan(0);
    expect(dopo.latentPnl).toBeLessThan(prima.latentPnl ?? Infinity);
  });

  it('vale anche vendendo per intero al prezzo di mercato', () => {
    const prima = residuoPerIsin({ carichi: CARICHI, vendite: [], currentPrice: 12.9 });
    const dopo = residuoPerIsin({
      carichi: CARICHI,
      vendite: [vendita(1, '2026-06-03', 400, 12.9), vendita(2, '2026-08-10', 600, 12.9)],
      currentPrice: 12.9,
    });

    expect(dopo.totalPnl).toBeCloseTo(prima.totalPnl ?? NaN, 8);
    expect(dopo.latentPnl).toBe(0);
  });
});

describe('residuoPerIsin — invariante del criterio 5: la base della percentuale è il costo di tutti i carichi', () => {
  it.each([
    { nome: 'senza vendite', vendite: [] as VenditaLotto[] },
    { nome: 'vendita parziale su un solo lotto', vendite: [vendita(1, '2026-06-03', 400, 12.5)] },
    { nome: 'vendita che attraversa due lotti', vendite: [vendita(1, '2026-06-03', 700, 12.5)] },
    {
      nome: 'due vendite fino all\'azzeramento',
      vendite: [vendita(1, '2026-06-03', 400, 12.5), vendita(2, '2026-08-10', 600, 12.9)],
    },
  ])('totalLoadCost = costo attribuito + costo residuo = costo di tutti i carichi ($nome)', ({ vendite }) => {
    const residuo = residuoPerIsin({ carichi: CARICHI, vendite });

    expect(residuo.totalLoadCost).toBeCloseTo(COSTO_CARICHI, 8);
    expect(residuo.totalLoadCost).toBeCloseTo(
      residuo.registro.costoAttribuito + residuo.registro.costoResiduo,
      8,
    );
  });

  it('non cambia per il solo fatto di vendere: la stessa base regge prima e dopo', () => {
    const prima = residuoPerIsin({ carichi: CARICHI, vendite: [] });
    const dopo = residuoPerIsin({ carichi: CARICHI, vendite: [vendita(1, '2026-06-03', 400, 12.5)] });

    expect(dopo.totalLoadCost).toBeCloseTo(prima.totalLoadCost, 8);
  });
});
