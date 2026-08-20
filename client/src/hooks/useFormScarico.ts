import { useState } from 'react';
import type { CreateSaleRequest, Sale } from '@portfolia/shared';
import type { TitoloScaricabile } from '../components/ModuloScarico.js';

/** RegExp formato data ISO-8601 YYYY-MM-DD, la stessa del modulo di carico. */
export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Lo **stato del modulo di scarico**: i quattro campi, la validazione di forma e
 * il `POST` che iscrive la vendita.
 *
 * È l'hook che US-049 ha saltato — quel giro ha estratto la logica delle tre
 * *pagine*, non quella di questo componente — ed è la premessa perché il design
 * quadro (US-054) possa avere la sua resa senza duplicare il validatore: un solo
 * validatore, un solo `fetch`, due rese (`ModuloScarico` e `ModuloScaricoQuadro`).
 *
 * Ciò che l'hook **non** fa: giudicare la disponibilità alla data. Quel giudizio
 * dipende dall'attribuzione LIFO di tutte le vendite già iscritte e resta del
 * server, che lo calcola sui dati veri nello stesso istante in cui iscrive.
 *
 * Nota sul ramo «senza giacenze»: `titoli.length === 0` non è un errore, è un
 * portafoglio senza quantità residua — e resta un fatto della *resa*, non
 * dell'hook. Un `return` prima di `useState` non è replicabile qui senza
 * violare le regole di React: l'hook si chiama sempre, sono le viste a decidere
 * se mostrare il modulo o il messaggio.
 */
export function useFormScarico(
  portfolioId: string,
  titoli: readonly TitoloScaricabile[],
  onIscritta: (vendita: Sale) => void,
) {
  const [isin, setIsin] = useState('');
  const [saleDate, setSaleDate] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [errore, setErrore] = useState<string | null>(null);
  const [erroriCampo, setErroriCampo] = useState<{
    quantity?: string;
    saleDate?: string;
    salePrice?: string;
  }>({});
  const [inCorso, setInCorso] = useState(false);

  // Il titolo scelto, oppure il primo dell'elenco quando nulla è ancora stato
  // scelto: la `select` mostra già quella voce, e leggere la giacenza di un altro
  // titolo accanto a essa sarebbe una cifra sbagliata al posto giusto.
  const scelto = titoli.find((t) => t.isin === isin) ?? titoli[0] ?? null;

  function ripulisci(): void {
    setSaleDate('');
    setSalePrice('');
    setQuantity('');
    setErroriCampo({});
  }

  /**
   * Validazione di **forma** lato client: data, prezzo, quantità.
   *
   * Non duplica la verifica del registro, e non deve: «quante quote sono
   * disponibili al 3 giugno» dipende dall'attribuzione LIFO di tutte le vendite
   * già iscritte, e la risposta autoritativa è quella del server — che la calcola
   * sui dati veri e nello stesso istante in cui iscrive. Anticiparla qui
   * significherebbe tenere due giudici della stessa questione, con il client che
   * legge un registro potenzialmente più vecchio di qualche secondo.
   */
  function validaForma(): boolean {
    const errori: typeof erroriCampo = {};
    if (!saleDate || !ISO_DATE_RE.test(saleDate)) {
      errori.saleDate = 'La data di vendita è obbligatoria.';
    }
    const prezzo = parseFloat(salePrice);
    if (!salePrice || Number.isNaN(prezzo) || prezzo <= 0) {
      errori.salePrice = 'Il prezzo di vendita deve essere un valore positivo.';
    }
    const normalizzata = quantity.trim().replace(',', '.');
    const quote = parseFloat(normalizzata);
    if (!quantity || Number.isNaN(quote) || quote <= 0 || Math.round(quote * 1e6) / 1e6 !== quote) {
      errori.quantity = 'La quantità venduta deve essere un numero positivo con al più 6 decimali.';
    }
    setErroriCampo(errori);
    return Object.keys(errori).length === 0;
  }

  async function iscrivi(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setErrore(null);
    if (!scelto || !validaForma()) return;

    setInCorso(true);
    try {
      const payload: CreateSaleRequest = {
        isin: scelto.isin,
        sale_date: saleDate,
        sale_price: parseFloat(salePrice),
        quantity: parseFloat(quantity.replace(',', '.')),
      };
      const res = await fetch(`/api/portfolios/${portfolioId}/sales`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const dati = (await res.json()) as { error?: string };
        // Il messaggio del server è mostrato **così com'è**: è lui a distinguere
        // la quantità eccedente dalla vendita antedatata (criteri 4 e 5), e
        // riassumerlo qui in un «operazione non consentita» butterebbe via
        // proprio l'informazione che dice quale premessa è saltata.
        setErrore(dati.error ?? 'Errore durante la registrazione della vendita.');
        return;
      }
      const vendita = (await res.json()) as Sale;
      ripulisci();
      onIscritta(vendita);
    } catch {
      setErrore('Backend non raggiungibile.');
    } finally {
      setInCorso(false);
    }
  }

  return {
    isin,
    setIsin,
    saleDate,
    setSaleDate,
    salePrice,
    setSalePrice,
    quantity,
    setQuantity,
    errore,
    erroriCampo,
    inCorso,
    scelto,
    validaForma,
    iscrivi,
    ripulisci,
  };
}

/** Il contratto che le due rese del modulo di scarico condividono. */
export type ScaricoProps = ReturnType<typeof useFormScarico>;
