import FasciaLifo from '../components/FasciaLifo.js';
import { quantita } from '../components/Foglio.js';
import type { ModuloScaricoProps } from '../components/ModuloScarico.js';
import { ISO_DATE_RE, useFormScarico } from '../hooks/useFormScarico.js';

/**
 * Il modulo di scarico nel design «Quadro strumenti» (US-054/TASK-05): gemella
 * di `ModuloScarico` sul modello di `CreaPortafoglioQuadro`/`CreatePortfolioForm`.
 *
 * Le due rese condividono `useFormScarico` — un solo validatore, un solo `fetch`
 * — e differiscono in ciò che i due design dicono in modo diverso: le etichette,
 * la disposizione dei campi, dove sta l'unità di misura. Il *verso* è l'unica
 * cosa che deve essere impossibile confondere, ed è l'unica che il design
 * distingue: filo carminio in cima al pannello, pillola «Scarico» nella testa,
 * bottone `.carminio`.
 *
 * `FasciaLifo` è invece montata **invariata**: un diagramma non si biforca —
 * `quadro.css` la riveste nella sezione 15h. Stessa attribuzione LIFO del
 * mastro, perché è lo stesso componente sugli stessi dati.
 *
 * I `data-testid` sono quelli del mastro: le due rese non sono mai montate
 * insieme, quindi non c'è ambiguità e gli scenari di parità si scrivono senza
 * un secondo vocabolario.
 */
