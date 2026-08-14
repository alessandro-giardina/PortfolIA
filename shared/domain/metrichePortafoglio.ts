/**
 * La scomposizione della variazione del portafoglio nella finestra scelta
 * (US-015, FR-011, FR-012).
 *
 * Il problema che questo modulo risolve: la differenza fra il primo e
 * l'ultimo punto di una finestra di **portafoglio** non è mai tutta
 * performance. A differenza del titolo singolo (`metricheTitolo.ts`, che
 * misura un prezzo), qui dentro la finestra possono cadere carichi e vendite —
 * denaro che entra o esce dal conto — e dichiarare la differenza come
 * «variazione» senza scomporla scriverebbe a schermo un rendimento falso.
 * L'identità che rende impossibile lo scambio è
 *
 *     variazione del valore = capitale netto versato + movimento di mercato
 *
 * dove il movimento di mercato è definito **per costruzione** come il resto
 * (`variazione − versato`): non è una terza misura indipendente, è ciò che
 * resta della variazione una volta tolto il denaro versato.
 *
 * ## Il perimetro viene prima delle cifre
 *
 * Un ISIN entra nel perimetro della scomposizione quando ha un prezzo noto a
 * **ogni** punto della finestra in cui risulta detenuto — basta un solo punto
 * scoperto perché ne esca. E quando esce, esce da **entrambi i lati**
 * dell'identità insieme: il suo valore non entra nella somma (iniziale né
 * finale) e i suoi carichi/vendite non entrano nel capitale versato. Il
 * difetto che questo ordine previene: se il carico di un titolo escluso
 * contasse fra i versamenti mentre il suo valore restasse fuori dalla somma,
 * il movimento di mercato ne assorbirebbe l'intero importo con il segno
 * rovesciato — una perdita (o un guadagno) inventata, con l'identità
 * formalmente verde perché somma comunque zero.
 *
 * ## I due «non disponibile», e perché sono due
 *
 * - `punti-insufficienti`: la finestra ha meno di due punti. Per misurare un
 *   movimento servono due capi — uno da cui partire, uno a cui arrivare — e
 *   sotto quella soglia (la stessa di `calcolaVariazionePeriodo`,
 *   `RILEVAZIONI_MINIME_VARIAZIONE`, non riscritta qui) non si scrive nemmeno
 *   il capitale versato: sarebbe calcolabile anche con un punto solo, ma
 *   esposto accanto a due caselle vuote si leggerebbe come una variazione —
 *   esattamente lo scambio che questa spec esiste per impedire. Le tre cifre
 *   stanno o cadono insieme, perché sono un'identità sola.
 * - `perimetro-vuoto`: la finestra ha punti a sufficienza, ma nessun ISIN
 *   detenuto vi ha un prezzo noto per intero. Non è la stessa assenza della
 *   soglia — qui l'intervallo esiste, è il perimetro a non esistere — ed è la
 *   ragione per cui i due esiti portano una `ragione` distinta invece di
 *   un unico stato "non disponibile" indifferenziato.
 *
 * ## Il denominatore della percentuale
 *
 * La base del rapporto è il **capitale esposto nella finestra**: valore
 * iniziale più capitale netto versato, non il solo valore iniziale. Versare
 * denaro a metà periodo gonfierebbe altrimenti la percentuale senza che il
 * mercato abbia fatto nulla — lo stesso errore del numeratore, spostato al
 * denominatore. Non è un rendimento ponderato per il tempo: un carico rimasto
 * esposto un solo giorno della finestra pesa nella base come se ci fosse
 * stato fin dal primo, ed è per questo che la base va scritta con i suoi
 * addendi invece di lasciata indovinare (criterio 3).
 *
 * Funzione pura: nessuna rete, nessun archivio, nessun orologio. Riceve i
 * punti **già ritagliati** sulla finestra (`ritagliaSerie(...).punti`) e il
 * perimetro completo dei titoli (con i loro carichi e vendite, per i flussi di
 * cassa) — non ritaglia e non compone nulla lei stessa.
 */

import type { PuntoPortafoglio, TitoloPortafoglio } from './serieValorePortafoglio.js';
import { istanteDataCivile } from './serieTitolo.js';
import { RILEVAZIONI_MINIME_VARIAZIONE } from './metricheTitolo.js';

