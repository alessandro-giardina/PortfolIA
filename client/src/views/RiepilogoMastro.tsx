import { Link } from 'react-router-dom';
import type { EnrichedPositionSummary, PortfolioSeriesEntry } from '@portfolia/shared';
import { dataCarico, quantita } from '../components/Foglio.js';
import QuadroRisultato from '../components/QuadroRisultato.js';
import GraficoPortafoglio from '../components/GraficoPortafoglio.js';
import MetrichePortafoglio from '../components/MetrichePortafoglio.js';
import CellaTitolo from '../components/CellaTitolo.js';
import AggiornaObsoleti from '../components/AggiornaObsoleti.js';

/**
 * Formatta il momento dell'ultimo rilevamento del prezzo (unix, secondi) come
 * `gg/mm/aaaa hh:mm`. In tabella la data compatta si legge meglio della forma
 * a mese romano usata dalla scheda titolo: la colonna è stretta e affiancata a
 * cifre, e il confronto fra righe deve essere immediato.
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
 * Le props condivise dalle viste "riepilogo" del conto (US-051): questa,
 * `RiepilogoMastro`, e la gemella `RiepilogoQuadro` introdotta in TASK-05.
 * Entrambe leggono lo stesso stato del portafoglio — arricchimento posizioni,
 * andamento, gestione del conto — e differiscono solo nella presentazione.
 */
export interface RiepilogoProps {
  portfolioName: string;
  portfolioCreatedAt: number;
  enrichedPositions: EnrichedPositionSummary[];
  enrichedLoading: boolean;
  posizioniAperte: EnrichedPositionSummary[];
  posizioniChiuse: EnrichedPositionSummary[];
  ultimaVenditaPerIsin: Map<string, string>;
  series: PortfolioSeriesEntry[];
  seriesLoading: boolean;
  isinInLavorazione: string | null;
  setIsinInLavorazione: (isin: string | null) => void;
  id: string | undefined;
  ricalcolaSilenzioso: () => Promise<void>;
  apriSchedaTitolo: (isinTitolo: string) => void;
  renameValue: string;
  setRenameValue: (value: string) => void;
  renameError: string | null;
  renaming: boolean;
  handleRename: (e: React.FormEvent) => Promise<void>;
  deleteError: string | null;
  deleting: boolean;
  handleDelete: () => Promise<void>;
}

/**
 * Scheda "Riepilogo" del conto a mastro (design Mastro), estratta da
 * `PortfolioDetailPage` in US-051/TASK-01 senza alcun cambio di comportamento.
 */
