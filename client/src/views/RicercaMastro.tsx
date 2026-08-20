import type { SecurityInfo } from '@portfolia/shared';
import { dataRegistro } from '../components/Foglio.js';
import PortfolioSelectDialog from '../components/PortfolioSelectDialog.js';
import type { useRicercaTitolo } from '../hooks/useRicercaTitolo.js';

/**
 * Le props condivise fra le due rese della ricerca titoli: esattamente ciò che
 * `useRicercaTitolo` (US-049) restituisce. Stesso patto di `RiepilogoProps` e di
 * `UseSchedaTitoloProps` — la vista non ricalcola nulla, riceve lo stato già
 * fatto e decide solo come scriverlo in pagina.
 */
export type RicercaProps = ReturnType<typeof useRicercaTitolo>;

const SIMBOLI_VALUTA: Record<string, string> = { EUR: '€', USD: '$', GBP: '£' };

/** Formatta un prezzo come "€ 94,55" (simbolo prima, decimali italiani), coerente coi mockup. */
function formatPrice(price: number | null, currency: string | null): string | null {
  if (price === null) return null;
  const num = new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
  }).format(price);
  if (currency && SIMBOLI_VALUTA[currency]) return `${SIMBOLI_VALUTA[currency]} ${num}`;
  if (currency) return `${currency} ${num}`;
  return num;
}

/** "28.VI.2026 · 17:35" — data/ora di rilevazione del prezzo. */
function formatRilevazione(fetchedAt: number | null): string | null {
  if (fetchedAt === null) return null;
  const d = new Date(fetchedAt * 1000);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${dataRegistro(fetchedAt)} · ${hh}:${mm}`;
}

function campiAnagrafica(security: SecurityInfo): { label: string; value: string | null }[] {
  return [
    { label: 'Denominazione', value: security.name },
    { label: 'Prezzo attuale', value: formatPrice(security.price, security.currency) },
    { label: 'Ticker', value: security.ticker },
    { label: 'Tipo strumento', value: security.instrumentType },
    { label: 'Commissioni totali annue', value: security.totalAnnualFees },
    { label: 'Valuta di denominazione', value: security.currency },
    { label: 'Emittente', value: security.issuer },
    { label: 'Segmento', value: security.segment },
    { label: 'Politica di distribuzione dividendi', value: security.dividendPolicy },
    { label: 'ISIN', value: security.isin },
  ];
}

/**
 * Ricerca titoli per ISIN nella veste del libro mastro (US-007/US-008/US-025):
 * il markup che stava in `SecuritySearchPage` fino a US-055, spostato qui
 * senza una virgola di differenza. La pagina resta il dispatcher fra questa
 * resa e `RicercaQuadro`, sullo stesso modello di `DashboardPage` →
 * `DashboardMastro`/`DashboardQuadro`.
 */
export default function RicercaMastro({
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
  return (
    <>
      <div className="sezione-titolo">
        Ricerca per ISIN
        <span className="nota">il dato proviene dalla fonte ufficiale — nessun valore inventato</span>
      </div>

      <form
        className="ricerca-isin"
        onSubmit={(e) => {
          e.preventDefault();
          void lookup(false);
        }}
      >
        <div className="campo-isin">
          <label htmlFor="isin">Codice ISIN del titolo</label>
          <input
            id="isin"
            type="text"
            value={isin}
            onChange={(e) => setIsin(e.target.value)}
            placeholder="es. IT0003128367"
            autoComplete="off"
            maxLength={12}
            disabled={status === 'loading'}
          />
        </div>
        <button type="submit" className="bottone" disabled={status === 'loading'}>
          {status === 'loading' ? 'Recupero…' : 'Recupera anagrafica'}
        </button>
      </form>

      <div className="riga-esito" role="status">
        {status === 'loading' && (
          <span className="in-attesa">
            <span className="punto"></span> Interrogazione della fonte ufficiale in corso…
          </span>
        )}
        {status === 'found' && security && (
          <>
            <span className="timbro verde">Titolo trovato</span>
            {security.name ?? searchedIsin}
            {security.price !== null && ` · ${formatPrice(security.price, security.currency)}`}
          </>
        )}
        {status === 'notfound' && (
          <>
            <span className="timbro mancante">Dato non disponibile</span>
            nessuna corrispondenza disponibile per{' '}
            <b style={{ fontFamily: "'Courier Prime'", fontStyle: 'normal' }}>{searchedIsin}</b>
          </>
        )}
        {esito && <span>{esito}</span>}
      </div>

      {confirmation && (
        <div className="avviso-conferma" role="alertdialog" aria-label="Conferma nuova ricerca">
          <p>{confirmation.message}</p>
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
            <button type="button" className="bottone secondario" onClick={() => setConfirmation(null)}>
              Annulla
            </button>
          </div>
        </div>
      )}

      {status === 'loading' && (
        <>
          <div className="sezione-titolo">
            Anagrafica recuperata
            <span className="nota">attendere il responso della fonte</span>
          </div>
          <div className="anagrafica" aria-hidden="true">
            {campiAnagrafica({
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
            }).map((c) => (
              <div key={c.label} className="voce-def">
                <span className="et">{c.label}</span>
                <span className="dato">
                  <span className="scheletro"></span>
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {status === 'found' && security && (
        <>
          <div className="sezione-titolo">
            Anagrafica recuperata
            <span className="nota">dati ufficiali alla fonte</span>
          </div>
          <div className="anagrafica">
            {campiAnagrafica(security).map((c) => (
              <div key={c.label} className="voce-def">
                <span className="et">{c.label}</span>
                {c.value !== null ? (
                  <span className="dato">{c.value}</span>
                ) : (
                  <span className="dato assente">Dato non disponibile</span>
                )}
              </div>
            ))}
          </div>
          <div className="fonte-prezzo">
            <span>
              {dataSource === 'morningstar' ? (
                <>
                  Fonte: <b>MorningStar (backup)</b>
                </>
              ) : (
                <>
                  Fonte: <b>Borsa Italiana</b>
                </>
              )}
            </span>
            {formatRilevazione(lastFetchedAt) && (
              <span>
                Prezzo rilevato il <b>{formatRilevazione(lastFetchedAt)}</b>
              </span>
            )}
          </div>
          <div className="bottoni" style={{ marginTop: '28px' }}>
            <button
              type="button"
              className="bottone"
              data-testid="btn-aggiungi-portafoglio"
              aria-haspopup="dialog"
              onClick={() => setDialogOpen(true)}
            >
              ⊕&ensp;Aggiungi a Portafoglio
            </button>
          </div>
        </>
      )}

      {status === 'notfound' && (
        <>
          <div className="sezione-titolo">Esito della ricerca</div>
          <div className="riquadro-vuoto">
            <span className="timbro mancante" style={{ fontSize: '13px' }}>
              Dato non disponibile
            </span>
            <h3>Titolo non reperito</h3>
            <p>
              Il codice ISIN inserito non corrisponde ad alcun titolo presso la fonte ufficiale, oppure i
              dati non sono al momento disponibili.
            </p>
            <p>
              Verifica il codice (deve avere 12 caratteri) e riprova. PortfolIA non mostra mai
              denominazioni, prezzi o valori stimati o inventati.
            </p>
          </div>
        </>
      )}

      {dialogOpen && status === 'found' && security && (
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
