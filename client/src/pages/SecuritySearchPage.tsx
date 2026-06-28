import { useState } from 'react';
import { Link } from 'react-router-dom';
import { isValidIsin, normalizeIsin } from '@portfolia/shared';
import type { SecurityInfo, SecurityLookupResponse, RefetchConfirmation } from '@portfolia/shared';
import Foglio, { dataRegistro } from '../components/Foglio.js';

type Status = 'idle' | 'loading' | 'found' | 'notfound' | 'error';

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

export default function SecuritySearchPage() {
  const [isin, setIsin] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [security, setSecurity] = useState<SecurityInfo | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null);
  const [confirmation, setConfirmation] = useState<RefetchConfirmation | null>(null);
  const [esito, setEsito] = useState<string | null>(null);
  const [searchedIsin, setSearchedIsin] = useState('');

  async function lookup(force: boolean) {
    const normalized = normalizeIsin(isin);
    if (!isValidIsin(normalized)) {
      setStatus('idle');
      setSecurity(null);
      setConfirmation(null);
      setEsito('Codice ISIN non valido: servono 12 caratteri (2 lettere paese + alfanumerici + cifra di controllo).');
      return;
    }

    setStatus('loading');
    setConfirmation(null);
    setEsito(null);
    setSearchedIsin(normalized);

    try {
      const url = `/api/securities/${normalized}${force ? '?force=true' : ''}`;
      const res = await fetch(url);

      if (res.status === 400) {
        setStatus('idle');
        const data = (await res.json()) as { error: string };
        setEsito(data.error);
        return;
      }
      if (res.status === 404) {
        setStatus('notfound');
        setSecurity(null);
        return;
      }
      if (res.status === 502) {
        setStatus('error');
        setEsito('La fonte ufficiale non è al momento raggiungibile. Riprova più tardi.');
        return;
      }
      if (!res.ok) {
        setStatus('error');
        setEsito('Errore inatteso durante il recupero. Riprova.');
        return;
      }

      const body = (await res.json()) as SecurityLookupResponse;
      setSecurity(body.security);
      setLastFetchedAt(body.lastFetchedAt);
      setConfirmation(body.confirmation ?? null);
      setStatus('found');
    } catch {
      setStatus('error');
      setEsito('Backend non raggiungibile.');
    }
  }

  const linguette = (
    <>
      <Link to="/">Portafogli</Link>
      <a className="disabilitata">Riepilogo</a>
      <a className="attiva">Ricerca titoli</a>
      <a className="disabilitata">Scheda titolo</a>
    </>
  );

  const registro = (
    <>
      <div>Modulo <b>n. 07/A</b></div>
      <div>Epica <b>EP-002</b></div>
      <div>Consultato il <b>{dataRegistro(Date.now())}</b></div>
    </>
  );

  return (
    <Foglio
      marchio="Ricerca titoli · anagrafica e prezzo"
      titolo="Cerca un titolo "
      titoloCorsivo="per ISIN"
      sottotesto="Digita il codice ISIN e recupera i dati ufficiali da Borsa Italiana"
      registro={registro}
      linguette={linguette}
    >
      <div className="sezione-titolo">
        Ricerca per ISIN
        <span className="nota">il dato proviene da Borsa Italiana — nessun valore inventato</span>
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
            nessuna corrispondenza su Borsa Italiana per{' '}
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
              Fonte: <b>Borsa Italiana</b>
            </span>
            {formatRilevazione(lastFetchedAt) && (
              <span>
                Prezzo rilevato il <b>{formatRilevazione(lastFetchedAt)}</b>
              </span>
            )}
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
    </Foglio>
  );
}