export default function RiepilogoMastro({
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
  return (
    <>
      {/* Tabella titoli arricchita (FR-013) */}
      <div className="sezione-titolo" style={{ marginTop: '6px' }}>
        Titoli iscritti a conto
        <span className="nota">valore attuale e differenza rispetto al carico</span>
      </div>

      {enrichedLoading ? (
        <p className="messaggio attesa">Caricamento titoli…</p>
      ) : enrichedPositions.length === 0 ? (
        <div className="dettaglio-placeholder" data-testid="riepilogo-vuoto">
          <span className="icona-conto" aria-hidden="true">&#9634;</span>
          <p className="sottotitolo" style={{ fontFamily: "'IM Fell English', serif", fontStyle: 'italic', fontSize: '18px', fontWeight: 400 }}>
            Il registro è ancora bianco
          </p>
          <p className="sottotitolo">
            Nessun titolo è stato ancora iscritto in questo portafoglio.
            Vai alla scheda <em>Carico titoli</em> per registrare il primo carico.
          </p>
        </div>
      ) : (
        <>
          {(() => {
            const positionsWithPrice = posizioniAperte.filter((ep) => ep.currentValue !== null);
            const totalCurrentValue = positionsWithPrice.reduce((s, ep) => s + (ep.currentValue ?? 0), 0);
            const missingPriceCount = posizioniAperte.length - positionsWithPrice.length;
            const nessunaPosizioneAperta = posizioniAperte.length === 0;
            return (
              <div className="riquadro-valore-totale" data-testid="valore-totale-portafoglio" aria-label="Valore attuale totale del portafoglio">
                <div className={`fascia-colore${nessunaPosizioneAperta ? ' assente' : missingPriceCount > 0 ? (positionsWithPrice.length === 0 ? ' assente' : ' parziale') : ''}`}></div>
                <div className="contenuto-totale">
                  <div className="blocco-cifra">
                    <span className="et-totale">Valore attuale totale</span>
                    <span className={`cifra-totale${nessunaPosizioneAperta ? ' zero-misurato' : positionsWithPrice.length === 0 ? ' assente' : missingPriceCount > 0 ? ' parziale' : ''}`}>
                      <span className="valuta">EUR</span>
                      {nessunaPosizioneAperta
                        ? '0,00'
                        : positionsWithPrice.length === 0
                          ? '–'
                          : totalCurrentValue.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  {!nessunaPosizioneAperta && missingPriceCount > 0 && (
                    <div className="nota-mancante" role="note">
                      <strong>{positionsWithPrice.length === 0 ? 'Nessun prezzo disponibile' : 'Valore parziale'}</strong>
                      {positionsWithPrice.length === 0
                        ? `Il prezzo corrente non è in archivio per nessuna delle ${posizioniAperte.length} ${posizioniAperte.length === 1 ? 'posizione' : 'posizioni'}. Il valore sarà calcolato non appena almeno un prezzo sarà recuperato.`
                        : `${missingPriceCount} ${missingPriceCount === 1 ? 'posizione senza prezzo corrente' : 'posizioni senza prezzo corrente'}: il totale esclude ${missingPriceCount === 1 ? 'questo titolo' : 'questi titoli'}.`}
                    </div>
                  )}
                  <div className="timestamp-totale">
                    {nessunaPosizioneAperta
                      ? 'Nessuna posizione posseduta'
                      : <>{positionsWithPrice.length} di {posizioniAperte.length} {posizioniAperte.length === 1 ? 'posizione valorizzata' : 'posizioni valorizzate'}</>}
                  </div>
                </div>
              </div>
            );
          })()}
          <QuadroRisultato enrichedPositions={enrichedPositions} />
          <div className="sezione-titolo" style={{ marginTop: '40px' }}>
            Andamento del portafoglio
            <span className="nota">valore complessivo nel tempo, dal registro dei carichi e delle rilevazioni</span>
          </div>

          {seriesLoading ? (
            <p className="messaggio attesa">Caricamento andamento…</p>
          ) : (
            <GraficoPortafoglio
              titoli={series}
              sottoIlGrafico={(contesto) => (
                <MetrichePortafoglio
                  {...contesto}
                  titoli={series}
                  enrichedPositions={enrichedPositions}
                />
              )}
            />
          )}
          {id && (
            <AggiornaObsoleti
              portfolioId={id}
              posizioniAperte={posizioniAperte}
              onRicalcola={ricalcolaSilenzioso}
              onTitoloInCorso={setIsinInLavorazione}
            />
          )}
          {posizioniAperte.length === 0 ? (
            <div className="dettaglio-placeholder" data-testid="riepilogo-tutte-chiuse">
              <span className="icona-conto" aria-hidden="true">&#9634;</span>
              <p className="sottotitolo" style={{ fontFamily: "'IM Fell English', serif", fontStyle: 'italic', fontSize: '18px', fontWeight: 400 }}>
                Nessun titolo è oggi posseduto
              </p>
              <p className="sottotitolo">
                Ogni titolo mai iscritto in questo portafoglio è stato venduto per intero.
                Il suo esito resta consultabile qui sotto, in <em>Posizioni chiuse</em>.
              </p>
            </div>
          ) : (
          <>
          <div className="tabella-scroll">
            <table className="mastro" data-testid="tabella-riepilogo" aria-label="Tabella titoli del portafoglio">
              <thead>
                <tr>
                  <th>Denominazione &middot; ISIN</th>
                  <th>Quantità</th>
                  <th>Pr. medio carico</th>
                  <th>Prezzo attuale</th>
                  <th>Ultimo rilevamento</th>
                  <th>Valore attuale</th>
                  <th>Differenza</th>
                </tr>
              </thead>
              <tbody>
                {posizioniAperte.map((ep) => (
                  <tr
                    key={ep.isin}
                    className={`cliccabile${isinInLavorazione === ep.isin ? ' in-lavorazione' : ''}`}
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
                          <span className="badge-riaperta" data-testid={`badge-riaperta-${ep.isin}`}>
                            &#8635; riaperta
                          </span>
                        )}
                      </CellaTitolo>
                    </td>
                    <td className="cifra">{quantita(ep.totalQuantity)}</td>
                    <td className={ep.avgLoadPrice !== null ? 'cifra euro' : 'cifra dato-mancante'}>
                      {ep.avgLoadPrice !== null ? ep.avgLoadPrice.toFixed(4) : '–'}
                    </td>
                    <td
                      className={ep.currentPrice !== null ? 'cifra euro' : 'cifra dato-mancante'}
                      data-testid={`prezzo-attuale-${ep.isin}`}
                    >
                      {ep.currentPrice !== null ? ep.currentPrice.toFixed(4) : '–'}
                    </td>
                    <td className="cifra cella-rilevamento">
                      <span
                        className={
                          ep.currentPrice !== null && ep.fetchedAt !== null
                            ? `istante${ep.freshness === 'stale' ? ' segnato' : ''}`
                            : 'istante dato-mancante'
                        }
                        data-testid={`rilevamento-${ep.isin}`}
                      >
                        {ep.currentPrice !== null && ep.fetchedAt !== null
                          ? dataRilevamento(ep.fetchedAt)
                          : '–'}
                      </span>
                      {isinInLavorazione === ep.isin ? (
                        <small
                          className="marca-rilevamento in-lavorazione"
                          data-testid={`marca-rilevamento-${ep.isin}`}
                        >
                          in aggiornamento
                        </small>
                      ) : (
                        ep.freshness !== 'current' && (
                          <small
                            className={`marca-rilevamento ${ep.freshness === 'stale' ? 'obsoleto' : 'mai-rilevato'}`}
                            data-testid={`marca-rilevamento-${ep.isin}`}
                          >
                            {ep.freshness === 'stale' ? 'da aggiornare' : 'mai rilevato'}
                          </small>
                        )
                      )}
                    </td>
                    <td className={ep.currentValue !== null ? 'cifra euro' : 'cifra dato-mancante'}>
                      {ep.currentValue !== null
                        ? ep.currentValue.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                        : '–'}
                    </td>
                    <td className={
                      ep.difference === null
                        ? 'cifra dato-mancante'
                        : ep.difference >= 0
                          ? 'cifra guadagno'
                          : 'cifra perdita'
                    } data-testid={`diff-${ep.isin}`}>
                      {ep.difference !== null
                        ? `${ep.difference >= 0 ? '+' : ''}${ep.difference.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : '–'}
                    </td>
                  </tr>
                ))}
              </tbody>
              {(() => {
                const enrichedWithPrice = posizioniAperte.filter((ep) => ep.currentValue !== null);
                if (enrichedWithPrice.length === 0) return null;
                const totalCurrentValue = enrichedWithPrice.reduce((s, ep) => s + (ep.currentValue ?? 0), 0);
                const totalDiff = enrichedWithPrice.reduce((s, ep) => s + (ep.difference ?? 0), 0);
                return (
                  <tfoot>
                    <tr>
                      <td colSpan={5}>Totale portafoglio ({enrichedWithPrice.length} {enrichedWithPrice.length === 1 ? 'posizione valorizzata' : 'posizioni valorizzate'}{enrichedWithPrice.length < posizioniAperte.length ? ` di ${posizioniAperte.length}` : ''})</td>
                      <td className="cifra euro">{totalCurrentValue.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className={totalDiff >= 0 ? 'cifra guadagno' : 'cifra perdita'}>
                        {`${totalDiff >= 0 ? '+' : ''}${totalDiff.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                      </td>
                    </tr>
                  </tfoot>
                );
              })()}
            </table>
          </div>
          <p style={{ fontFamily: "'IM Fell English', serif", fontStyle: 'italic', color: 'var(--seppia)', fontSize: '13px', margin: '14px 0 0', paddingTop: '10px', borderTop: '1px dotted rgba(110,90,54,.4)' }}>
            I valori contrassegnati con &laquo;&ndash;&raquo; indicano che il prezzo corrente non è ancora
            disponibile in archivio; la differenza non può essere calcolata.
            Seleziona una riga per aprirne la <em>scheda titolo</em> con l&rsquo;anagrafica completa.
          </p>
          </>
          )}
          {posizioniChiuse.length > 0 && (
            <>
              <div className="sezione-titolo" style={{ marginTop: '40px' }}>
                Posizioni chiuse
                <span className="nota">titoli venduti per intero — fuori dalla tabella qui sopra, dentro il risultato del portafoglio</span>
              </div>

              <div className="blocco-posizioni-chiuse" aria-label="Posizioni interamente vendute">
                <div className="fascia-colore"></div>
                <div className="contenuto">
                  <div className="capo-chiuse">
                    <span className="timbro carminio">Sola consultazione</span>
                    <span className="nota-capo">
                      quantità residua 0 su ciascuna riga: nulla da vendere né da rettificare, solo da leggere
                    </span>
                  </div>

                  <div className="tabella-scroll">
                    <table className="mastro chiuse" data-testid="tabella-posizioni-chiuse" aria-label="Tabella delle posizioni interamente vendute">
                      <thead>
                        <tr>
                          <th>Denominazione &middot; ISIN</th>
                          <th>Chiusa il</th>
                          <th>Quantità venduta</th>
                          <th>Incasso</th>
                          <th>P&amp;L realizzato</th>
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
                              <td className="et-chiusura">{chiusuraIl ? dataCarico(chiusuraIl) : '–'}</td>
                              <td className="cifra">{quantita(ep.soldQuantity)}</td>
                              <td className="cifra euro">{ep.soldRevenue.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                              <td className={ep.realizedPnl >= 0 ? 'cifra guadagno' : 'cifra perdita'}>
                                {`${ep.realizedPnl >= 0 ? '+' : ''}${ep.realizedPnl.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan={3}>Totale posizioni chiuse ({posizioniChiuse.length})</td>
                          <td className="cifra euro">
                            {posizioniChiuse.reduce((s, ep) => s + ep.soldRevenue, 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          {(() => {
                            const totaleRealizzato = posizioniChiuse.reduce((s, ep) => s + ep.realizedPnl, 0);
                            return (
                              <td className={totaleRealizzato >= 0 ? 'cifra guadagno' : 'cifra perdita'}>
                                {`${totaleRealizzato >= 0 ? '+' : ''}${totaleRealizzato.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                              </td>
                            );
                          })()}
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </div>

              <p style={{ fontFamily: "'IM Fell English', serif", fontStyle: 'italic', color: 'var(--seppia)', fontSize: '13px', margin: '14px 0 0', paddingTop: '10px', borderTop: '1px dotted rgba(110,90,54,.4)' }}>
                Le due cifre «Quantità venduta» e «Incasso» sono la somma di <em>tutti</em> gli scarichi
                registrati su quell&rsquo;ISIN, anche quando sono avvenuti in più iscrizioni distinte. Il
                P&amp;L realizzato è la stessa cifra congelata che concorre al quadro del risultato qui
                sopra: non è ricalcolato qui, è letto da lì.
              </p>
            </>
          )}
        </>
      )}

      <div className="bottoni" style={{ marginTop: '24px' }}>
        <Link to="/" className="bottone secondario">&larr; Torna all&rsquo;elenco portafogli</Link>
      </div>

      <div className="sezione-titolo" style={{ marginTop: '40px' }}>
        Gestione del conto
        <span className="nota">rinomina o estingui il portafoglio</span>
      </div>

      <section className="sezione-gestione" aria-label="Gestione portafoglio">
        <form onSubmit={(e) => { void handleRename(e); }} className="form-gestione">
          <div className={`riga-modulo${renameError ? ' con-errore' : ''}`}>
            <label htmlFor="rename-input">Rinomina conto</label>
            <div className={`campo${renameError ? ' con-errore' : ''}`}>
              <input
                id="rename-input"
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
                <span role="alert" className="errore-campo visibile">{renameError}</span>
              )}
            </div>
          </div>
        </form>

        <hr className="separatore-gestione" />

        <div className="zona-pericolo">
          <p className="avviso-pericolo">
            L&rsquo;eliminazione del conto è irreversibile: ogni dato associato sarà
            cancellato dal registro.
          </p>
          <button
            type="button"
            onClick={() => { void handleDelete(); }}
            className="bottone rosso"
            disabled={deleting}
          >
            {deleting ? 'Eliminazione…' : 'Elimina portafoglio'}
          </button>
          {deleteError && <p className="messaggio errore">{deleteError}</p>}
        </div>
      </section>
    </>
  );
}