/** Ingresso di `calcolaScomposizioneFinestra`. */
export interface CalcolaScomposizioneFinestraInput {
  /**
   * I punti **già ritagliati** sulla finestra scelta — cioè
   * `ritagliaSerie(...).punti`, ordinati per istante crescente.
   *
   * **Contratto:** la funzione non ritaglia e non riordina. Passarle la serie
   * intera misurerebbe una finestra diversa da quella mostrata a schermo, e
   * nulla lo segnalerebbe.
   */
  punti: readonly PuntoPortafoglio[];
  /**
   * Il perimetro completo del portafoglio — lo stesso array che alimenta
   * `componiSerieValorePortafoglio` — con i carichi e le vendite di ciascun
   * titolo: sono la fonte dei flussi di cassa che compongono il capitale
   * netto versato. `punti` da solo non basterebbe: i contributi portano
   * quantità e valore, non i prezzi di carico/vendita dei singoli movimenti.
   */
  titoli: readonly TitoloPortafoglio[];
}

/** Un titolo nominato nel perimetro della scomposizione: solo ciò che serve a citarlo a schermo. */
export interface TitoloScomposizione {
  /** Codice ISIN normalizzato. */
  isin: string;
  /** Denominazione ufficiale del titolo; `null` se non disponibile. */
  name: string | null;
}

/**
 * Esito di `calcolaScomposizioneFinestra`: un'**unione discriminata**, perché
 * il tipo deve rendere impossibile leggere una cifra che non esiste.
 */
export type EsitoScomposizioneFinestra =
  | {
      stato: 'disponibile';
      /** Il **primo** punto della finestra. */
      prima: PuntoPortafoglio;
      /** L'**ultimo** punto della finestra. */
      ultima: PuntoPortafoglio;
      /** Valore complessivo a `prima`, sui soli ISIN del perimetro. */
      valoreIniziale: number;
      /** Valore complessivo a `ultima`, sui soli ISIN del perimetro. */
      valoreFinale: number;
      /** `valoreFinale − valoreIniziale`: quanto è cambiato il valore, senza scomporlo. */
      variazione: number;
      /**
       * Carichi meno vendite, valutati in cassa (`loadPrice × quantity`,
       * `salePrice × quantity`), caduti nell'intervallo **semiaperto**
       * `(prima.at, ultima.at]`. Un carico datato esattamente al primo capo
       * non entra: è già dentro `valoreIniziale`, e contarlo lo conterebbe
       * due volte. Uno datato all'ultimo capo entra.
       */
      capitaleNettoVersato: number;
      /** `variazione − capitaleNettoVersato`, per costruzione: mai una terza misura indipendente. */
      movimentoMercato: number;
      /** Il denominatore dichiarato della percentuale: `valoreIniziale + capitaleNettoVersato`. */
      baseRapporto: number;
      /**
       * `movimentoMercato / baseRapporto × 100`. `null` — mai `Infinity` — su
       * una base non positiva; uno zero misurato (nessun movimento) resta
       * `0` disponibile, non `null`.
       */
      percentuale: number | null;
      /** `'completo'` quando ogni titolo detenuto nella finestra è nel perimetro, `'parziale'` altrimenti. */
      perimetro: 'completo' | 'parziale';
      /** I titoli sul cui perimetro la scomposizione è calcolata. */
      titoliCompresi: readonly TitoloScomposizione[];
      /** I titoli detenuti nella finestra ma esclusi dal perimetro: nessun prezzo noto a ogni punto in cui erano detenuti. */
      titoliEsclusi: readonly TitoloScomposizione[];
      /** Quanti punti cadono nella finestra (i capi inclusi). */
      puntiCompresi: number;
    }
  | {
      stato: 'non-disponibile';
      /** Perché la scomposizione non è affermabile: due assenze distinte, non intercambiabili. */
      ragione: 'punti-insufficienti' | 'perimetro-vuoto';
      /** Quanti punti cadono nella finestra. */
      puntiCompresi: number;
    };

/**
 * La scomposizione della variazione del valore del portafoglio nella finestra
 * scelta: quanto è capitale netto versato (denaro entrato o uscito) e quanto è
 * movimento di mercato (la sola parte che misura un rendimento).
 *
 * Due passi, nell'ordine — e l'ordine è la parte che conta:
 *
 * 1. **Il perimetro.** Un ISIN vi appartiene quando ha un prezzo noto a ogni
 *    punto della finestra in cui risulta detenuto (letto dai contributi che
 *    `PuntoPortafoglio` già porta — nessuna nuova lettura d'archivio).
 * 2. **Le cifre**, tutte ristrette al perimetro: `valoreIniziale`/
 *    `valoreFinale` sommano i soli contributi degli ISIN compresi (mai
 *    `valoreTotale`, che somma *tutti* i titoli valorizzati, perimetro o no);
 *    `capitaleNettoVersato` somma i soli flussi di cassa degli stessi ISIN.
 *
 * La soglia dei punti minimi si applica **prima** del perimetro: sotto due
 * punti la domanda «qual è il perimetro» non si pone nemmeno, ed è la ragione
 * per cui i due controlli non si invertono.
 */
