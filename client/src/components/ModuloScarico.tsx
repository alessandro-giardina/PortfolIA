import { useState } from 'react';
import type { CaricoLotto, CreateSaleRequest, Sale, VenditaLotto } from '@portfolia/shared';
import FasciaLifo from './FasciaLifo.js';

/**
 * Il **modulo di scarico**: la registrazione di una vendita (US-042, FR-022).
 *
 * È un modulo dello stesso registro del carico — stessa carta, stessa meccanica,
 * stessi bottoni — e cambia la sola testata, in carminio, perché il **verso**
 * dell'operazione è l'unica cosa che deve essere impossibile confondere
 * (`docs/mockups/US-042/index.html`).
 *
 * Vive in un componente proprio e non in righe aggiunte a `PortfolioDetailPage`
 * per la ragione più semplice: quella pagina è già oltre le milleduecento righe, e
 * il modulo porta con sé uno stato tutto suo — quattro campi, gli errori di
 * campo, il banner di rifiuto, la fascia dei lotti alla data scelta — che non ha
 * alcun rapporto con il resto della pagina.
 *
 * Il titolo si sceglie da un elenco e non si digita: si vende ciò che si possiede,
 * e un campo libero permetterebbe di iscrivere lo scarico di un ISIN mai caricato
 * — un rifiuto che si può evitare per costruzione invece di spiegare a posteriori.
 */
export interface TitoloScaricabile {
  /** Codice ISIN. */
  isin: string;
  /** Denominazione dalla cache anagrafica, `null` quando non disponibile. */
  name: string | null;
  /** Quantità residua: quante quote si possono vendere in tutto. */
  residuo: number;
  /** I carichi del titolo, per l'attribuzione mostrata dalla fascia. */
  carichi: CaricoLotto[];
  /** Le vendite già iscritte per lo stesso titolo. */
  vendite: VenditaLotto[];
}

export interface ModuloScaricoProps {
  /** Id del portafoglio su cui iscrivere la vendita. */
  portfolioId: string;
  /**
   * I titoli con quantità residua: i soli vendibili. Un elenco vuoto non è un
   * errore — è un portafoglio senza giacenze — e il modulo lo dichiara invece di
   * mostrare campi che non porterebbero a nulla.
   */
  titoli: readonly TitoloScaricabile[];
  /** Chiamato dopo un'iscrizione riuscita, perché la pagina rilegga il registro. */
  onIscritta: (vendita: Sale) => void;
}

