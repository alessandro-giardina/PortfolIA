import { useEffect, useState } from 'react';
import type { PositionDetail } from '@portfolia/shared';
import { dataRegistro } from './Foglio.js';

interface SchedaTitoloProps {
  /** Portafoglio a cui il titolo è iscritto. */
  portfolioId: string;
  /** ISIN del titolo di cui mostrare il dettaglio. */
  isin: string;
}

/** Formatta un timestamp unix come "07.VIII.2026 · 09:14", nello stile del registro. */
function dataRilevazione(fetchedAt: number): string {
  const d = new Date(fetchedAt * 1000);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${dataRegistro(fetchedAt)} · ${hh}:${mm}`;
}

/** Formatta una data ISO-8601 (YYYY-MM-DD) in stile registro (es. "19.IX.2021"). */
const MESI_ROMANI = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
function dataCarico(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${String(d).padStart(2, '0')}.${MESI_ROMANI[m - 1]}.${y}`;
}

/** Cifra con due decimali all'italiana, es. "28.261,20". */
function importo(valore: number): string {
  return valore.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Prezzo unitario a quattro decimali, es. "68,3000". */
function prezzo(valore: number): string {
  return valore.toLocaleString('it-IT', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

/** Etichetta unica per ogni campo assente: la spec vieta il valore inventato. */
const NON_DISPONIBILE = 'Dato non disponibile';

/**
 * Una voce dell'anagrafica: il valore, oppure la dichiarazione di assenza.
 * `null` non diventa mai una stringa vuota né uno zero.
 */
function VoceAnagrafica({ etichetta, valore }: { etichetta: string; valore: string | null }) {
  return (
    <div className="voce-def">
      <span className="et">{etichetta}</span>
      {valore !== null && valore !== '' ? (
        <span className="dato">{valore}</span>
      ) : (
        <span className="dato assente">{NON_DISPONIBILE}</span>
      )}
    </div>
  );
}

/**
 * Scheda di dettaglio di un titolo iscritto a portafoglio (US-018, FR-014).
 *
 * Tre sezioni, come da mockup `docs/mockups/US-018/index.html`: il cartellino
 * della posizione a conto, l'anagrafica ufficiale con la riga di provenienza
 * del dato (FR-021) e l'elenco dei carichi registrati.
 *
 * La vista è di sola lettura e non contatta mai la fonte esterna: quando
 * l'anagrafica non è in archivio lo dichiara e rimanda alla ricerca titoli,
 * che è il percorso previsto per compilarla. Vedi la variante
 * `docs/mockups/US-018/dati-mancanti.html`.
 */
export default function SchedaTitolo({ portfolioId, isin }: SchedaTitoloProps) {
  const [detail, setDetail] = useState<PositionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let annullato = false;
    setLoading(true);
    setError(null);
    setDetail(null);

    fetch(`/api/portfolios/${portfolioId}/positions/${isin}/detail`)
      .then(async (res) => {
        if (!res.ok) {
          const dati = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(dati?.error ?? 'Impossibile leggere il dettaglio del titolo.');
        }
        return (await res.json()) as PositionDetail;
      })
      .then((dati) => {
        if (!annullato) setDetail(dati);
      })
      .catch((causa: Error) => {
        if (!annullato) setError(causa.message === 'Failed to fetch' ? 'Backend non raggiungibile.' : causa.message);
      })
      .finally(() => {
        if (!annullato) setLoading(false);
      });

    // Un cambio di titolo mentre la richiesta precedente è in volo non deve
    // far comparire nella scheda il dettaglio del titolo abbandonato.
    return () => {
      annullato = true;
    };
  }, [portfolioId, isin]);

  if (loading) {
    return <p className="messaggio attesa">Caricamento scheda titolo…</p>;
  }

  if (error !== null) {
    return (
      <p className="messaggio errore" role="alert" data-testid="scheda-titolo-errore">
        {error}
      </p>
    );
  }

  if (detail === null) return null;

  const numeroCarichi = detail.loads.length;
  const inGuadagno = detail.difference !== null && detail.difference >= 0;
  const simboloValuta = detail.currency === 'USD' ? '$' : detail.currency === 'GBP' ? '£' : '€';

  return (
    <div data-testid="scheda-titolo" data-isin={detail.isin}>
      {/* ===== 1. Posizione a conto ===== */}
      <div className="sezione-titolo" style={{ marginTop: '6px' }}>
        Posizione a conto
        <span className="nota">FR-014 &middot; dati della posizione nel portafoglio</span>
      </div>

      <div className="orizzonti">
        <div className="orizzonte">
          <span className="et">Quantità</span>
          <span className="valore" data-testid="dettaglio-quantita">
            {detail.totalQuantity.toLocaleString('it-IT')}
          </span>
          <span className="perc">
            su {numeroCarichi} {numeroCarichi === 1 ? 'carico' : 'carichi'}
          </span>
        </div>

        <div className="orizzonte">
          <span className="et">Valore medio di carico</span>
          <span className="valore" data-testid="dettaglio-prezzo-medio">
            € {prezzo(detail.avgLoadPrice)}
          </span>
          <span className="perc">carico € {importo(detail.totalLoadValue)}</span>
        </div>

        {/* La casella è valorizzata solo quando lo sono entrambi i campi. Il valore
            resta quello calcolato dal server — la formula vive in un posto solo —
            mentre il prezzo unitario entra nella guardia invece che in un fallback
            numerico, che sarebbe un valore inventato se l'invariante si rompesse. */}
        <div className={`orizzonte${detail.currentValue === null ? ' non-valorizzato' : ''}`}>
          <span className="et">Valore attuale</span>
          {detail.currentValue !== null && detail.currentPrice !== null ? (
            <>
              <span className="valore" data-testid="dettaglio-valore-attuale">
                € {importo(detail.currentValue)}
              </span>
              <span className="perc">
                {simboloValuta} {prezzo(detail.currentPrice)}/quota
              </span>
            </>
          ) : (
            <>
              <span className="valore assente" data-testid="dettaglio-valore-attuale">
                {NON_DISPONIBILE}
              </span>
              <span className="perc assente">prezzo non in archivio</span>
            </>
          )}
        </div>

        <div className={`orizzonte${detail.difference === null ? ' non-valorizzato' : ''}`}>
          <span className="et">Differenza</span>
          {detail.difference !== null ? (
            <>
              <span
                className={`valore ${inGuadagno ? 'guadagno' : 'perdita'}`}
                data-testid="dettaglio-differenza"
              >
                {inGuadagno ? '+' : '−'}€ {importo(Math.abs(detail.difference))}
              </span>
              <span className={`perc ${inGuadagno ? 'guadagno' : 'perdita'}`}>
                {detail.differencePercent !== null
                  ? `${inGuadagno ? '+' : '−'}${Math.abs(detail.differencePercent).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`
                  : 'percentuale non calcolabile'}
              </span>
            </>
          ) : (
            <>
              <span className="valore assente" data-testid="dettaglio-differenza">
                {NON_DISPONIBILE}
              </span>
              <span className="perc assente">non calcolabile</span>
            </>
          )}
        </div>
      </div>

      {/* ===== 2. Anagrafica ufficiale ===== */}
      <div className="sezione-titolo">
        Anagrafica ufficiale
        <span className="nota">dati come rilevati alla fonte &middot; nessun valore stimato</span>
      </div>

      <div className="anagrafica" data-testid="anagrafica-titolo">
        <VoceAnagrafica etichetta="Denominazione" valore={detail.name} />
        <VoceAnagrafica etichetta="ISIN" valore={detail.isin} />
        <VoceAnagrafica etichetta="Ticker" valore={detail.ticker} />
        <VoceAnagrafica etichetta="Tipo strumento" valore={detail.instrumentType} />
        <VoceAnagrafica etichetta="Commissioni annue" valore={detail.totalAnnualFees} />
        <VoceAnagrafica etichetta="Valuta" valore={detail.currency} />
        <VoceAnagrafica etichetta="Emittente" valore={detail.issuer} />
        <VoceAnagrafica etichetta="Segmento" valore={detail.segment} />
        <VoceAnagrafica etichetta="Politica dividendi" valore={detail.dividendPolicy} />
        <VoceAnagrafica
          etichetta="Prezzo attuale"
          valore={detail.currentPrice !== null ? `${simboloValuta} ${prezzo(detail.currentPrice)}` : null}
        />
      </div>

      {/* Provenienza del dato — FR-021 */}
      {detail.dataSource === null ? (
        <div className="riga-fonte ignota" data-testid="fonte-dato">
          <span className="timbro-fonte ignota">Fonte non registrata</span>
          <span>Nessun recupero dalla fonte risulta in archivio per questo ISIN.</span>
          <span>
            Cerca il titolo dalla <b>Ricerca titoli</b> per compilarne l&rsquo;anagrafica.
          </span>
        </div>
      ) : (
        <div className={`riga-fonte${detail.dataSource === 'morningstar' ? ' di-backup' : ''}`} data-testid="fonte-dato">
          <span className={`timbro-fonte${detail.dataSource === 'morningstar' ? ' di-backup' : ''}`}>
            {detail.dataSource === 'morningstar' ? 'Fonte di backup' : 'Fonte primaria'}
          </span>
          <span>
            Fonte: <b>{detail.dataSource === 'morningstar' ? 'MorningStar (backup)' : 'Borsa Italiana'}</b>
          </span>
          {detail.fetchedAt !== null && (
            <span>
              Rilevato il <b>{dataRilevazione(detail.fetchedAt)}</b>
            </span>
          )}
        </div>
      )}

      {/* ===== 3. Carichi registrati ===== */}
      <div className="sezione-titolo">
        Carichi registrati
        <span className="nota">le iscrizioni individuali che compongono la posizione</span>
      </div>

      <div className="tabella-scroll">
        <table className="mastro" data-testid="tabella-carichi-titolo" aria-label="Carichi registrati per questo titolo">
          <thead>
            <tr>
              <th>Data di carico</th>
              <th>Quantità</th>
              <th>Prezzo d&rsquo;acquisto</th>
              <th>Controvalore carico</th>
            </tr>
          </thead>
          <tbody>
            {detail.loads.map((carico) => (
              <tr key={carico.id} data-testid={`carico-titolo-${carico.id}`}>
                <td>
                  <span className="voce">
                    <strong>{dataCarico(carico.loadDate)}</strong>
                  </span>
                </td>
                <td className="cifra">{carico.quantity.toLocaleString('it-IT')}</td>
                <td className="cifra euro">{prezzo(carico.loadPrice)}</td>
                <td className="cifra euro">{importo(carico.loadPrice * carico.quantity)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Totale &middot; prezzo medio</td>
              <td className="cifra">{detail.totalQuantity.toLocaleString('it-IT')}</td>
              <td className="cifra euro">{prezzo(detail.avgLoadPrice)}</td>
              <td className="cifra euro">{importo(detail.totalLoadValue)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="nota-sezione">
        {detail.currentPrice !== null ? (
          <>
            Il prezzo medio di carico è la media ponderata sulle quantità dei carichi iscritti;
            il valore attuale usa il prezzo più recente rilevato alla fonte.
          </>
        ) : (
          <>
            I campi contrassegnati &laquo;{NON_DISPONIBILE}&raquo; non sono presenti in archivio:
            PortfolIA non mostra denominazioni, prezzi o valori stimati.
          </>
        )}
      </p>
    </div>
  );
}
