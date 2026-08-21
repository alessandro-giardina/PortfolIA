import type { CaricoLotto, Sale, VenditaLotto } from '@portfolia/shared';
import FasciaLifo from './FasciaLifo.js';
import { quantita } from './Foglio.js';
import { ISO_DATE_RE, useFormScarico } from '../hooks/useFormScarico.js';

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
 *
 * Da US-054 questa è la **resa mastro**: stato, validazione e `POST` vivono in
 * `useFormScarico`, e `ModuloScaricoQuadro` è la gemella che li rende nel design
 * «Quadro strumenti». Un solo validatore, un solo `fetch`, due rese.
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

export default function ModuloScarico({ portfolioId, titoli, onIscritta }: ModuloScaricoProps) {
  const {
    saleDate,
    setSaleDate,
    salePrice,
    setSalePrice,
    quantity,
    setQuantity,
    setIsin,
    errore,
    erroriCampo,
    inCorso,
    scelto,
    iscrivi,
  } = useFormScarico(portfolioId, titoli, onIscritta);

  if (titoli.length === 0) {
    return (
      <p className="messaggio attesa" data-testid="scarico-senza-giacenze">
        Nessun titolo ha quantità residua: non c&apos;è nulla da scaricare. Le vendite si registrano
        su una giacenza, e i carichi interamente venduti restano iscritti a registro.
      </p>
    );
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
                  residuo <b>{quantita(scelto?.residuo ?? 0)}</b> quote
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
                <span className="sotto-etichetta">numero positivo, al più 6 decimali</span>
              </label>
              <div className={`campo${erroriCampo.quantity ? ' con-errore' : ''}`}>
                <span className="unita">QTÀ</span>
                <input
                  id="scarico-quantita"
                  data-testid="scarico-quantita"
                  type="text"
                  inputMode="decimal"
                  placeholder="es. 5,005"
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
            liquidità del portafoglio: PortfolIA tiene i titoli, non la cassa. La vendita è
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
