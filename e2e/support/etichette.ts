/**
 * Misure delle etichette del modulo di carico (US-033).
 *
 * Perché un modulo a parte. La resa a due righe della sotto-etichetta si prova
 * solo misurandola in un browser reale, e la misura non è banale: il testo
 * dell'etichetta non ha un elemento proprio — è un nodo di testo anonimo che il
 * flex container promuove a item — quindi non ha un `getBoundingClientRect()`
 * da interrogare. Si misura con un `Range`. Quella tecnica serve sia allo
 * scenario demo sia alle varianti, e vive qui invece che duplicata nei due file.
 *
 * A differenza degli altri moduli di `support/`, questo non tocca dati: legge
 * geometria e stile risolto dal browser, e non ha nulla da ripristinare.
 */
import type { Page } from '@playwright/test';

/** Rettangolo serializzabile: `DOMRect` non attraversa il confine di `evaluate`. */
export interface Rettangolo {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
}

/** Misure di una riga del modulo: geometria delle due parti più stile risolto. */
export interface MisuraRiga {
  /** `id` dell'input associato alla label, letto da `label.control`. */
  campo: string;
  /** Testo dell'etichetta principale (il nodo anonimo). */
  etichetta: string;
  /** Testo della nota esplicativa. */
  nota: string;
  /** Rettangolo del nodo di testo dell'etichetta, misurato con un `Range`. */
  rettEtichetta: Rettangolo;
  /** Rettangolo dello `span.sotto-etichetta`. */
  rettNota: Rettangolo;
  /** Rettangolo della `label`, che è anche la cella della griglia. */
  rettCella: Rettangolo;
  stile: {
    textTransformNota: string;
    letterSpacingNota: string;
    corpoEtichetta: number;
    corpoNota: number;
    coloreEtichetta: string;
    coloreNota: string;
  };
}

/**
 * Misura tutte le righe del modulo di carico presenti nella pagina.
 *
 * Sono quattro quando `/portfolio/:id` è aperta direttamente e cinque quando si
 * arriva dal percorso di precompilazione (la riga «Nome titolo» è condizionata
 * a `prefill.name`).
 */
export function misuraRigheCarico(page: Page): Promise<MisuraRiga[]> {
  return page.evaluate(() => {
    const rett = (r: DOMRect) => ({
      top: r.top,
      bottom: r.bottom,
      left: r.left,
      right: r.right,
      width: r.width,
      height: r.height,
    });

    return Array.from(document.querySelectorAll('#form-carico .riga-modulo')).map((riga) => {
      const label = riga.querySelector('label')!;
      const nota = label.querySelector('.sotto-etichetta')!;

      // Il testo dell'etichetta è un nodo anonimo: senza elemento proprio, il
      // suo rettangolo si ottiene solo selezionandone il contenuto con un Range.
      const nodoTesto = Array.from(label.childNodes).find(
        (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== '',
      )!;
      const range = document.createRange();
      range.selectNodeContents(nodoTesto);

      const stileLabel = getComputedStyle(label);
      const stileNota = getComputedStyle(nota);

      return {
        campo: label.control?.id ?? '',
        etichetta: (nodoTesto.textContent ?? '').trim(),
        nota: (nota.textContent ?? '').trim(),
        rettEtichetta: rett(range.getBoundingClientRect()),
        rettNota: rett(nota.getBoundingClientRect()),
        rettCella: rett(label.getBoundingClientRect()),
        stile: {
          textTransformNota: stileNota.textTransform,
          letterSpacingNota: stileNota.letterSpacing,
          corpoEtichetta: parseFloat(stileLabel.fontSize),
          corpoNota: parseFloat(stileNota.fontSize),
          coloreEtichetta: stileLabel.color,
          coloreNota: stileNota.color,
        },
      };
    });
  });
}

/**
 * Misura un'etichetta a riga singola (senza nota) e la cella che la contiene.
 *
 * Serve alla non-regressione: `.riga-modulo label` è condivisa dai moduli «Crea
 * portafoglio» e «Rinomina conto», dove l'etichetta è una sola riga e deve
 * restare centrata verticalmente nella cella anche dopo il passaggio a
 * `flex-direction: column`.
 */
export function misuraEtichettaSingola(
  page: Page,
  selettore: string,
): Promise<{ rettEtichetta: Rettangolo; rettCella: Rettangolo }> {
  return page.evaluate((sel) => {
    const rett = (r: DOMRect) => ({
      top: r.top,
      bottom: r.bottom,
      left: r.left,
      right: r.right,
      width: r.width,
      height: r.height,
    });
    const label = document.querySelector<HTMLLabelElement>(sel)!;
    const nodoTesto = Array.from(label.childNodes).find(
      (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== '',
    )!;
    const range = document.createRange();
    range.selectNodeContents(nodoTesto);
    return {
      rettEtichetta: rett(range.getBoundingClientRect()),
      rettCella: rett(label.getBoundingClientRect()),
    };
  }, selettore);
}
