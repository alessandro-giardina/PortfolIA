// Stessa ragione della coppia di formattatori duplicata da `RiepilogoQuadro`
// rispetto a `RiepilogoMastro` (US-051/TASK-05): `dataRilevazione` e
// `giornoSettimana` sono già in `SchedaTitolo.tsx`, identiche qui — è una
// lettura diversa degli stessi dati, non una seconda convenzione.
import { dataCarico, dataRegistro, quantita } from '../components/Foglio.js';
import {
  classeSegno,
  importo,
  importoConSegno,
  nomeFonte,
  percentualeConSegno,
  prezzo,
  simboloDi,
} from '../domain/formattazione.js';
import GraficoTitolo from '../components/GraficoTitolo.js';
import MetricheTitolo from '../components/MetricheTitolo.js';
import { useSchedaTitolo, type UseSchedaTitoloProps } from '../hooks/useSchedaTitolo.js';

type SchedaTitoloQuadroProps = UseSchedaTitoloProps;

/** Formatta un timestamp unix come "07.VIII.2026 · 09:14" — identica a `SchedaTitolo`. */
function dataRilevazione(fetchedAt: number): string {
  const d = new Date(fetchedAt * 1000);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${dataRegistro(fetchedAt)} · ${hh}:${mm}`;
}

/** Giorno della settimana di una rilevazione, es. "lunedì" — identica a `SchedaTitolo`. */
function giornoSettimana(observedAt: number): string {
  return new Date(observedAt * 1000).toLocaleDateString('it-IT', { weekday: 'long' });
}

/** Etichetta unica per ogni campo assente: la spec vieta il valore inventato. */
const NON_DISPONIBILE = 'Dato non disponibile';

/** Una voce dell'anagrafica ufficiale sulla griglia `.griglia-def` del design quadro. */
function VoceAnagraficaQuadro({
  etichetta,
  valore,
  mono = false,
}: {
  etichetta: string;
  valore: string | null;
  mono?: boolean;
}) {
  return (
    <div className="voce-def">
      <span className="et">{etichetta}</span>
      {valore !== null && valore !== '' ? (
        <span className={`dato${mono ? ' mono' : ''}`}>{valore}</span>
      ) : (
        <span className="dato assente">{NON_DISPONIBILE}</span>
      )}
    </div>
  );
}

/**
 * Scheda di dettaglio di un titolo per il design «Quadro strumenti»
 * (US-052): vista gemella di `SchedaTitolo.tsx`, sullo stesso modello di
 * `RiepilogoQuadro` rispetto a `RiepilogoMastro`. Consuma `useSchedaTitolo`
 * (US-052/TASK-01) esattamente come il mastro e non ricalcola nulla — ogni
 * cifra qui è la stessa cifra che il mastro mostra, letta dalle stesse props.
 *
 * `GraficoTitolo` e `MetricheTitolo` sono montati **invariati**: la
 * differenza di design vive tutta in `quadro.css` (US-052/TASK-03), non in
 * un secondo componente.
 *
 * La riga di provenienza e il comando di aggiornamento restano nel corpo
 * della pagina, appena sotto l'intestazione del titolo — non nella testata
 * condivisa del guscio, che oggi non ha uno slot per azioni di pagina
 * (decisione architetturale 6 del piano).
 */
export default function SchedaTitoloQuadro({
  portfolioId,
  isin,
  onDatiAggiornati,
}: SchedaTitoloQuadroProps) {
  const { detail, loading, error, esito, conferma, appenaAggiornato, aggiornaDati, annullaConferma } =
    useSchedaTitolo({ portfolioId, isin, onDatiAggiornati });

  if (loading) {
    return <p className="chiosa">Caricamento scheda titolo…</p>;
  }

  if (error !== null) {
    return (
      <p className="avviso critico" role="alert" data-testid="scheda-titolo-errore">
        {error}
      </p>
    );
  }

  if (detail === null) return null;

  const numeroCarichi = detail.loads.length;
  const numeroOsservazioni = detail.priceHistory.length;
  const simboloValuta = simboloDi(detail.currency);
  const inAttesa = esito?.tipo === 'in-corso';

  const comandoAggiorna = (
    <span className="azione-fonte">
      <button
        type="button"
        className={`bottone-minuto${inAttesa ? ' in-corso' : ''}`}
        data-testid="btn-aggiorna-dati"
        disabled={inAttesa || conferma !== null}
        aria-busy={inAttesa}
        onClick={() => {
          void aggiornaDati(false);
        }}
      >
        <span className="glifo">&#x21bb;</span>{' '}
        {inAttesa
          ? detail.dataSource === null
            ? 'Recupero…'
            : 'Aggiornamento…'
          : detail.dataSource === null
            ? 'Recupera dati'
            : 'Aggiorna dati'}
      </button>
    </span>
  );

  return (
    <div data-testid="scheda-titolo" data-isin={detail.isin}>
      {/* ===== Intestazione del titolo ===== */}
      <section className="testa-titolo">
        <div className="anagrafe">
          <h1>{detail.name ?? detail.isin}</h1>
          <div className="marcature">
            <span className="pillola isin">{detail.isin}</span>
            {detail.ticker !== null && <span className="pillola">{detail.ticker}</span>}
            {detail.instrumentType !== null && <span className="pillola">{detail.instrumentType}</span>}
            {detail.dataSource === null ? (
              <span className="pillola">Fonte non registrata</span>
            ) : (
              <span className={`pillola fonte${detail.dataSource === 'morningstar' ? ' di-backup' : ''}`}>
                {nomeFonte(detail.dataSource)}
              </span>
            )}
          </div>
        </div>
        <div className="prezzo-vivo">
          <span className="et">Prezzo attuale</span>
          {detail.currentPrice !== null ? (
            <span className="cifra accento">
              {simboloValuta} {prezzo(detail.currentPrice)}
            </span>
          ) : (
            <span className="cifra assente">{NON_DISPONIBILE}</span>
          )}
        </div>
      </section>

      {/* Provenienza del dato (FR-021) e comando di aggiornamento (US-030) —
          stesso testo del mastro sui tre esiti e sulla guardia di conferma. */}
      {detail.dataSource === null ? (
        <div className="riga-provenienza" data-testid="fonte-dato">
          <span className="pillola">Fonte non registrata</span>
          <span>Nessun recupero dalla fonte risulta in archivio per questo ISIN.</span>
          {comandoAggiorna}
        </div>
      ) : (
        <div className="riga-provenienza" data-testid="fonte-dato">
          <span className={`pillola fonte${detail.dataSource === 'morningstar' ? ' di-backup' : ''}`}>
            {detail.dataSource === 'morningstar' ? 'Fonte di backup' : 'Fonte primaria'}
          </span>
          <span>
            Fonte: <b>{nomeFonte(detail.dataSource)}</b>
          </span>
          {detail.fetchedAt !== null && (
            <span className="istante-rilevazione">
              Rilevato il{' '}
              <b className={appenaAggiornato ? 'appena-aggiornato' : undefined} data-testid="istante-rilevazione">
                {dataRilevazione(detail.fetchedAt)}
              </b>
            </span>
          )}
          {comandoAggiorna}
        </div>
      )}

      {esito !== null && (
        <div
          className={`avviso${esito.tipo === 'riuscito' ? ' sereno' : esito.tipo === 'fallito' ? ' critico' : ''}`}
          data-testid="esito-aggiornamento"
          role={esito.tipo === 'fallito' ? 'alert' : 'status'}
        >
          <div className="dettagli">
            <span className="glifo" aria-hidden="true">
              {esito.tipo === 'riuscito' ? '✓' : esito.tipo === 'fallito' ? '✕' : '…'}
            </span>
            <div>
              <strong>
                {esito.tipo === 'in-corso' && 'In attesa'}
                {esito.tipo === 'riuscito' && 'Dati aggiornati'}
                {esito.tipo === 'fallito' && 'Aggiornamento non riuscito'}
              </strong>
              <p>
                {esito.tipo === 'in-corso' && (
                  <>
                    Interrogazione della fonte in corso — la fonte di backup può richiedere fino a una decina
                    di secondi.
                  </>
                )}
                {esito.tipo === 'riuscito' && (
                  <>
                    {esito.fonte !== null ? (
                      <>
                        Ha risposto <b>{esito.fonte}</b>.
                      </>
                    ) : (
                      <>I dati in archivio sono stati riscritti.</>
                    )}
                    {esito.prezzo !== null && (
                      <>
                        {' '}
                        Prezzo ora <b>{esito.prezzo}</b>.
                      </>
                    )}
                  </>
                )}
                {esito.tipo === 'fallito' && esito.motivo}
              </p>
            </div>
          </div>
        </div>
      )}

      {conferma !== null && (
        <div
          className="avviso critico"
          role="alertdialog"
          aria-label="Conferma aggiornamento"
          data-testid="avviso-conferma-aggiornamento"
        >
          <div className="dettagli">
            <span className="glifo" aria-hidden="true">
              !
            </span>
            <p style={{ margin: 0 }}>{conferma.message}</p>
          </div>
          <div className="bottoni">
            <button
              type="button"
              className="bottone"
              onClick={() => {
                void aggiornaDati(true);
              }}
            >
              Procedi comunque
            </button>
            <button type="button" className="bottone quieto" onClick={() => annullaConferma()}>
              Annulla
            </button>
          </div>
        </div>
      )}

      {/* ===== Posizione a conto ===== */}
      <div className="et-sezione">
        <h2>Posizione a conto</h2>
        <span className="chiosa">dati della posizione nel portafoglio</span>
      </div>

      <section className="griglia-kpi" aria-label="Posizione a conto">
        <article className="carta-kpi">
          <span className="et">Quantità</span>
          <span className="cifra" data-testid="dettaglio-quantita">
            {quantita(detail.totalQuantity)}
          </span>
          <span className="piede">
            su <b>{numeroCarichi}</b> {numeroCarichi === 1 ? 'carico' : 'carichi'}
          </span>
        </article>

        <article className="carta-kpi">
          <span className="et">Valore medio di carico</span>
          <span className={`cifra${detail.avgLoadPrice !== null ? '' : ' assente'}`} data-testid="dettaglio-prezzo-medio">
            {detail.avgLoadPrice !== null ? `€ ${prezzo(detail.avgLoadPrice)}` : '—'}
          </span>
          <span className="piede">carico € {importo(detail.totalLoadValue)}</span>
        </article>

        <article className={`carta-kpi${detail.currentValue !== null ? ' segnata-accento' : ''}`}>
          <span className="et">Valore attuale</span>
          {detail.currentValue !== null && detail.currentPrice !== null ? (
            <>
              <span className="cifra accento" data-testid="dettaglio-valore-attuale">
                € {importo(detail.currentValue)}
              </span>
              <span className="piede">
                {simboloValuta} {prezzo(detail.currentPrice)}/quota
              </span>
            </>
          ) : (
            <>
              <span className="cifra assente" data-testid="dettaglio-valore-attuale">
                {NON_DISPONIBILE}
              </span>
              <span className="piede">prezzo non in archivio</span>
            </>
          )}
        </article>

        <article
          className={`carta-kpi${detail.difference !== null && detail.difference !== 0 ? ` segnata-${classeSegno(detail.difference)}` : ''}`}
        >
          <span className="et">Differenza</span>
          {detail.difference !== null ? (
            <>
              <span className={`cifra ${classeSegno(detail.difference)}`} data-testid="dettaglio-differenza">
                {importoConSegno(detail.difference)}
              </span>
              <span className="piede">
                <b className={classeSegno(detail.difference)}>
                  {detail.differencePercent !== null
                    ? percentualeConSegno(detail.differencePercent)
                    : 'percentuale non calcolabile'}
                </b>{' '}
                <span data-testid="segna-rimando-differenza">&#8225; ripresa sotto il grafico</span>
              </span>
            </>
          ) : (
            <>
              <span className="cifra assente" data-testid="dettaglio-differenza">
                {NON_DISPONIBILE}
              </span>
              <span className="piede">non calcolabile</span>
            </>
          )}
        </article>
      </section>

      {/* ===== Andamento del titolo (US-036, US-039, FR-015, FR-017, ADR-008) ===== */}
      <div className="et-sezione" data-testid="sezione-grafico-titolo">
        <h2>Andamento del titolo</h2>
        <span className="chiosa">
          dal primo carico a oggi · due viste della stessa storia, sui soli dati
          d&rsquo;archivio
        </span>
      </div>

      <section className="pannello">
        <div className="corpo-pannello">
          <GraficoTitolo
            key={detail.isin}
            loads={detail.loads}
            sales={detail.sales}
            observations={detail.priceHistory}
            avgLoadPrice={detail.avgLoadPrice}
            simboloValuta={simboloValuta}
            sottoIlGrafico={(contesto) => (
              <MetricheTitolo
                {...contesto}
                difference={detail.difference}
                differencePercent={detail.differencePercent}
                totalQuantity={detail.totalQuantity}
                avgLoadPrice={detail.avgLoadPrice}
                totalLoadValue={detail.totalLoadValue}
                currentPrice={detail.currentPrice}
                numeroCarichi={numeroCarichi}
                simboloValuta={simboloValuta}
              />
            )}
          />
        </div>
      </section>

      {/* ===== Anagrafica ufficiale ===== */}
      <div className="et-sezione">
        <h2>Anagrafica ufficiale</h2>
        <span className="chiosa">dati come rilevati alla fonte · nessun valore stimato</span>
      </div>

      <section className="pannello">
        <div className="corpo-pannello stretto">
          <div className="griglia-def" data-testid="anagrafica-titolo">
            <VoceAnagraficaQuadro etichetta="Denominazione" valore={detail.name} />
            <VoceAnagraficaQuadro etichetta="ISIN" valore={detail.isin} mono />
            <VoceAnagraficaQuadro etichetta="Ticker" valore={detail.ticker} mono />
            <VoceAnagraficaQuadro etichetta="Tipo strumento" valore={detail.instrumentType} />
            <VoceAnagraficaQuadro etichetta="Commissioni annue" valore={detail.totalAnnualFees} />
            <VoceAnagraficaQuadro etichetta="Valuta" valore={detail.currency} />
            <VoceAnagraficaQuadro etichetta="Emittente" valore={detail.issuer} />
            <VoceAnagraficaQuadro etichetta="Segmento" valore={detail.segment} />
            <VoceAnagraficaQuadro etichetta="Politica dividendi" valore={detail.dividendPolicy} />
            <VoceAnagraficaQuadro
              etichetta="Prezzo attuale"
              valore={detail.currentPrice !== null ? `${simboloValuta} ${prezzo(detail.currentPrice)}` : null}
            />
          </div>
        </div>
      </section>

      {/* ===== Carichi registrati + Storico prezzi ===== */}
      <section className="griglia-doppia">
        <article className="pannello">
          <div className="testa-pannello">
            <div>
              <h3>Carichi registrati</h3>
              <span className="chiosa">le iscrizioni individuali che compongono la posizione</span>
            </div>
            <span className="pillola">
              {numeroCarichi} {numeroCarichi === 1 ? 'carico' : 'carichi'}
            </span>
          </div>
          <div className="tabella-scroll">
            <table className="dati" data-testid="tabella-carichi-titolo" aria-label="Carichi registrati per questo titolo">
              <thead>
                <tr>
                  <th scope="col">Data di carico</th>
                  <th scope="col" style={{ textAlign: 'right' }}>Quantità</th>
                  <th scope="col" style={{ textAlign: 'right' }}>Prezzo d&rsquo;acquisto</th>
                  <th scope="col" style={{ textAlign: 'right' }}>Controvalore carico</th>
                </tr>
              </thead>
              <tbody>
                {detail.loads.map((carico) => (
                  <tr key={carico.id} data-testid={`carico-titolo-${carico.id}`}>
                    <td>{dataCarico(carico.loadDate)}</td>
                    <td className="cifra">{quantita(carico.quantity)}</td>
                    <td className="cifra">{prezzo(carico.loadPrice)}</td>
                    <td className="cifra">{importo(carico.loadPrice * carico.quantity)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>
                    <span className="et-totale">Totale · prezzo medio</span>
                  </td>
                  <td className="cifra">{quantita(detail.totalQuantity)}</td>
                  <td className={detail.avgLoadPrice !== null ? 'cifra' : 'cifra assente'}>
                    {detail.avgLoadPrice !== null ? prezzo(detail.avgLoadPrice) : '—'}
                  </td>
                  <td className="cifra">{importo(detail.totalLoadValue)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="nota-tabella">
            {detail.currentPrice !== null ? (
              <>
                Il prezzo medio di carico è la media ponderata sulle quantità dei carichi iscritti; il valore
                attuale usa il prezzo più recente rilevato alla fonte.
              </>
            ) : (
              <>
                I campi contrassegnati «{NON_DISPONIBILE}» non sono presenti in archivio: PortfolIA non mostra
                denominazioni, prezzi o valori stimati.
              </>
            )}
          </p>
        </article>

        <article className="pannello">
          <div className="testa-pannello">
            <div>
              <h3>Storico prezzi</h3>
              <span className="chiosa">le quotazioni già rilevate · nessuna richiesta in più alla fonte</span>
            </div>
            <span className="pillola">
              {numeroOsservazioni} {numeroOsservazioni === 1 ? 'rilevazione' : 'rilevazioni'}
            </span>
          </div>
          <div className="tabella-scroll">
            <table
              className="dati"
              data-testid="tabella-storico-prezzi"
              aria-label="Storico dei prezzi rilevati per questo titolo"
            >
              <thead>
                <tr>
                  <th scope="col">Data di rilevamento</th>
                  <th scope="col" style={{ textAlign: 'right' }}>Prezzo rilevato</th>
                  <th scope="col" style={{ textAlign: 'right' }}>Fonte</th>
                </tr>
              </thead>
              <tbody>
                {numeroOsservazioni === 0 ? (
                  <tr>
                    <td colSpan={3} data-testid="storico-prezzi-vuoto">
                      Nessuna rilevazione registrata per questo titolo.
                    </td>
                  </tr>
                ) : (
                  detail.priceHistory.map((osservazione, indice) => (
                    <tr
                      key={`${osservazione.observedAt}-${osservazione.price}`}
                      data-testid={`osservazione-${indice}`}
                    >
                      <td>
                        {dataRilevazione(osservazione.observedAt)}
                        {indice === 0 && (
                          <span className="pillola viva" style={{ marginLeft: 8 }}>
                            {numeroOsservazioni === 1 ? 'unica' : 'ultima'}
                          </span>
                        )}
                        <br />
                        <small>{giornoSettimana(osservazione.observedAt)}</small>
                      </td>
                      <td className="cifra" data-testid={`osservazione-prezzo-${indice}`}>
                        {simboloValuta} {prezzo(osservazione.price)}
                      </td>
                      <td className="cifra">
                        {osservazione.dataSource === null ? (
                          <span className="pillola">Fonte non registrata</span>
                        ) : (
                          <span
                            className={`pillola fonte${osservazione.dataSource === 'morningstar' ? ' di-backup' : ''}`}
                          >
                            {nomeFonte(osservazione.dataSource)}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="avviso-rado" data-testid="avviso-storico-rado">
            {numeroOsservazioni === 0 ? (
              <span>
                Lo storico si popola dai tuoi aggiornamenti — ricerca titolo, scheda titolo, aggiornamento dei
                titoli obsoleti. Per questo titolo nessun prezzo risulta ancora rilevato, e nessuna quotazione
                viene ricostruita.
              </span>
            ) : numeroOsservazioni === 1 ? (
              <span>
                Lo storico contiene per ora <b>una sola</b> rilevazione: <b>parte da qui</b> e cresce dai
                prossimi aggiornamenti. Non esistono quotazioni anteriori, e nessuna viene ricostruita.
              </span>
            ) : (
              <span>
                Lo storico registra soltanto le <b>{numeroOsservazioni}</b> quotazioni che i tuoi aggiornamenti
                hanno già rilevato — ricerca titolo, scheda titolo, aggiornamento dei titoli obsoleti. I giorni
                non osservati restano vuoti: PortfolIA non li stima e non li interpola.
              </span>
            )}
          </div>

          <p className="nota-tabella" data-testid="nota-storico-prezzi">
            {numeroOsservazioni <= 1 ? (
              <>
                Una riga sola non è un difetto della scheda: è quanto l&rsquo;archivio contiene. Il prossimo
                aggiornamento in un giorno diverso, o a un prezzo diverso, aggiungerà la seconda.
              </>
            ) : (
              <>
                Due rilevazioni dello stesso giorno con lo stesso prezzo contano come una sola osservazione;
                con prezzi diversi restano entrambe. Il giorno è quello civile di Roma.
              </>
            )}
          </p>
        </article>
      </section>
    </div>
  );
}
