import { Link } from 'react-router-dom';
import { dataCarico, quantita } from '../components/Foglio.js';
import { importo, prezzo } from '../domain/formattazione.js';
import CellaTitolo from '../components/CellaTitolo.js';
import ModuloScaricoQuadro from './ModuloScaricoQuadro.js';
import type { CaricoProps } from './CaricoMastro.js';

/**
 * La scheda «Carico titoli» nel design «Quadro strumenti» (US-054/TASK-06):
 * gemella di `CaricoMastro`, stesse `CaricoProps`, stessi `data-testid`.
 *
 * Nessun dato è ricalcolato qui: la vista riceve lo stato già fatto dagli hook
 * che `PortfolioDetailPage` possiede e decide soltanto come scriverlo in pagina.
 * I formattatori sono quelli già in uso (`importo`, `prezzo`, `quantita`,
 * `dataCarico`) — riscriverli sarebbe il primo posto in cui i due design
 * divergerebbero in silenzio.
 *
 * Riferimento visivo: `docs/mockups/US-054/index.html`.
 */
export default function CaricoQuadro({ id, carico, dati, modifica, dopoScaricoCompleto }: CaricoProps) {
  const {
    isin,
    setIsin,
    prefillName,
    loadDate,
    setLoadDate,
    loadPrice,
    setLoadPrice,
    quantity,
    setQuantity,
    submitError,
    submitSuccess,
    submitting,
    newPositionId,
    fieldErrors,
    handleCarico,
  } = carico;

  const {
    positions,
    ultimaVendita,
    summaries,
    positionsLoading,
    residuoPerLotto,
    nomePerIsin,
    titoliScaricabili,
    iscrizioni,
    residuoDopoVendita,
  } = dati;

  const {
    editingPositionId,
    editLoadDate,
    setEditLoadDate,
    editLoadPrice,
    setEditLoadPrice,
    editQuantity,
    setEditQuantity,
    editError,
    editSubmitting,
    positionDeleteError,
    deletingPositionId,
    startEdit,
    cancelEdit,
    handleEditSubmit,
    handleDeletePosition,
  } = modifica;

  const errori = [
    fieldErrors.isin,
    fieldErrors.loadDate,
    fieldErrors.loadPrice,
    fieldErrors.quantity,
  ].filter((e): e is string => Boolean(e));

  return (
    <>
      {/* ===== Esiti dell'operazione ===== */}
      {submitSuccess && (
        <div className="avviso sereno" role="status" data-testid="avviso-successo">
          <div className="dettagli">
            <span className="glifo" aria-hidden="true">&#x2713;</span>
            <div>
              <strong>Carico iscritto nel registro</strong>
              <p>{submitSuccess}</p>
            </div>
          </div>
        </div>
      )}

      {ultimaVendita && (
        <div className="avviso sereno" role="status" data-testid="scarico-successo">
          <div className="dettagli">
            <span className="glifo" aria-hidden="true">&#x2713;</span>
            <div>
              <strong>Scarico iscritto nel registro</strong>
              <p>
                Scarico di <b>{quantita(ultimaVendita.quantity)}</b> quote <b>{ultimaVendita.isin}</b>{' '}
                del <b>{dataCarico(ultimaVendita.saleDate)}</b> a{' '}
                <b>€ {prezzo(ultimaVendita.salePrice)}</b> iscritto nel registro. Nessun carico è
                stato modificato o cancellato.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Il sommario degli errori di forma dice **quante** voci sono da
          correggere; quale lo dicono gli errori inline, accanto al campo. */}
      {errori.length > 0 && (
        <div className="avviso critico" role="alert" data-testid="banner-errore">
          <div className="dettagli">
            <span className="glifo" aria-hidden="true">!</span>
            <div>
              <strong>
                Il modulo contiene {errori.length}{' '}
                {errori.length === 1 ? 'voce non valida' : 'voci non valide'}
              </strong>
              <ul className="elenco-errori">
                {errori.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {submitError && (
        <div className="avviso critico" role="alert" data-testid="submit-errore">
          <div className="dettagli">
            <span className="glifo" aria-hidden="true">!</span>
            <div>
              <strong>Iscrizione rifiutata</strong>
              <p>{submitError}</p>
            </div>
          </div>
        </div>
      )}

      {/* ===== Modulo di carico ===== */}
      <section className="pannello modulo-iscrizione" aria-label="Iscrizione di un nuovo carico">
        <span className="filo-verso" aria-hidden="true" />
        <div className="testa-pannello">
          <div>
            <h3>Iscrizione nuova posizione</h3>
            <span className="chiosa">
              il controvalore è calcolato come prezzo &times; quantità al salvataggio
            </span>
          </div>
          <div className="azioni-riga">
            <span className="pillola verso-carico">Carico</span>
            <span className="sigla-modulo">MOD/CPC-001 · rev. I</span>
          </div>
        </div>

        <div className="corpo-pannello">
          <form className="griglia-campi" id="form-carico-quadro" onSubmit={(e) => { void handleCarico(e); }} noValidate>
            {/* La denominazione arriva dalla ricerca titoli: non è disabilitata-e-
                basta, è *dichiarata* proveniente da altrove. */}
            {prefillName && (
              <div className="campo-modulo larghezza-piena sola-lettura">
                <label htmlFor="carico-nome-quadro">
                  Denominazione del titolo
                  <span className="sotto-etichetta">dalla ricerca titoli — sola lettura</span>
                </label>
                <div className="guscio-campo">
                  <span className="unita-campo" aria-hidden="true">DA RIC.</span>
                  <input
                    id="carico-nome-quadro"
                    data-testid="input-nome-titolo"
                    type="text"
                    value={prefillName}
                    readOnly
                    disabled
                  />
                </div>
              </div>
            )}

            <div className="campo-modulo larghezza-piena">
              <label htmlFor="carico-isin-quadro">
                ISIN
                <span className="sotto-etichetta">12 caratteri alfanumerici</span>
              </label>
              <div className={`guscio-campo${fieldErrors.isin ? ' con-errore' : ''}`}>
                <span className="unita-campo" aria-hidden="true">ISIN</span>
                <input
                  id="carico-isin-quadro"
                  data-testid="input-isin"
                  className="isin-campo"
                  type="text"
                  maxLength={12}
                  placeholder="es. IE00BJRHVJ28"
                  autoComplete="off"
                  spellCheck={false}
                  value={isin}
                  onChange={(e) => setIsin(e.target.value)}
                  disabled={submitting}
                  aria-invalid={fieldErrors.isin ? true : undefined}
                  aria-describedby={fieldErrors.isin ? 'err-isin-quadro' : undefined}
                />
              </div>
              {fieldErrors.isin && (
                <span className="errore-campo-quadro" id="err-isin-quadro" role="alert" data-testid="err-isin">
                  {fieldErrors.isin}
                </span>
              )}
            </div>

            <div className="campo-modulo">
              <label htmlFor="carico-data-quadro">
                Data di carico
                <span className="sotto-etichetta">giorno dell&rsquo;acquisto eseguito</span>
              </label>
              <div className={`guscio-campo${fieldErrors.loadDate ? ' con-errore' : ''}`}>
                <span className="unita-campo" aria-hidden="true">DATA</span>
                <input
                  id="carico-data-quadro"
                  data-testid="input-data"
                  type="date"
                  value={loadDate}
                  onChange={(e) => setLoadDate(e.target.value)}
                  disabled={submitting}
                  aria-invalid={fieldErrors.loadDate ? true : undefined}
                  aria-describedby={fieldErrors.loadDate ? 'err-data-quadro' : undefined}
                />
              </div>
              {fieldErrors.loadDate && (
                <span className="errore-campo-quadro" id="err-data-quadro" role="alert" data-testid="err-data">
                  {fieldErrors.loadDate}
                </span>
              )}
            </div>

            <div className="campo-modulo">
              <label htmlFor="carico-prezzo-quadro">
                Prezzo di acquisto
                <span className="sotto-etichetta">per singola quota, in euro</span>
              </label>
              <div className={`guscio-campo${fieldErrors.loadPrice ? ' con-errore' : ''}`}>
                <span className="unita-campo" aria-hidden="true">EUR</span>
                <input
                  id="carico-prezzo-quadro"
                  data-testid="input-prezzo"
                  className="cifra"
                  type="number"
                  min="0.0001"
                  step="0.0001"
                  placeholder="0,0000"
                  value={loadPrice}
                  onChange={(e) => setLoadPrice(e.target.value)}
                  disabled={submitting}
                  aria-invalid={fieldErrors.loadPrice ? true : undefined}
                  aria-describedby={fieldErrors.loadPrice ? 'err-prezzo-quadro' : undefined}
                />
              </div>
              {fieldErrors.loadPrice && (
                <span className="errore-campo-quadro" id="err-prezzo-quadro" role="alert" data-testid="err-prezzo">
                  {fieldErrors.loadPrice}
                </span>
              )}
            </div>

            {/* `type="text"` con `inputMode="decimal"` come nel mastro: un
                `type="number"` cambierebbe il trattamento della virgola secondo
                la localizzazione del browser, e US-047/US-048 dipendono da quel
                comportamento. */}
            <div className="campo-modulo">
              <label htmlFor="carico-quantita-quadro">
                Quantità
                <span className="sotto-etichetta">numero positivo, al più 6 decimali</span>
              </label>
              <div className={`guscio-campo${fieldErrors.quantity ? ' con-errore' : ''}`}>
                <span className="unita-campo" aria-hidden="true">QTÀ</span>
                <input
                  id="carico-quantita-quadro"
                  data-testid="input-quantita"
                  className="cifra"
                  type="text"
                  inputMode="decimal"
                  placeholder="es. 12,345"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  disabled={submitting}
                  aria-invalid={fieldErrors.quantity ? true : undefined}
                  aria-describedby={fieldErrors.quantity ? 'err-quantita-quadro' : undefined}
                />
              </div>
              {fieldErrors.quantity && (
                <span className="errore-campo-quadro" id="err-quantita-quadro" role="alert" data-testid="err-quantita">
                  {fieldErrors.quantity}
                </span>
              )}
            </div>
          </form>

          <p className="nota-modulo">
            Il controvalore di carico è calcolato come prodotto di <b>prezzo &times; quantità</b> e
            iscritto nel registro al momento del salvataggio. La quantità ammette frazioni fino al
            sesto decimale: un ETF si compra anche per mezza quota.
          </p>

          <div className="piede-modulo">
            <button
              type="submit"
              form="form-carico-quadro"
              className="bottone"
              data-testid="btn-iscrive"
              disabled={submitting}
            >
              {submitting ? 'Iscrizione…' : 'Iscrive nel registro'}
            </button>
            <Link to="/" className="bottone quieto">Annulla</Link>
          </div>
        </div>
      </section>

      {/* ===== Scarico titoli ===== */}
      <div className="et-sezione">
        <h2>Scarico titoli</h2>
        <span className="chiosa">
          la vendita è una nuova iscrizione, non la rettifica di un carico
        </span>
      </div>

      <ModuloScaricoQuadro
        portfolioId={id ?? ''}
        titoli={titoliScaricabili}
        onIscritta={dopoScaricoCompleto}
      />

      {/* ===== Il residuo dopo l'operazione ===== */}
      {residuoDopoVendita && (
        <>
          <div className="et-sezione">
            <h2>Il residuo dopo l&rsquo;operazione</h2>
            <span className="chiosa">
              ricalcolato sui soli lotti non consumati — il registro conserva tutte le iscrizioni
            </span>
          </div>

          <div className="griglia-residuo" data-testid="riquadro-residuo">
            <div
              className={`carta-residuo${residuoDopoVendita.dopo.totalQuantity === 0 ? ' chiuso' : ''}`}
            >
              <span className="et">Quantità residua</span>
              <span className="cifra-residuo" data-testid="residuo-quantita">
                {quantita(residuoDopoVendita.dopo.totalQuantity)}
              </span>
              <span className="prima-dopo">
                Σ carichi {quantita(residuoDopoVendita.dopo.loadedQuantity)} − Σ vendite{' '}
                {quantita(residuoDopoVendita.dopo.soldQuantity)}
              </span>
            </div>

            <div
              className={`carta-residuo${residuoDopoVendita.dopo.totalQuantity === 0 ? ' chiuso' : ''}`}
            >
              <span className="et">Prezzo medio del residuo</span>
              {residuoDopoVendita.dopo.avgLoadPrice !== null ? (
                <span className="cifra-residuo" data-testid="residuo-prezzo-medio">
                  <span className="valuta">EUR</span>
                  {prezzo(residuoDopoVendita.dopo.avgLoadPrice)}
                </span>
              ) : (
                <span className="cifra-residuo assente" data-testid="residuo-prezzo-medio">
                  —
                </span>
              )}
              <span className="prima-dopo">
                {residuoDopoVendita.prima.avgLoadPrice !== null ? (
                  <>
                    prima dell&apos;operazione <s>€ {prezzo(residuoDopoVendita.prima.avgLoadPrice)}</s>{' '}
                    — ricalcolato sui soli lotti non consumati
                  </>
                ) : (
                  <>ricalcolato sui soli lotti non consumati</>
                )}
              </span>
            </div>

            <div
              className={`carta-residuo${residuoDopoVendita.dopo.totalQuantity === 0 ? ' chiuso' : ''}`}
            >
              <span className="et">Controvalore di carico residuo</span>
              <span className="cifra-residuo" data-testid="residuo-controvalore">
                <span className="valuta">EUR</span>
                {importo(residuoDopoVendita.dopo.totalLoadValue)}
              </span>
              <span className="prima-dopo">
                {residuoDopoVendita.dopo.totalQuantity === 0
                  ? 'il titolo contribuisce 0 al valore attuale del portafoglio'
                  : 'nessun carico modificato: il registro conserva tutte le iscrizioni'}
              </span>
            </div>
          </div>
        </>
      )}

      {/* ===== Titoli iscritti a conto ===== */}
      <div className="et-sezione">
        <h2>Titoli iscritti a conto</h2>
        <span className="contatore-portafogli" data-testid="contatore-posizioni">
          {positionsLoading ? '…' : `${summaries.length} ISIN distint${summaries.length === 1 ? 'o' : 'i'}`}
        </span>
      </div>

      <section className="pannello" aria-label="Titoli iscritti a conto">
        {summaries.length === 0 ? (
          <div className="placeholder-quadro" data-testid="tabella-posizioni-vuota">
            <h3>Nessuna posizione iscritta</h3>
            <p>
              Compila il modulo qui sopra per registrare il primo titolo del portafoglio. Il registro
              nasce vuoto, e resta vuoto finché non c&rsquo;è un&rsquo;operazione da iscrivere.
            </p>
          </div>
        ) : (
          <div className="tabella-scroll">
            <table className="dati" data-testid="tabella-posizioni">
              <thead>
                <tr>
                  <th scope="col">Denominazione · ISIN</th>
                  <th scope="col" className="cifra">Quantità residua</th>
                  <th scope="col" className="cifra">Prezzo medio carico</th>
                  <th scope="col" className="cifra">Controvalore carico</th>
                </tr>
              </thead>
              <tbody>
                {summaries.map((summary) => (
                  <tr key={summary.isin} data-testid={`summary-${summary.isin}`}>
                    <td>
                      <CellaTitolo isin={summary.isin} nome={nomePerIsin.get(summary.isin) ?? null} />
                    </td>
                    <td className="cifra">{quantita(summary.totalQuantity)}</td>
                    <td className={summary.avgLoadPrice !== null ? 'cifra' : 'cifra assente'}>
                      {summary.avgLoadPrice !== null ? summary.avgLoadPrice.toFixed(4) : '—'}
                    </td>
                    <td className="cifra">{importo(summary.totalLoadValue)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>
                    <span className="et-totale">Totale controvalore di carico</span>
                  </td>
                  <td className="cifra">
                    {importo(summaries.reduce((sum, s) => sum + s.totalLoadValue, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {/* ===== Registro delle iscrizioni ===== */}
      <div className="et-sezione">
        <h2>Registro delle iscrizioni</h2>
        <span className="chiosa">
          carichi e scarichi in ordine di data · nessuna riga è mai riscritta
        </span>
      </div>

      {positionDeleteError && (
        <div className="avviso critico" role="alert" data-testid="position-delete-errore">
          <div className="dettagli">
            <span className="glifo" aria-hidden="true">!</span>
            <div>
              <strong>Rimozione rifiutata</strong>
              <p>{positionDeleteError}</p>
            </div>
          </div>
        </div>
      )}

      <section className="pannello" aria-label="Registro cronologico delle iscrizioni">
        {iscrizioni.length === 0 ? (
          <div className="placeholder-quadro" data-testid="tabella-registro-vuota">
            <h3>Nessuna iscrizione registrata</h3>
            <p>
              Il registro è il libro delle operazioni: ogni carico e ogni scarico vi entrano come una
              riga nuova, e nessuna riga esistente viene mai riscritta.
            </p>
          </div>
        ) : (
          <>
            <div className="tabella-scroll">
              <table className="dati" data-testid="tabella-registro-carichi">
                <thead>
                  <tr>
                    <th scope="col">Iscrizione</th>
                    <th scope="col">Denominazione · ISIN</th>
                    <th scope="col" className="cifra">Data</th>
                    <th scope="col" className="cifra">Prezzo</th>
                    <th scope="col" className="cifra">Quantità</th>
                    <th scope="col" className="cifra">Controvalore</th>
                    <th scope="col" className="cifra">Residuo del lotto</th>
                    <th scope="col">Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {iscrizioni.map((iscrizione) => {
                    if (iscrizione.specie === 'scarico') {
                      const { vendita } = iscrizione;
                      return (
                        <tr
                          key={`scarico-${vendita.id}`}
                          className={`riga-scarico${ultimaVendita?.id === vendita.id ? ' riga-nuova' : ''}`}
                          data-testid={`scarico-${vendita.id}`}
                        >
                          <td>
                            <span className="marca-iscrizione scarico">Scarico</span>
                          </td>
                          <td>
                            <CellaTitolo isin={vendita.isin} nome={nomePerIsin.get(vendita.isin) ?? null} />
                          </td>
                          <td className="cifra">{dataCarico(vendita.saleDate)}</td>
                          <td className="cifra">{prezzo(vendita.salePrice)}</td>
                          <td className="cifra">{quantita(vendita.quantity)}</td>
                          <td className="cifra">{importo(vendita.salePrice * vendita.quantity)}</td>
                          <td className="cifra assente">—</td>
                          <td />
                        </tr>
                      );
                    }

                    const pos = iscrizione.posizione;
                    const residuo = residuoPerLotto.get(pos.id) ?? pos.quantity;
                    const consumato = residuo < pos.quantity;
                    const perche = consumato
                      ? residuo === 0
                        ? 'consumato da una vendita: si rettifica solo un\'iscrizione errata'
                        : `consumato in parte (${quantita(pos.quantity - residuo)} quote su ${quantita(pos.quantity)}) da una vendita: si rettifica solo un'iscrizione errata`
                      : null;

                    return editingPositionId === pos.id ? (
                      <tr key={pos.id} className="in-rettifica" data-testid={`edit-riga-${pos.id}`}>
                        <td>
                          <span className="marca-iscrizione carico">Carico</span>
                        </td>
                        <td>
                          <CellaTitolo isin={pos.isin} nome={nomePerIsin.get(pos.isin) ?? null} />
                        </td>
                        <td>
                          <input
                            className="campo-inline"
                            type="date"
                            aria-label="Data di carico"
                            value={editLoadDate}
                            onChange={(e) => setEditLoadDate(e.target.value)}
                            data-testid="edit-input-data"
                            disabled={editSubmitting}
                          />
                        </td>
                        <td>
                          <input
                            className="campo-inline"
                            type="number"
                            min="0.0001"
                            step="0.0001"
                            aria-label="Prezzo di carico"
                            value={editLoadPrice}
                            onChange={(e) => setEditLoadPrice(e.target.value)}
                            data-testid="edit-input-prezzo"
                            disabled={editSubmitting}
                          />
                        </td>
                        <td>
                          <input
                            className="campo-inline"
                            type="text"
                            inputMode="decimal"
                            placeholder="es. 12,345"
                            aria-label="Quantità"
                            value={editQuantity}
                            onChange={(e) => setEditQuantity(e.target.value)}
                            data-testid="edit-input-quantita"
                            disabled={editSubmitting}
                          />
                        </td>
                        <td className="cifra assente">—</td>
                        <td className="cifra">{quantita(residuo)}</td>
                        <td>
                          <div className="azioni-riga">
                            <button
                              type="button"
                              className="bottone minuto"
                              data-testid={`btn-salva-modifica-${pos.id}`}
                              disabled={editSubmitting}
                              onClick={(e) => { void handleEditSubmit(e, pos.id); }}
                            >
                              {editSubmitting ? 'Salvataggio…' : 'Salva'}
                            </button>
                            <button
                              type="button"
                              className="bottone quieto minuto"
                              data-testid={`btn-annulla-modifica-${pos.id}`}
                              disabled={editSubmitting}
                              onClick={cancelEdit}
                            >
                              Annulla
                            </button>
                            {editError && (
                              <span
                                role="alert"
                                className="errore-campo-quadro"
                                data-testid={`edit-errore-${pos.id}`}
                              >
                                {editError}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr
                        key={pos.id}
                        className={`${pos.id === newPositionId ? 'riga-nuova' : ''}${residuo === 0 ? ' lotto-esaurito' : ''}`.trim()}
                        data-testid={`posizione-${pos.id}`}
                      >
                        <td>
                          <span className={residuo === 0 ? 'marca-iscrizione esaurito' : 'marca-iscrizione carico'}>
                            {residuo === 0 ? 'Carico · esaurito' : 'Carico'}
                          </span>
                        </td>
                        <td>
                          <CellaTitolo isin={pos.isin} nome={nomePerIsin.get(pos.isin) ?? null} />
                        </td>
                        <td className="cifra">{dataCarico(pos.loadDate)}</td>
                        <td className="cifra">{pos.loadPrice.toFixed(4)}</td>
                        <td className="cifra">{quantita(pos.quantity)}</td>
                        <td className="cifra">{importo(pos.loadPrice * pos.quantity)}</td>
                        <td className="cifra" data-testid={`residuo-lotto-${pos.id}`}>{quantita(residuo)}</td>
                        <td className="azioni-riga">
                          <button
                            type="button"
                            className={`bottone quieto minuto${consumato ? ' impedito' : ''}`}
                            data-testid={`btn-modifica-${pos.id}`}
                            disabled={consumato}
                            onClick={() => startEdit(pos)}
                          >
                            Modifica
                          </button>
                          <button
                            type="button"
                            className={`bottone carminio minuto${consumato ? ' impedito' : ''}`}
                            data-testid={`btn-rimuovi-${pos.id}`}
                            disabled={consumato || deletingPositionId === pos.id}
                            onClick={() => { void handleDeletePosition(pos.id); }}
                          >
                            {deletingPositionId === pos.id ? 'Rimozione…' : 'Rimuovi'}
                          </button>
                          {perche && (
                            <span className="perche-impedito" data-testid={`perche-impedito-${pos.id}`}>
                              {perche}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={5}>
                      <span className="et-totale">Controvalore di carico del residuo</span>
                    </td>
                    <td className="cifra" data-testid="registro-controvalore-residuo">
                      {importo(
                        positions.reduce(
                          (somma, p) => somma + p.loadPrice * (residuoPerLotto.get(p.id) ?? p.quantity),
                          0,
                        ),
                      )}
                    </td>
                    <td />
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>

            <p className="nota-tabella">
              Il <em>residuo del lotto</em> non è un dato inserito: è ciò che resta di quel carico dopo
              l&rsquo;attribuzione LIFO di tutte le vendite iscritte. Uno scarico non ha residuo proprio
              — consuma quello dei carichi — e la sua cella dichiara l&rsquo;assenza invece di mostrare
              uno zero.
            </p>
          </>
        )}
      </section>
    </>
  );
}
