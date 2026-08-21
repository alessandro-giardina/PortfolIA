import { normalizeIsin } from '@portfolia/shared';
import type { SecurityInfo } from '@portfolia/shared';
import { dataRegistro } from '../components/Foglio.js';
import PortfolioSelectDialog from '../components/PortfolioSelectDialog.js';
import { nomeFonte, prezzo, simboloDi } from '../domain/formattazione.js';
import type { RicercaProps } from './RicercaMastro.js';

/** Etichetta unica per ogni campo assente: la spec vieta il valore inventato. */
const NON_DISPONIBILE = 'Dato non disponibile';

/**
 * Formatta un timestamp unix come "20.VIII.2026 · 17:35" — identica a
 * `SchedaTitoloQuadro`, per la stessa ragione già registrata lì: è una lettura
 * diversa degli stessi dati, non una seconda convenzione di data.
 */
function dataRilevazione(fetchedAt: number): string {
  const d = new Date(fetchedAt * 1000);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${dataRegistro(fetchedAt)} · ${hh}:${mm}`;
}

/** Il prezzo nella convenzione del quadro: simbolo di valuta e quattro decimali. */
function prezzoDi(security: SecurityInfo): string | null {
  return security.price !== null ? `${simboloDi(security.currency)} ${prezzo(security.price)}` : null;
}

/**
 * Le dieci voci dell'anagrafica: **le stesse dieci** del design mastro
 * (`RicercaMastro.campiAnagrafica`), con le stesse etichette — cambia l'ordine,
 * che qui segue il mockup, non l'informazione. Le due rese devono dire la
 * stessa cosa sullo stesso titolo (criterio di accettazione di US-055).
 */
function campiAnagrafica(security: SecurityInfo): { etichetta: string; valore: string | null; mono?: boolean }[] {
  return [
    { etichetta: 'Denominazione', valore: security.name },
    { etichetta: 'ISIN', valore: security.isin, mono: true },
    { etichetta: 'Ticker', valore: security.ticker, mono: true },
    { etichetta: 'Tipo strumento', valore: security.instrumentType },
    { etichetta: 'Commissioni totali annue', valore: security.totalAnnualFees },
    { etichetta: 'Valuta di denominazione', valore: security.currency },
    { etichetta: 'Emittente', valore: security.issuer },
    { etichetta: 'Segmento', valore: security.segment },
    { etichetta: 'Politica di distribuzione dividendi', valore: security.dividendPolicy },
    { etichetta: 'Prezzo attuale', valore: prezzoDi(security) },
  ];
}

/**
 * L'anagrafica vuota da cui lo scheletro di caricamento ricava le **etichette**:
 * i valori non vengono letti — al loro posto lo scheletro mette una barra.
 */
const ANAGRAFICA_VUOTA: SecurityInfo = {
  isin: '',
  name: null,
  price: null,
  ticker: null,
  instrumentType: null,
  totalAnnualFees: null,
  currency: null,
  issuer: null,
  segment: null,
  dividendPolicy: null,
};

/**
 * Ricerca titoli per ISIN nel design «Quadro strumenti» (US-055): vista
 * gemella di `RicercaMastro`, sullo stesso modello di `RiepilogoQuadro`
 * rispetto a `RiepilogoMastro`. Consuma le `RicercaProps` di
 * `useRicercaTitolo` (US-049) esattamente come il mastro e non ricalcola
 * nulla — ogni dato qui è lo stesso dato che il mastro mostra.
 *
 * I cinque stati dell'hook (`idle`, `loading`, `found`, `notfound`, `error`)
 * hanno ciascuno la propria resa, e il quadro ne separa due che il mastro
 * racconta con la stessa riga: «non trovato» (le fonti hanno risposto che il
 * titolo non esiste) e «fonte non raggiungibile» (nessuna fonte ha risposto).
 * Sono due fatti diversi e chiedono all'utente due cose diverse — ricontrollare
 * il codice contro riprovare più tardi.
 *
 * `PortfolioSelectDialog` è montato **invariato**: la differenza di design vive
 * in `quadro.css` (US-053/TASK-04), non in un secondo componente.
 */
export default function RicercaQuadro({
  isin,
  setIsin,
  status,
  security,
  lastFetchedAt,
  confirmation,
  setConfirmation,
  dataSource,
  esito,
  searchedIsin,
  dialogOpen,
  setDialogOpen,
  handleDialogConfirm,
  lookup,
}: RicercaProps) {
  const inAttesa = status === 'loading';
  const lunghezza = normalizeIsin(isin).length;

  // A ISIN non valido — e al rifiuto 400 del server — l'hook lascia lo stato su
  // `idle` e scrive il motivo in `esito`: nel quadro è un errore inline sotto il
  // campo, non una riga di esito, perché è il campo a essere sbagliato.
  const erroreCampo = status === 'idle' ? esito : null;

  /**
   * La variante della riga di esito: il bordo sinistro dice di che esito si
   * tratta, ma il colore non è mai l'unico segnale — la pillola accanto lo
   * ripete a parole.
   */
  const classeEsito =
    status === 'found'
      ? 'trovato'
      : status === 'notfound'
        ? 'non-trovato'
        : status === 'loading'
          ? 'in-attesa'
          : status === 'error'
            ? 'guasto'
            : 'inerte';

  const campi = security !== null ? campiAnagrafica(security) : [];
  const campiValorizzati = campi.filter((c) => c.valore !== null).length;

  return (
    <>
      <div className="titolo-pagina">
        <div>
          <h1>Ricerca titoli</h1>
          <p className="sottotitolo">
            Digita un codice ISIN e recupera anagrafica e prezzo dalla fonte ufficiale — nessun valore
            stimato
          </p>
        </div>
      </div>

      {/* ===== Modulo di ricerca ===== */}
      <section className="pannello" aria-label="Ricerca per ISIN">
        <div className="testa-pannello">
          <div>
            <h3>Ricerca per ISIN</h3>
            <span className="chiosa">
              il dato proviene dalla fonte ufficiale — Borsa Italiana, MorningStar come ripiego
            </span>
          </div>
          <span className="pillola">12 caratteri</span>
        </div>
        <div className="corpo-pannello">
          <form
            className="modulo-gestione"
            onSubmit={(e) => {
              e.preventDefault();
              void lookup(false);
            }}
          >
            <div className="campo-gestione campo-isin">
              <label htmlFor="isin">Codice ISIN del titolo</label>
              <div className="riga-campo">
                <input
                  id="isin"
                  type="text"
                  className="isin"
                  value={isin}
                  onChange={(e) => setIsin(e.target.value)}
                  placeholder="es. IE00B4L5Y983"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={12}
                  disabled={inAttesa}
                />
                <span
                  className={`contatore-isin${lunghezza === 12 ? ' completo' : ''}`}
                  aria-live="polite"
                  data-testid="contatore-isin"
                >
                  {lunghezza}/12
                </span>
                <button type="submit" className="bottone" disabled={inAttesa}>
                  {inAttesa ? 'Recupero…' : 'Recupera anagrafica'}
                </button>
                {erroreCampo !== null && (
                  <p className="errore-campo-quadro" role="alert" data-testid="errore-isin">
                    {erroreCampo}
                  </p>
                )}
                <p className="nota-campo-isin">
                  Il primo recupero di un titolo mai visto può richiedere fino a una decina di secondi:
                  la fonte di ripiego risponde solo attraverso un browser.
                </p>
              </div>
            </div>
          </form>
        </div>
      </section>

      {/* ===== Riga di esito =====
          Un solo elemento, sempre montato: `role="status"` annuncia ciò che
          *cambia* dentro una live region già in pagina, non la comparsa
          dell'elemento che la porta. Cinque riquadri che si sostituiscono a
          vicenda non verrebbero annunciati — il mastro tiene una riga sola per
          la stessa ragione. */}
      <div className={`riga-esito-quadro ${classeEsito}`} role="status" data-testid="riga-esito">
        {status === 'idle' && (
          <span>Nessuna ricerca eseguita. L&apos;anagrafica compare qui sotto appena la fonte risponde.</span>
        )}

        {status === 'loading' && (
          <>
            <span className="punto-attesa" aria-hidden="true"></span>
            <span>
              Interrogazione della fonte ufficiale in corso per{' '}
              <span className="isin-citato">{searchedIsin}</span>…
            </span>
          </>
        )}

        {status === 'found' && security !== null && (
          <>
            <span className="pillola viva">Titolo trovato</span>
            <span>
              <b>{security.name ?? searchedIsin}</b>
              {prezzoDi(security) !== null && (
                <>
                  {' · '}
                  <b>{prezzoDi(security)}</b>
                </>
              )}
            </span>
          </>
        )}

        {status === 'notfound' && (
          <>
            <span className="pillola mai">{NON_DISPONIBILE}</span>
            <span>
              Nessuna corrispondenza per <span className="isin-citato">{searchedIsin}</span> presso le
              fonti interrogate.
            </span>
          </>
        )}

        {status === 'error' && (
          <>
            <span className="pillola obsoleta">Fonte non raggiungibile</span>
            <span>{esito}</span>
          </>
        )}
      </div>

      {/* ===== Guardia di buona cittadinanza (US-030) ===== */}
      {confirmation !== null && (
        <div className="avviso critico" role="alertdialog" aria-label="Conferma nuova ricerca">
          <div className="dettagli">
            <span className="glifo" aria-hidden="true">
              !
            </span>
            <div>
              <strong>Dati già rilevati di recente</strong>
              <p>{confirmation.message}</p>
            </div>
          </div>
          <div className="bottoni">
            <button
              type="button"
              className="bottone"
              onClick={() => {
                void lookup(true);
              }}
            >
              Procedi comunque
            </button>
            <button type="button" className="bottone quieto" onClick={() => setConfirmation(null)}>
              Annulla
            </button>
          </div>
        </div>
      )}

      {/* ===== Anagrafica: scheletro in attesa ===== */}
      {status === 'loading' && (
        <section className="pannello" aria-label="Anagrafica in caricamento">
          <div className="testa-pannello">
            <div>
              <h3>Anagrafica recuperata</h3>
              <span className="chiosa">attendere il responso della fonte</span>
            </div>
          </div>
          <div className="corpo-pannello stretto">
            <div className="griglia-def" aria-hidden="true" data-testid="scheletro-anagrafica">
              {campiAnagrafica(ANAGRAFICA_VUOTA).map((c) => (
                <div key={c.etichetta} className="voce-def">
                  <span className="et">{c.etichetta}</span>
                  <span className="scheletro-quadro"></span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ===== Risultato trovato ===== */}
      {status === 'found' && security !== null && (
        <>
          <section className="testa-titolo" data-testid="testa-titolo-ricerca">
            <div className="anagrafe">
              <h1>{security.name ?? security.isin}</h1>
              <div className="marcature">
                <span className="pillola isin">{security.isin}</span>
                {security.ticker !== null && <span className="pillola">{security.ticker}</span>}
                {security.instrumentType !== null && (
                  <span className="pillola">{security.instrumentType}</span>
                )}
                <span className={`pillola fonte${dataSource === 'morningstar' ? ' di-backup' : ''}`}>
                  {nomeFonte(dataSource)}
                </span>
              </div>
            </div>
            <div className="prezzo-vivo">
              <span className="et">Prezzo attuale</span>
              {prezzoDi(security) !== null ? (
                <span className="cifra accento">{prezzoDi(security)}</span>
              ) : (
                <span className="cifra assente">{NON_DISPONIBILE}</span>
              )}
            </div>
          </section>

          {/* Provenienza del dato (FR-021): stessa informazione della riga
              `.fonte-prezzo` del mastro — fonte e istante di rilevamento. */}
          <div className="riga-provenienza-quadro" data-testid="fonte-dato">
            <span className={`pillola fonte${dataSource === 'morningstar' ? ' di-backup' : ''}`}>
              {dataSource === 'morningstar' ? 'Fonte di ripiego' : 'Fonte primaria'}
            </span>
            <span>
              Fonte: <b>{nomeFonte(dataSource)}</b>
            </span>
            {lastFetchedAt !== null && (
              <span className="istante" data-testid="istante-rilevazione">
                Prezzo rilevato il <b>{dataRilevazione(lastFetchedAt)}</b>
              </span>
            )}
          </div>

          <section className="pannello" aria-label="Anagrafica ufficiale">
            <div className="testa-pannello">
              <div>
                <h3>Anagrafica ufficiale</h3>
                <span className="chiosa">dati come rilevati alla fonte · nessun valore stimato</span>
              </div>
              <span className={`pillola${campiValorizzati === campi.length ? ' viva' : ' mai'}`}>
                {campiValorizzati} campi su {campi.length}
              </span>
            </div>
            <div className="corpo-pannello stretto">
              <div className="griglia-def" data-testid="anagrafica-quadro">
                {campi.map((c) => (
                  <div key={c.etichetta} className="voce-def">
                    <span className="et">{c.etichetta}</span>
                    {c.valore !== null ? (
                      <span className={`dato${c.mono === true ? ' mono' : ''}`}>{c.valore}</span>
                    ) : (
                      <span className="dato assente">{NON_DISPONIBILE}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </section>

          <div className="bottoni">
            <button
              type="button"
              className="bottone"
              data-testid="btn-aggiungi-portafoglio"
              aria-haspopup="dialog"
              onClick={() => setDialogOpen(true)}
            >
              Aggiungi a portafoglio
            </button>
          </div>
        </>
      )}

      {/* ===== Non trovato ===== */}
      {status === 'notfound' && (
        <section className="pannello" aria-label="Esito della ricerca">
          <div className="corpo-pannello">
            <div className="placeholder-quadro" data-testid="ricerca-non-trovato">
              <h3>Titolo non reperito</h3>
              <p>
                Il codice <em>{searchedIsin}</em> non corrisponde ad alcun titolo presso le fonti
                interrogate, oppure i dati non sono al momento disponibili.
              </p>
              <p>
                Verifica il codice — dodici caratteri esatti — e riprova. PortfolIA non mostra mai
                denominazioni, prezzi o valori stimati.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* ===== Fonte muta: le fonti sono state interrogate e nessuna ha risposto ===== */}
      {status === 'error' && (
        <section className="pannello" aria-label="Fonte non raggiungibile">
          <div className="corpo-pannello">
            <div className="placeholder-quadro" data-testid="ricerca-fonte-muta">
              <h3>Nessuna fonte ha risposto</h3>
              <p>
                Borsa Italiana e la fonte di ripiego sono state interrogate entrambe e nessuna ha
                risposto in tempo utile. Non è un titolo inesistente: è un&apos;interrogazione andata a
                vuoto.
              </p>
              <p>
                Riprova fra qualche minuto. Nel frattempo l&apos;archivio resta come è:{' '}
                <em>nessun prezzo viene stimato al posto di quello mancante</em>.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* ===== Nessuna ricerca eseguita ===== */}
      {status === 'idle' && (
        <section className="pannello" aria-label="Nessuna ricerca eseguita">
          <div className="corpo-pannello">
            <div className="placeholder-quadro" data-testid="ricerca-vuota">
              <h3>Nessun titolo in consultazione</h3>
              <p>
                Inserisci un codice ISIN nel modulo qui sopra. L&apos;anagrafica e il prezzo
                compariranno qui, con la fonte da cui provengono e l&apos;istante in cui sono stati
                rilevati.
              </p>
            </div>
          </div>
        </section>
      )}

      {dialogOpen && status === 'found' && security !== null && (
        <PortfolioSelectDialog
          isin={security.isin}
          name={security.name}
          onConfirm={handleDialogConfirm}
          onClose={() => setDialogOpen(false)}
        />
      )}
    </>
  );
}