/** RegExp formato data ISO-8601 YYYY-MM-DD, la stessa del modulo di carico. */
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default function ModuloScarico({ portfolioId, titoli, onIscritta }: ModuloScaricoProps) {
  const [isin, setIsin] = useState('');
  const [saleDate, setSaleDate] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [errore, setErrore] = useState<string | null>(null);
  const [erroriCampo, setErroriCampo] = useState<{ quantity?: string; saleDate?: string; salePrice?: string }>({});
  const [inCorso, setInCorso] = useState(false);

  // Il titolo scelto, oppure il primo dell'elenco quando nulla è ancora stato
  // scelto: la `select` mostra già quella voce, e leggere la giacenza di un altro
  // titolo accanto a essa sarebbe una cifra sbagliata al posto giusto.
  const scelto = titoli.find((t) => t.isin === isin) ?? titoli[0] ?? null;

  if (titoli.length === 0) {
    return (
      <p className="messaggio attesa" data-testid="scarico-senza-giacenze">
        Nessun titolo ha quantità residua: non c&apos;è nulla da scaricare. Le vendite si registrano
        su una giacenza, e i carichi interamente venduti restano iscritti a registro.
      </p>
    );
  }

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
    const quote = parseInt(quantity, 10);
    if (!quantity || Number.isNaN(quote) || quote <= 0 || String(quote) !== quantity.trim()) {
      errori.quantity = 'La quantità venduta deve essere un intero positivo.';
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
        quantity: parseInt(quantity, 10),
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

  return (
    <>
      {errore && (
        <div className="banner-errore" role="alert" data-testid="scarico-errore">
          <span className="timbro-ko">Rifiutato</span>
          <div>
            <p>{errore}</p>
          </div>
        </div>
      )}

      <div className="riquadro-modulo scarico">
        <div className="intestazione-modulo">
          <span>Modulo di scarico titolo</span>
          <span className="num-modulo">MOD/SCA-002 · rev. I</span>
        </div>
        <div className="corpo-modulo">
          <form id="form-scarico" onSubmit={(e) => void iscrivi(e)}>
            <div className="riga-modulo">
              <label htmlFor="scarico-titolo">
                Titolo
                <span className="sotto-etichetta">fra quelli con quantità residua</span>
              </label>
              <div className="campo">
                <select
                  id="scarico-titolo"
                  data-testid="scarico-titolo"
                  value={scelto?.isin ?? ''}
                  onChange={(e) => setIsin(e.target.value)}
                  disabled={inCorso}
                >
                  {titoli.map((t) => (
                    <option value={t.isin} key={t.isin}>
                      {t.name ? `${t.isin} — ${t.name}` : t.isin}
                    </option>
                  ))}
                </select>
                <span className="giacenza" data-testid="scarico-giacenza">
                  residuo <b>{scelto?.residuo ?? 0}</b> quote
                </span>
              </div>
            </div>

            <div className={`riga-modulo${erroriCampo.saleDate ? ' con-errore' : ''}`}>
              <label htmlFor="scarico-data">
                Data di vendita
                <span className="sotto-etichetta">giorno dell&apos;operazione eseguita</span>
              </label>
              <div className={`campo${erroriCampo.saleDate ? ' con-errore' : ''}`}>
                <input
                  id="scarico-data"
                  data-testid="scarico-data"
                  type="date"
                  value={saleDate}
                  onChange={(e) => setSaleDate(e.target.value)}
                  disabled={inCorso}
                />
                {erroriCampo.saleDate && (
                  <span className="errore-campo visibile" role="alert" data-testid="scarico-err-data">
                    {erroriCampo.saleDate}
                  </span>
                )}
              </div>
            </div>

            <div className={`riga-modulo${erroriCampo.salePrice ? ' con-errore' : ''}`}>
              <label htmlFor="scarico-prezzo">
                Prezzo di vendita
                <span className="sotto-etichetta">per singola quota, in euro</span>
              </label>
              <div className={`campo${erroriCampo.salePrice ? ' con-errore' : ''}`}>
                <span className="unita">EUR</span>
                <input
                  id="scarico-prezzo"
                  data-testid="scarico-prezzo"
                  type="number"
                  min="0.0001"
                  step="0.0001"
                  placeholder="0,0000"
                  value={salePrice}
                  onChange={(e) => setSalePrice(e.target.value)}
                  disabled={inCorso}
                />
                {erroriCampo.salePrice && (
                  <span className="errore-campo visibile" role="alert" data-testid="scarico-err-prezzo">
                    {erroriCampo.salePrice}
                  </span>
                )}
              </div>
            </div>

            <div className={`riga-modulo${erroriCampo.quantity ? ' con-errore' : ''}`}>
              <label htmlFor="scarico-quantita">
                Quantità venduta
                <span className="sotto-etichetta">numero intero di quote</span>
              </label>
              <div className={`campo${erroriCampo.quantity ? ' con-errore' : ''}`}>
                <span className="unita">QTÀ</span>
                <input
                  id="scarico-quantita"
                  data-testid="scarico-quantita"
                  type="number"
                  min="1"
                  step="1"
                  placeholder="0"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  disabled={inCorso}
                />
                {erroriCampo.quantity && (
                  <span className="errore-campo visibile" role="alert" data-testid="scarico-err-quantita">
                    {erroriCampo.quantity}
                  </span>
                )}
              </div>
            </div>
          </form>

          <p className="nota-contabile">
            L&apos;incasso dell&apos;operazione — prezzo &times; quantità — <b>non</b> è trattenuto come
            liquidità del portafoglio: PortfolIA tiene i titoli, non la cassa (ADR-009). La vendita è
            una <b>nuova iscrizione</b>: nessun carico viene modificato o cancellato.
          </p>

          <div className="bottoni">
            <button
              type="submit"
              form="form-scarico"
              className="bottone rosso"
              data-testid="btn-iscrive-scarico"
              disabled={inCorso}
            >
              {inCorso ? 'Iscrizione…' : 'Iscrive lo scarico'}
            </button>
          </div>
        </div>
      </div>

      {/*
        La fascia dei lotti del titolo scelto, alla data scritta nel modulo: mostra
        *prima* dell'invio quali lotti quella data rende attribuibili e quali no.
        È la stessa figura che spiega un rifiuto per vendita antedatata, e averla
        sotto il modulo la rende una spiegazione anticipata invece che postuma.
      */}
      {scelto && (
        <FasciaLifo
          isin={scelto.isin}
          carichi={scelto.carichi}
          vendite={scelto.vendite}
          data={ISO_DATE_RE.test(saleDate) ? saleDate : null}
        />
      )}
    </>
  );
}