export function calcolaScomposizioneFinestra({
  punti,
  titoli,
}: CalcolaScomposizioneFinestraInput): EsitoScomposizioneFinestra {
  const puntiCompresi = punti.length;

  if (puntiCompresi < RILEVAZIONI_MINIME_VARIAZIONE) {
    return { stato: 'non-disponibile', ragione: 'punti-insufficienti', puntiCompresi };
  }

  // ─── Il perimetro ───────────────────────────────────────────────────────
  // Un ISIN è "considerato" se risulta detenuto (cioè compare fra i
  // contributi) ad almeno un punto della finestra; è "escluso" se a un
  // qualunque punto in cui è detenuto il suo valore è `null` — prezzo non
  // noto. Basta un solo punto scoperto perché ne esca.
  const nomeDi = new Map<string, string | null>();
  const isinEsclusi = new Set<string>();
  for (const punto of punti) {
    for (const contributo of punto.contributi) {
      if (!nomeDi.has(contributo.isin)) nomeDi.set(contributo.isin, contributo.name);
      if (contributo.valore === null) isinEsclusi.add(contributo.isin);
    }
  }

  const perimetroIsin = new Set<string>(
    [...nomeDi.keys()].filter((isin) => !isinEsclusi.has(isin)),
  );

  if (perimetroIsin.size === 0) {
    return { stato: 'non-disponibile', ragione: 'perimetro-vuoto', puntiCompresi };
  }

  // ─── Le cifre, ristrette al perimetro ───────────────────────────────────
  const prima = punti[0];
  const ultima = punti[puntiCompresi - 1];

  const sommaPerimetro = (punto: PuntoPortafoglio): number =>
    punto.contributi.reduce(
      (somma, contributo) =>
        perimetroIsin.has(contributo.isin) && contributo.valore !== null
          ? somma + contributo.valore
          : somma,
      0,
    );

  const valoreIniziale = sommaPerimetro(prima);
  const valoreFinale = sommaPerimetro(ultima);
  const variazione = valoreFinale - valoreIniziale;

  // I flussi di cassa: solo per gli ISIN del perimetro, solo nell'intervallo
  // semiaperto (prima.at, ultima.at]. Un carico/vendita di un titolo escluso
  // non entra qui — è la metà del difetto che l'esclusione previene: se
  // entrasse mentre il valore resta fuori dalla somma, il movimento di
  // mercato ne assorbirebbe l'importo con il segno rovesciato.
  let capitaleNettoVersato = 0;
  for (const titolo of titoli) {
    if (!perimetroIsin.has(titolo.isin)) continue;

    for (const carico of titolo.loads) {
      const istante = istanteDataCivile(carico.loadDate);
      if (
        !Number.isFinite(istante) ||
        !Number.isFinite(carico.quantity) ||
        !Number.isFinite(carico.loadPrice)
      ) {
        continue;
      }
      if (istante > prima.at && istante <= ultima.at) {
        capitaleNettoVersato += carico.loadPrice * carico.quantity;
      }
    }

    for (const vendita of titolo.sales) {
      const istante = istanteDataCivile(vendita.saleDate);
      if (
        !Number.isFinite(istante) ||
        !Number.isFinite(vendita.quantity) ||
        !Number.isFinite(vendita.salePrice)
      ) {
        continue;
      }
      if (istante > prima.at && istante <= ultima.at) {
        capitaleNettoVersato -= vendita.salePrice * vendita.quantity;
      }
    }
  }

  const movimentoMercato = variazione - capitaleNettoVersato;
  const baseRapporto = valoreIniziale + capitaleNettoVersato;
  const percentuale = baseRapporto > 0 ? (movimentoMercato / baseRapporto) * 100 : null;

  const titoliCompresi: TitoloScomposizione[] = [...perimetroIsin].map((isin) => ({
    isin,
    name: nomeDi.get(isin) ?? null,
  }));
  const titoliEsclusi: TitoloScomposizione[] = [...isinEsclusi].map((isin) => ({
    isin,
    name: nomeDi.get(isin) ?? null,
  }));

  return {
    stato: 'disponibile',
    prima,
    ultima,
    valoreIniziale,
    valoreFinale,
    variazione,
    capitaleNettoVersato,
    movimentoMercato,
    baseRapporto,
    percentuale,
    perimetro: isinEsclusi.size === 0 ? 'completo' : 'parziale',
    titoliCompresi,
    titoliEsclusi,
    puntiCompresi,
  };
}
