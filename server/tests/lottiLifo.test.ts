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

/** Una vendita, nella forma ridotta che l'attribuzione legge. */
const vendita = (id: number, saleDate: string, quantity: number): VenditaLotto => ({
  id,
  saleDate,
  quantity,
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
});
