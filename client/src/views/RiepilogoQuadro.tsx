import { Link } from 'react-router-dom';
import type { EnrichedPositionSummary } from '@portfolia/shared';
import { dataCarico, quantita } from '../components/Foglio.js';
import QuadroRisultato from '../components/QuadroRisultato.js';
import GraficoPortafoglio from '../components/GraficoPortafoglio.js';
import MetrichePortafoglio from '../components/MetrichePortafoglio.js';
import CellaTitolo from '../components/CellaTitolo.js';
import AggiornaObsoleti from '../components/AggiornaObsoleti.js';
import Composizione from '../components/Composizione.js';
import { dataCivile, importo, percentualeConSegno } from '../domain/formattazione.js';
import type { RiepilogoProps } from './RiepilogoMastro.js';

/**
 * Formatta il momento dell'ultimo rilevamento del prezzo (unix, secondi) come
 * `gg/mm/aaaa hh:mm` — identica a `RiepilogoMastro`: è una lettura diversa
 * degli stessi dati, non una seconda convenzione di data (US-051/TASK-05).
 */
function dataRilevamento(fetchedAt: number): string {
  const d = new Date(fetchedAt * 1000);
  const gg = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${gg}/${mm}/${d.getFullYear()} ${hh}:${min}`;
}

/**
 * Il controvalore di carico del residuo di una posizione:
 * `avgLoadPrice × totalQuantity`, `0` a residuo 0 — la stessa formula di
 * `residuoPerIsin` (`shared/domain/lottiLifo.ts`, campo `totalLoadValue` di
 * `PositionSummary`). `EnrichedPositionSummary` non porta quel campo (solo la
 * vista aggregata `PositionSummary` lo espone), quindi qui si ricostruisce con
 * la stessa aritmetica invece di inventarne una seconda.
 */
function controvaloreCarico(ep: EnrichedPositionSummary): number {
  return ep.avgLoadPrice !== null ? ep.avgLoadPrice * ep.totalQuantity : 0;
}

/** La classe di colore quadro per una cifra con segno: nessun terzo colore per lo zero. */
function segnoClasse(valore: number): string {
  return valore > 0 ? 'positivo' : valore < 0 ? 'negativo' : '';
}

/** Classe e testo della pillola di stato nella colonna «Ultimo rilevamento». */
function statoRilevamento(
  ep: EnrichedPositionSummary,
  inLavorazione: boolean,
): { classe: string; testo: string } {
  if (inLavorazione) return { classe: 'obsoleta', testo: 'in aggiornamento' };
  switch (ep.freshness) {
    case 'current':
      return { classe: 'viva', testo: 'allineato' };
    case 'stale':
      return { classe: 'obsoleta', testo: 'da aggiornare' };
    case 'never-fetched':
      return { classe: 'mai', testo: 'mai rilevato' };
  }
}

/**
 * Scheda "Riepilogo" del conto per il design Quadro strumenti (US-051/TASK-05):
 * stessi dati e stessa aritmetica di `RiepilogoMastro` (`RiepilogoProps`,
 * condivise), sola resa diversa — carte KPI, pannelli, tabella `table.dati`.
 * Nessun ricalcolo: ogni cifra qui è la stessa cifra che il mastro mostra,
 * letta dalle stesse props.
 */
export default function RiepilogoQuadro({
  portfolioName,
  portfolioCreatedAt,
  enrichedPositions,
  enrichedLoading,
  posizioniAperte,
  posizioniChiuse,
  ultimaVenditaPerIsin,
  series,
  seriesLoading,
  isinInLavorazione,
  setIsinInLavorazione,
  id,
  ricalcolaSilenzioso,
  apriSchedaTitolo,
  renameValue,
  setRenameValue,
  renameError,
  renaming,
  handleRename,
  deleteError,
  deleting,
  handleDelete,
}: RiepilogoProps) {
  // ─── Le cinque carte KPI ────────────────────────────────────────────────
  const positionsWithPrice = posizioniAperte.filter((ep) => ep.currentValue !== null);
  const totalCurrentValue = positionsWithPrice.reduce((s, ep) => s + (ep.currentValue ?? 0), 0);
  const missingPriceCount = posizioniAperte.length - positionsWithPrice.length;
  const nessunaPosizioneAperta = posizioniAperte.length === 0;
  const nessunPrezzoPosizioniAperte = !nessunaPosizioneAperta && positionsWithPrice.length === 0;

  // «Capitale investito»: il costo di carico del residuo, su TUTTE le
  // posizioni aperte — non dipende dal prezzo corrente, quindi è sempre
  // interamente calcolabile (a differenza del valore attuale).
  const capitaleInvestitoTotale = posizioniAperte.reduce((s, ep) => s + controvaloreCarico(ep), 0);

  // «Differenza»: solo sulle posizioni con prezzo (stesso rigore del mastro:
  // una posizione senza prezzo non contribuisce, e non viene stimata a zero).
  const capitaleInvestitoValorizzato = positionsWithPrice.reduce((s, ep) => s + controvaloreCarico(ep), 0);
  const differenzaValorizzata = positionsWithPrice.reduce((s, ep) => s + (ep.difference ?? 0), 0);
  const differenzaCifra = nessunaPosizioneAperta ? 0 : nessunPrezzoPosizioniAperte ? null : differenzaValorizzata;
  const percentualeDifferenza =
    differenzaCifra !== null && capitaleInvestitoValorizzato !== 0
      ? (differenzaCifra / capitaleInvestitoValorizzato) * 100
      : null;

  const daAggiornareCount = posizioniAperte.filter((ep) => ep.freshness === 'stale').length;
  const senzaPrezzoCount = missingPriceCount;

  return (
    <>
      {enrichedLoading ? (
        <p className="chiosa">Caricamento titoli…</p>
      ) : enrichedPositions.length === 0 ? (
        <section className="pannello" data-testid="riepilogo-vuoto">
          <div className="placeholder-quadro">
            <h3>Nessun titolo iscritto</h3>
            <p>
              Nessun titolo è stato ancora iscritto in questo portafoglio. Vai alla scheda{' '}
              <em>Carico titoli</em> per registrare il primo carico.
            </p>
          </div>
        </section>
      ) : (
      <>
      <div className="titolo-pagina">
        <div>
          <h1>{portfolioName}</h1>
          <p className="sottotitolo">
            {posizioniAperte.length} {posizioniAperte.length === 1 ? 'posizione' : 'posizioni'} · aperto il{' '}
            {dataCivile(portfolioCreatedAt)}
          </p>
        </div>
      </div>

      <section className="griglia-kpi" aria-label="Sintesi del portafoglio">
        <article
          className={`carta-kpi${!nessunaPosizioneAperta && positionsWithPrice.length > 0 ? ' segnata-accento' : ''}`}
          data-testid="kpi-valore-attuale"
        >
          <span className="et">Valore attuale</span>
          <span
            className={`cifra grande${nessunaPosizioneAperta ? '' : positionsWithPrice.length === 0 ? ' assente' : ' accento'}`}
            data-testid="valore-totale-portafoglio"
          >
            <span className="valuta">EUR</span>
            {nessunaPosizioneAperta ? '0,00' : positionsWithPrice.length === 0 ? '–' : importo(totalCurrentValue)}
          </span>
          <span className="piede">
            {nessunaPosizioneAperta ? (
              'nessuna posizione posseduta'
            ) : (
              <>
                <b>
                  {positionsWithPrice.length} di {posizioniAperte.length}
                </b>{' '}
                {posizioniAperte.length === 1 ? 'posizione valorizzata' : 'posizioni valorizzate'}
              </>
            )}
          </span>
        </article>

        <article className="carta-kpi" data-testid="kpi-capitale-investito">
          <span className="et">Capitale investito</span>
          <span className="cifra">
            <span className="valuta">EUR</span>
            {importo(capitaleInvestitoTotale)}
          </span>
          <span className="piede">
            su <b>{posizioniAperte.length}</b> {posizioniAperte.length === 1 ? 'posizione aperta' : 'posizioni aperte'}
          </span>
        </article>

        <article
          className={`carta-kpi${differenzaCifra !== null && differenzaCifra !== 0 ? ` segnata-${differenzaCifra > 0 ? 'guadagno' : 'perdita'}` : ''}`}
          data-testid="kpi-differenza"
        >
          <span className="et">Differenza</span>
          <span className={`cifra ${differenzaCifra === null ? 'assente' : segnoClasse(differenzaCifra)}`}>
            <span className="valuta">EUR</span>
            {differenzaCifra === null
              ? '–'
              : `${differenzaCifra >= 0 ? '+' : ''}${importo(differenzaCifra)}`}
          </span>
          <span className="piede">
            {percentualeDifferenza !== null ? (
              <>
                <b className={segnoClasse(percentualeDifferenza)}>{percentualeConSegno(percentualeDifferenza)}</b>{' '}
                sulle sole posizioni valorizzate
              </>
            ) : nessunaPosizioneAperta ? (
              'nessuna posizione aperta'
            ) : (
              'percentuale non calcolabile: nessun prezzo disponibile'
            )}
          </span>
        </article>

        <article className="carta-kpi segnata-ambra" data-testid="kpi-da-aggiornare">
          <span className="et">Da aggiornare</span>
          <span className="cifra ambrato">{daAggiornareCount}</span>
          <span className="piede">rilevamenti più vecchi dell&rsquo;ultima seduta</span>
        </article>

        <article className="carta-kpi" data-testid="kpi-senza-prezzo">
          <span className="et">Senza prezzo</span>
          <span className="cifra assente">{senzaPrezzoCount}</span>
          <span className="piede">esclus{senzaPrezzoCount === 1 ? 'a' : 'e'} dal totale — nessun valore stimato</span>
        </article>
      </section>

      <QuadroRisultato enrichedPositions={enrichedPositions} />

      {id && (
        <AggiornaObsoleti
          portfolioId={id}
          posizioniAperte={posizioniAperte}
          onRicalcola={ricalcolaSilenzioso}
          onTitoloInCorso={setIsinInLavorazione}
        />
      )}

      {nessunaPosizioneAperta ? (
        <section className="pannello" data-testid="riepilogo-tutte-chiuse">
          <div className="placeholder-quadro">
            <h3>Nessun titolo è oggi posseduto</h3>
            <p>
              Ogni titolo mai iscritto in questo portafoglio è stato venduto per intero. Il suo esito
              resta consultabile qui sotto, in <em>Posizioni chiuse</em>.
            </p>
          </div>
        </section>
      ) : (
        <section className="pannello">
          <div className="testa-pannello">
            <div>
              <h3>Titoli iscritti a conto</h3>
              <span className="chiosa">valore attuale e differenza rispetto al carico</span>
            </div>
            <span className="pillola">
              {posizioniAperte.length} {posizioniAperte.length === 1 ? 'ISIN' : 'ISIN distinti'}
            </span>
          </div>

          <div className="tabella-scroll">
            <table className="dati" data-testid="tabella-riepilogo" aria-label="Tabella titoli del portafoglio">
              <thead>
                <tr>
                  <th scope="col">Denominazione · ISIN</th>
                  <th scope="col" style={{ textAlign: 'right' }}>Quantità</th>
                  <th scope="col" style={{ textAlign: 'right' }}>Pr. medio carico</th>
                  <th scope="col" style={{ textAlign: 'right' }}>Prezzo attuale</th>
                  <th scope="col" style={{ textAlign: 'right' }}>Ultimo rilevamento</th>
                  <th scope="col" style={{ textAlign: 'right' }}>Valore attuale</th>
                  <th scope="col" style={{ textAlign: 'right' }}>Differenza</th>
                  <th scope="col" aria-label="Apri la scheda"></th>
                </tr>
              </thead>
              <tbody>
                {posizioniAperte.map((ep) => {
                  const stato = statoRilevamento(ep, isinInLavorazione === ep.isin);
                  return (
                    <tr
                      key={ep.isin}
                      className="cliccabile"
                      data-testid={`riepilogo-${ep.isin}`}
                      role="button"
                      tabIndex={0}
                      aria-label={`Apri la scheda del titolo ${ep.name ?? ep.isin}`}
                      onClick={() => apriSchedaTitolo(ep.isin)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          apriSchedaTitolo(ep.isin);
                        }
                      }}
                    >
                      <td>
                        <CellaTitolo isin={ep.isin} nome={ep.name}>
                          {ep.soldQuantity > 0 && (
                            <span className="pillola" data-testid={`badge-riaperta-${ep.isin}`}>
                              &#8635; riaperta
                            </span>
                          )}
                        </CellaTitolo>
                      </td>
                      <td className="cifra">{quantita(ep.totalQuantity)}</td>
                      <td className={ep.avgLoadPrice !== null ? 'cifra' : 'cifra assente'}>
                        {ep.avgLoadPrice !== null ? ep.avgLoadPrice.toFixed(4) : '–'}
                      </td>
                      <td
                        className={ep.currentPrice !== null ? 'cifra' : 'cifra assente'}
                        data-testid={`prezzo-attuale-${ep.isin}`}
                      >
                        {ep.currentPrice !== null ? ep.currentPrice.toFixed(4) : '–'}
                      </td>
                      <td>
                        <span className="cella-rilevamento">
                          <span
                            className={ep.currentPrice !== null && ep.fetchedAt !== null ? 'istante' : 'istante debole'}
                            data-testid={`rilevamento-${ep.isin}`}
                          >
                            {ep.currentPrice !== null && ep.fetchedAt !== null ? dataRilevamento(ep.fetchedAt) : '–'}
                          </span>
                          <span className={`pillola ${stato.classe}`} data-testid={`marca-rilevamento-${ep.isin}`}>
                            {stato.testo}
                          </span>
                        </span>
                      </td>
                      <td className={`cifra${ep.currentValue !== null ? ' forte' : ' assente'}`}>
                        {ep.currentValue !== null ? importo(ep.currentValue) : '–'}
                      </td>
                      <td
                        className={`cifra forte${ep.difference === null ? ' assente' : ` ${segnoClasse(ep.difference)}`}`}
                        data-testid={`diff-${ep.isin}`}
                      >
                        {ep.difference !== null ? `${ep.difference >= 0 ? '+' : ''}${importo(ep.difference)}` : '–'}
                      </td>
                      <td className="freccia-riga" aria-hidden="true">›</td>
                    </tr>
                  );
                })}
              </tbody>
              {(() => {
                const enrichedWithPrice = posizioniAperte.filter((ep) => ep.currentValue !== null);
                if (enrichedWithPrice.length === 0) return null;
                const totalCurrentValueFooter = enrichedWithPrice.reduce((s, ep) => s + (ep.currentValue ?? 0), 0);
                const totalDiff = enrichedWithPrice.reduce((s, ep) => s + (ep.difference ?? 0), 0);
                return (
                  <tfoot>
                    <tr>
                      <td colSpan={5}>
                        <span className="et-totale">
                          Totale portafoglio — {enrichedWithPrice.length}{' '}
                          {enrichedWithPrice.length === 1 ? 'posizione valorizzata' : 'posizioni valorizzate'}
                          {enrichedWithPrice.length < posizioniAperte.length ? ` di ${posizioniAperte.length}` : ''}
                        </span>
                      </td>
                      <td className="cifra forte">{importo(totalCurrentValueFooter)}</td>
                      <td className={`cifra forte ${segnoClasse(totalDiff)}`}>
                        {`${totalDiff >= 0 ? '+' : ''}${importo(totalDiff)}`}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                );
              })()}
            </table>
          </div>

          <p className="nota-tabella">
            Un «–» significa che il prezzo corrente non è in archivio: la differenza non viene calcolata e
            la posizione resta fuori dal totale. Seleziona una riga per aprirne la <em>scheda titolo</em>.
          </p>
        </section>
      )}

      <section className="pannello">
        <div className="testa-pannello">
          <div>
            <h3>Composizione</h3>
            <span className="chiosa">valore attuale per posizione</span>
          </div>
        </div>
        <div className="corpo-pannello">
          <Composizione posizioniAperte={posizioniAperte} />
        </div>
      </section>

      <section className="pannello">
        <div className="testa-pannello">
          <div>
            <h3>Andamento del portafoglio</h3>
            <span className="chiosa">solo punti d&rsquo;archivio · nessun giorno interpolato</span>
          </div>
        </div>
        <div className="corpo-pannello">
          {seriesLoading ? (
            <p className="chiosa">Caricamento andamento…</p>
          ) : (
            <GraficoPortafoglio
              titoli={series}
              sottoIlGrafico={(contesto) => (
                <MetrichePortafoglio {...contesto} titoli={series} enrichedPositions={enrichedPositions} />
              )}
            />
          )}
        </div>
      </section>

      {posizioniChiuse.length > 0 && (
        <section className="pannello">
          <div className="testa-pannello">
            <div>
              <h3>Posizioni chiuse</h3>
              <span className="chiosa">titoli venduti per intero — fuori dalla tabella qui sopra, dentro il risultato del portafoglio</span>
            </div>
            <span className="pillola">Sola consultazione</span>
          </div>

          <div className="tabella-scroll">
            <table className="dati" data-testid="tabella-posizioni-chiuse" aria-label="Tabella delle posizioni interamente vendute">
              <thead>
                <tr>
                  <th scope="col">Denominazione · ISIN</th>
                  <th scope="col" style={{ textAlign: 'right' }}>Chiusa il</th>
                  <th scope="col" style={{ textAlign: 'right' }}>Quantità venduta</th>
                  <th scope="col" style={{ textAlign: 'right' }}>Incasso</th>
                  <th scope="col" style={{ textAlign: 'right' }}>P&amp;L realizzato</th>
                </tr>
              </thead>
              <tbody>
                {posizioniChiuse.map((ep) => {
                  const chiusuraIl = ultimaVenditaPerIsin.get(ep.isin);
                  return (
                    <tr key={ep.isin} data-testid={`posizione-chiusa-${ep.isin}`}>
                      <td>
                        <CellaTitolo isin={ep.isin} nome={ep.name} />
                      </td>
                      <td className="cifra">{chiusuraIl ? dataCarico(chiusuraIl) : '–'}</td>
                      <td className="cifra">{quantita(ep.soldQuantity)}</td>
                      <td className="cifra">{importo(ep.soldRevenue)}</td>
                      <td className={`cifra forte ${segnoClasse(ep.realizedPnl)}`}>
                        {`${ep.realizedPnl >= 0 ? '+' : ''}${importo(ep.realizedPnl)}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>Totale posizioni chiuse ({posizioniChiuse.length})</td>
                  <td className="cifra forte">
                    {importo(posizioniChiuse.reduce((s, ep) => s + ep.soldRevenue, 0))}
                  </td>
                  {(() => {
                    const totaleRealizzato = posizioniChiuse.reduce((s, ep) => s + ep.realizedPnl, 0);
                    return (
                      <td className={`cifra forte ${segnoClasse(totaleRealizzato)}`}>
                        {`${totaleRealizzato >= 0 ? '+' : ''}${importo(totaleRealizzato)}`}
                      </td>
                    );
                  })()}
                </tr>
              </tfoot>
            </table>
          </div>

          <p className="nota-tabella">
            Le due cifre «Quantità venduta» e «Incasso» sono la somma di <em>tutti</em> gli scarichi
            registrati su quell&rsquo;ISIN, anche quando sono avvenuti in più iscrizioni distinte. Il P&amp;L
            realizzato è la stessa cifra congelata che concorre al quadro del risultato qui sopra: non è
            ricalcolato qui, è letto da lì.
          </p>
        </section>
      )}
      </>
      )}

      <div className="bottoni">
        <Link to="/" className="bottone quieto">&larr; Torna all&rsquo;elenco portafogli</Link>
      </div>

      <section className="pannello" aria-label="Gestione portafoglio">
        <div className="testa-pannello">
          <div>
            <h3>Gestione del conto</h3>
            <span className="chiosa">rinomina o estingui il portafoglio</span>
          </div>
        </div>
        <div className="corpo-pannello modulo-gestione">
          <form onSubmit={(e) => { void handleRename(e); }}>
            <div className="campo-gestione">
              <label htmlFor="rename-input-quadro">Rinomina conto</label>
              <div className="riga-campo">
                <input
                  id="rename-input-quadro"
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  maxLength={80}
                  autoComplete="off"
                  disabled={renaming}
                />
                <button type="submit" className="bottone" disabled={renaming}>
                  {renaming ? 'Salvataggio…' : 'Salva'}
                </button>
                {renameError && (
                  <span role="alert" className="errore-campo-quadro">{renameError}</span>
                )}
              </div>
            </div>
          </form>

          <div className="zona-pericolo-quadro">
            <p>
              L&rsquo;eliminazione del conto è irreversibile: ogni dato associato sarà cancellato
              dal registro.
            </p>
            <button
              type="button"
              onClick={() => { void handleDelete(); }}
              className="bottone pericolo"
              disabled={deleting}
            >
              {deleting ? 'Eliminazione…' : 'Elimina portafoglio'}
            </button>
          </div>
          {deleteError && <p className="messaggio-errore-quadro">{deleteError}</p>}
        </div>
      </section>
    </>
  );
}