export default function ModuloScaricoQuadro({ portfolioId, titoli, onIscritta }: ModuloScaricoProps) {
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

  // Il ramo «senza giacenze» sta nella resa e non nell'hook: un `return` prima
  // di `useState` non è replicabile in un hook senza violare le regole di React.
  if (titoli.length === 0) {
    return (
      <p className="placeholder-quadro" data-testid="scarico-senza-giacenze">
        Nessun titolo ha quantità residua: non c&apos;è nulla da scaricare. Le vendite si registrano
        su una giacenza, e i carichi interamente venduti restano iscritti a registro.
      </p>
    );
  }

  return (
    <>
      {errore && (
        <div className="avviso critico" role="alert" data-testid="scarico-errore">
          <div className="dettagli">
            <span className="glifo" aria-hidden="true">!</span>
            <div>
              <strong>Scarico rifiutato dal registro</strong>
              <p>{errore}</p>
            </div>
          </div>
        </div>
      )}

      <section className="pannello modulo-iscrizione verso-scarico" aria-label="Registrazione di una vendita">
        <span className="filo-verso" aria-hidden="true" />
        <div className="testa-pannello">
          <div>
            <h3>Registrazione di uno scarico</h3>
            <span className="chiosa">
              l&rsquo;incasso non è trattenuto come liquidità: PortfolIA tiene i titoli, non la cassa
              (ADR-009)
            </span>
          </div>
          <div className="azioni-riga">
            <span className="pillola verso-scarico">Scarico</span>
            <span className="sigla-modulo">MOD/SCA-002 · rev. I</span>
          </div>
        </div>

        <div className="corpo-pannello">
          <form className="griglia-campi" id="form-scarico-quadro" onSubmit={(e) => { void iscrivi(e); }} noValidate>
            <div className="campo-modulo larghezza-piena">
              <label htmlFor="scarico-titolo-quadro">
                Titolo
                <span className="sotto-etichetta">
                  fra quelli con quantità residua — si vende ciò che si possiede
                </span>
              </label>
              <div className="guscio-campo con-select">
                <span className="unita-campo" aria-hidden="true">ISIN</span>
                <select
                  id="scarico-titolo-quadro"
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
              </div>
              <span className="giacenza-scelta" data-testid="scarico-giacenza">
                residuo <b>{quantita(scelto?.residuo ?? 0)}</b> quote
              </span>
            </div>

            <div className="campo-modulo">
              <label htmlFor="scarico-data-quadro">
                Data di vendita
                <span className="sotto-etichetta">giorno dell&rsquo;operazione eseguita</span>
              </label>
              <div className={`guscio-campo${erroriCampo.saleDate ? ' con-errore' : ''}`}>
                <span className="unita-campo" aria-hidden="true">DATA</span>
                <input
                  id="scarico-data-quadro"
                  data-testid="scarico-data"
                  type="date"
                  value={saleDate}
                  onChange={(e) => setSaleDate(e.target.value)}
                  disabled={inCorso}
                  aria-invalid={erroriCampo.saleDate ? true : undefined}
                  aria-describedby={erroriCampo.saleDate ? 'scarico-err-data-quadro' : undefined}
                />
              </div>
              {erroriCampo.saleDate && (
                <span
                  className="errore-campo-quadro"
                  id="scarico-err-data-quadro"
                  role="alert"
                  data-testid="scarico-err-data"
                >
                  {erroriCampo.saleDate}
                </span>
              )}
            </div>

            <div className="campo-modulo">
              <label htmlFor="scarico-prezzo-quadro">
                Prezzo di vendita
                <span className="sotto-etichetta">per singola quota, in euro</span>
              </label>
              <div className={`guscio-campo${erroriCampo.salePrice ? ' con-errore' : ''}`}>
                <span className="unita-campo" aria-hidden="true">EUR</span>
                <input
                  id="scarico-prezzo-quadro"
                  data-testid="scarico-prezzo"
                  className="cifra"
                  type="number"
                  min="0.0001"
                  step="0.0001"
                  placeholder="0,0000"
                  value={salePrice}
                  onChange={(e) => setSalePrice(e.target.value)}
                  disabled={inCorso}
                  aria-invalid={erroriCampo.salePrice ? true : undefined}
                  aria-describedby={erroriCampo.salePrice ? 'scarico-err-prezzo-quadro' : undefined}
                />
              </div>
              {erroriCampo.salePrice && (
                <span
                  className="errore-campo-quadro"
                  id="scarico-err-prezzo-quadro"
                  role="alert"
                  data-testid="scarico-err-prezzo"
                >
                  {erroriCampo.salePrice}
                </span>
              )}
            </div>

            {/*
              `type="text"` con `inputMode="decimal"` come nel mastro, non
              `type="number"`: quest'ultimo cambierebbe il trattamento della
              virgola secondo la localizzazione del browser, e US-048 dipende da
              quel comportamento.
            */}
            <div className="campo-modulo">
              <label htmlFor="scarico-quantita-quadro">
                Quantità venduta
                <span className="sotto-etichetta">numero positivo, al più 6 decimali</span>
              </label>
              <div className={`guscio-campo${erroriCampo.quantity ? ' con-errore' : ''}`}>
                <span className="unita-campo" aria-hidden="true">QTÀ</span>
                <input
                  id="scarico-quantita-quadro"
                  data-testid="scarico-quantita"
                  className="cifra"
                  type="text"
                  inputMode="decimal"
                  placeholder="es. 5,005"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  disabled={inCorso}
                  aria-invalid={erroriCampo.quantity ? true : undefined}
                  aria-describedby={erroriCampo.quantity ? 'scarico-err-quantita-quadro' : undefined}
                />
              </div>
              {erroriCampo.quantity && (
                <span
                  className="errore-campo-quadro"
                  id="scarico-err-quantita-quadro"
                  role="alert"
                  data-testid="scarico-err-quantita"
                >
                  {erroriCampo.quantity}
                </span>
              )}
            </div>
          </form>

          <p className="nota-modulo">
            La vendita è una <b>nuova iscrizione</b>: nessun carico viene modificato o cancellato.
            L&rsquo;incasso — prezzo &times; quantità — <b>non</b> è trattenuto come liquidità del
            portafoglio. L&rsquo;attribuzione dei lotti segue il criterio <b>LIFO</b>, dal carico più
            recente al più antico, e la fascia qui sotto la mostra <b>prima</b> dell&rsquo;invio, alla
            data scritta nel modulo.
          </p>

          <div className="piede-modulo">
            <button
              type="submit"
              form="form-scarico-quadro"
              className="bottone carminio"
              data-testid="btn-iscrive-scarico"
              disabled={inCorso}
            >
              {inCorso ? 'Iscrizione…' : 'Iscrive lo scarico'}
            </button>
            <span className="chiosa">la disponibilità alla data la giudica il registro, non il modulo</span>
          </div>
        </div>
      </section>

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
