import { useCallback, useEffect, useRef, useState } from 'react';
import type { DataSource, PositionDetail, RefetchConfirmation } from '@portfolia/shared';
import { dataRegistro } from './Foglio.js';
import { recuperaTitolo } from '../domain/recuperoTitolo.js';

interface SchedaTitoloProps {
  /** Portafoglio a cui il titolo è iscritto. */
  portfolioId: string;
  /** ISIN del titolo di cui mostrare il dettaglio. */
  isin: string;
  /**
   * Notifica un aggiornamento dei dati andato a buon fine (US-030).
   *
   * Serve a chi mostra anche il riepilogo del portafoglio: il prezzo appena
   * rilevato cambia valore attuale e differenza di *tutte* le viste, non solo
   * di questa scheda. Non viene invocata quando la guardia chiede conferma né
   * quando nessuna fonte ha risposto: in entrambi i casi l'archivio è intatto.
   */
  onDatiAggiornati?: () => void;
}

/** Esito dichiarato dell'ultimo aggiornamento richiesto dall'utente. */
type EsitoAggiornamento =
  | { tipo: 'in-corso' }
  | { tipo: 'riuscito'; fonte: string | null; prezzo: string | null }
  | { tipo: 'fallito'; motivo: string };

/** Come si chiama una fonte in pagina; `null` quando l'archivio non la registra. */
function nomeFonte(dataSource: DataSource | null): string | null {
  if (dataSource === 'morningstar') return 'MorningStar (backup)';
  if (dataSource === 'borsaitaliana') return 'Borsa Italiana';
  return null;
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

/** Giorno della settimana di una rilevazione, es. "lunedì". */
function giornoSettimana(observedAt: number): string {
  return new Date(observedAt * 1000).toLocaleDateString('it-IT', { weekday: 'long' });
}

/** Cifra con due decimali all'italiana, es. "28.261,20". */
function importo(valore: number): string {
  return valore.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Prezzo unitario a quattro decimali, es. "68,3000". */
function prezzo(valore: number): string {
  return valore.toLocaleString('it-IT', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

/** Simbolo della valuta di denominazione; l'euro è la valuta del registro. */
function simboloDi(currency: string | null): string {
  return currency === 'USD' ? '$' : currency === 'GBP' ? '£' : '€';
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
 * Quattro sezioni: il cartellino della posizione a conto, l'anagrafica ufficiale
 * con la riga di provenienza del dato (FR-021) e l'elenco dei carichi registrati
 * — come da mockup `docs/mockups/US-018/index.html` — seguiti dallo storico dei
 * prezzi osservati (US-009, `docs/mockups/US-009/index.html` e
 * `prima-osservazione.html`). Lo storico è una lettura d'archivio come tutto il
 * resto della scheda: mostra le rilevazioni che gli aggiornamenti già esistenti
 * hanno prodotto, senza provocarne di nuove.
 *
 * Dalla riga di provenienza si può chiedere l'aggiornamento dei dati (US-030):
 * è l'unica azione della scheda che contatta la fonte, e passa dallo stesso
 * endpoint e dalla stessa guardia della Ricerca titoli — un archivio solo, una
 * guardia sola. Vedi `docs/mockups/US-030/stati-riga-fonte.html` per i sei
 * stati della riga e `docs/mockups/US-018/dati-mancanti.html` per la variante
 * senza anagrafica.
 */
export default function SchedaTitolo({ portfolioId, isin, onDatiAggiornati }: SchedaTitoloProps) {
  const [detail, setDetail] = useState<PositionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ─── Aggiornamento dei dati dalla riga di provenienza (US-030) ─────────────
  const [esito, setEsito] = useState<EsitoAggiornamento | null>(null);
  const [conferma, setConferma] = useState<RefetchConfirmation | null>(null);
  const [appenaAggiornato, setAppenaAggiornato] = useState(false);

  /**
   * ISIN attualmente in pagina. Un aggiornamento può restare in volo una decina
   * di secondi, abbastanza perché l'utente torni al riepilogo e apra un altro
   * titolo: alla risposta si confronta questo riferimento, e se il titolo è
   * cambiato la risposta viene lasciata cadere. Senza, la scheda del titolo
   * nuovo mostrerebbe i valori di quello vecchio — un dato falso indistinguibile
   * da uno vero.
   */
  const isinMostrato = useRef(isin);
  useEffect(() => {
    isinMostrato.current = isin;
  }, [isin]);

  /** Legge il dettaglio dal server. Solleva con il messaggio da mostrare. */
  const leggiDettaglio = useCallback(async (): Promise<PositionDetail> => {
    const res = await fetch(`/api/portfolios/${portfolioId}/positions/${isin}/detail`);
    if (!res.ok) {
      const dati = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(dati?.error ?? 'Impossibile leggere il dettaglio del titolo.');
    }
    return (await res.json()) as PositionDetail;
  }, [portfolioId, isin]);

  useEffect(() => {
    let annullato = false;
    setLoading(true);
    setError(null);
    setDetail(null);
    // Il verdetto di un aggiornamento vale per il titolo che lo ha richiesto:
    // cambiando titolo va via con lui.
    setEsito(null);
    setConferma(null);
    setAppenaAggiornato(false);

    leggiDettaglio()
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
  }, [leggiDettaglio]);

  /**
   * Chiede alla fonte i dati aggiornati del titolo e rilegge il dettaglio.
   *
   * `loading` resta falso per tutta l'attesa: i valori d'archivio restano a
   * schermo, dichiarati come tali dalla riga d'esito. Con la fonte di backup
   * l'interrogazione arriva a una decina di secondi, e una scheda vuota per
   * tutto quel tempo sarebbe una regressione rispetto a US-018.
   *
   * Il ricalcolo di valore attuale e differenza non avviene qui: la formula
   * vive sul server, e rileggere l'endpoint di dettaglio è l'unico modo per non
   * duplicarla nel client.
   */
  async function aggiornaDati(force: boolean): Promise<void> {
    setConferma(null);
    setAppenaAggiornato(false);
    setEsito({ tipo: 'in-corso' });

    /** L'utente ha cambiato titolo mentre la fonte rispondeva? */
    const titoloAbbandonato = () => isinMostrato.current !== isin;

    // L'interrogazione e la lettura del suo esito vivono in un posto solo
    // (`domain/recuperoTitolo`), condiviso con l'aggiornamento in blocco del
    // riepilogo (US-035). Le frasi qui sotto restano invece di questa scheda:
    // dicono che cosa succede *ai dati in scheda*, cosa che il consuntivo di un
    // lavoro su più titoli non potrebbe affermare.
    const recupero = await recuperaTitolo(isin, force);
    if (titoloAbbandonato()) return;

    if (recupero.tipo === 'non-trovato') {
      setEsito({
        tipo: 'fallito',
        motivo: 'Nessuna delle due fonti ha trovato il titolo. I dati in scheda restano quelli in archivio.',
      });
      return;
    }
    if (recupero.tipo === 'fonte-muta') {
      setEsito({
        tipo: 'fallito',
        motivo: 'Nessuna delle due fonti ha risposto. I dati in scheda restano quelli già rilevati.',
      });
      return;
    }
    if (recupero.tipo === 'errore') {
      setEsito({
        tipo: 'fallito',
        motivo: recupero.rete
          ? 'Backend non raggiungibile. I dati in scheda restano quelli già rilevati.'
          : 'Errore inatteso durante l’aggiornamento. I dati in scheda restano quelli già rilevati.',
      });
      return;
    }

    // La guardia ha risposto dalla cache senza contattare la fonte: nulla è
    // cambiato in archivio, e la decisione di procedere spetta all'utente.
    if (recupero.tipo === 'guardia') {
      setConferma(recupero.conferma);
      setEsito(null);
      return;
    }

    try {
      const aggiornato = await leggiDettaglio();
      if (titoloAbbandonato()) return;

      setDetail(aggiornato);
      setAppenaAggiornato(true);
      setEsito({
        tipo: 'riuscito',
        // La fonte dichiarata è quella della riga appena riletta, la stessa che
        // valorizza il timbro di provenienza: due letture diverse dello stesso
        // fatto potrebbero divergere, e una di loro sarebbe falsa.
        fonte: nomeFonte(aggiornato.dataSource),
        prezzo:
          aggiornato.currentPrice !== null
            ? `${simboloDi(aggiornato.currency)} ${prezzo(aggiornato.currentPrice)}`
            : null,
      });
      onDatiAggiornati?.();
    } catch {
      if (titoloAbbandonato()) return;
      setEsito({
        tipo: 'fallito',
        motivo: 'Backend non raggiungibile. I dati in scheda restano quelli già rilevati.',
      });
    }
  }

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
  const numeroOsservazioni = detail.priceHistory.length;
  const inGuadagno = detail.difference !== null && detail.difference >= 0;
  const simboloValuta = simboloDi(detail.currency);
  const inAttesa = esito?.tipo === 'in-corso';

  /**
   * Il comando di aggiornamento, così com'è dentro la riga di provenienza.
   *
   * Cambia verbo quando la fonte non è registrata: lì non c'è nulla da
   * rinfrescare, c'è un'anagrafica da compilare. Resta disabilitato mentre la
   * fonte è interrogata e mentre la guardia attende una decisione.
   */
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

      {/* Provenienza del dato — FR-021 — e comando di aggiornamento (US-030) */}
      {detail.dataSource === null ? (
        <div className="riga-fonte ignota" data-testid="fonte-dato">
          <span className="timbro-fonte ignota">Fonte non registrata</span>
          <span>Nessun recupero dalla fonte risulta in archivio per questo ISIN.</span>
          {comandoAggiorna}
        </div>
      ) : (
        <div className={`riga-fonte${detail.dataSource === 'morningstar' ? ' di-backup' : ''}`} data-testid="fonte-dato">
          <span className={`timbro-fonte${detail.dataSource === 'morningstar' ? ' di-backup' : ''}`}>
            {detail.dataSource === 'morningstar' ? 'Fonte di backup' : 'Fonte primaria'}
          </span>
          <span>
            Fonte: <b>{nomeFonte(detail.dataSource)}</b>
          </span>
          {detail.fetchedAt !== null && (
            <span>
              Rilevato il{' '}
              <b className={appenaAggiornato ? 'appena-aggiornato' : undefined} data-testid="istante-rilevazione">
                {dataRilevazione(detail.fetchedAt)}
              </b>
            </span>
          )}
          {comandoAggiorna}
        </div>
      )}

      {/* Esito dell'aggiornamento: una riga in più, mai un valore al posto di
          un altro. Sul ramo negativo fonte e istante restano i precedenti,
          perché l'archivio non è stato riscritto. */}
      {esito !== null && (
        <div
          className={`esito-aggiornamento${esito.tipo === 'fallito' ? ' negativo' : ''}`}
          data-testid="esito-aggiornamento"
          role={esito.tipo === 'fallito' ? 'alert' : 'status'}
        >
          {esito.tipo === 'in-corso' && (
            <>
              <span className="timbro-esito">In attesa</span>
              <span>
                Interrogazione della fonte in corso &mdash; la fonte di backup pu&ograve; richiedere fino a
                una decina di secondi.
              </span>
            </>
          )}
          {esito.tipo === 'riuscito' && (
            <>
              <span className="timbro-esito">Dati aggiornati</span>
              <span>
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
              </span>
            </>
          )}
          {esito.tipo === 'fallito' && (
            <>
              <span className="timbro-esito">Aggiornamento non riuscito</span>
              <span>{esito.motivo}</span>
            </>
          )}
        </div>
      )}

      {/* Guardia di buona cittadinanza: lo stesso avviso, lo stesso testo e lo
          stesso archivio della Ricerca titoli. */}
      {conferma !== null && (
        <div className="avviso-conferma" role="alertdialog" aria-label="Conferma aggiornamento" data-testid="avviso-conferma-aggiornamento">
          <p>{conferma.message}</p>
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
            <button type="button" className="bottone secondario" onClick={() => setConferma(null)}>
              Annulla
            </button>
          </div>
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

      {/* ===== 4. Storico prezzi (US-009, FR-018) ===== */}
      <div className="sezione-titolo">
        Storico prezzi
        <span className="nota">
          FR-018 &middot; le quotazioni gi&agrave; rilevate &middot; nessuna richiesta in pi&ugrave;
          alla fonte
        </span>
      </div>

      <div className="tabella-scroll">
        <table
          className="mastro"
          data-testid="tabella-storico-prezzi"
          aria-label="Storico dei prezzi rilevati per questo titolo"
        >
          <thead>
            <tr>
              <th>Data di rilevamento</th>
              <th>Prezzo rilevato</th>
              <th>Fonte</th>
            </tr>
          </thead>
          <tbody>
            {/* La sezione c'è anche senza osservazioni: una tabella assente sarebbe
                indistinguibile da una funzionalità che non ha caricato. La riga
                vuota dichiara l'assenza invece di lasciarla interpretare. */}
            {numeroOsservazioni === 0 ? (
              <tr className="riga-vuota">
                <td colSpan={3} data-testid="storico-prezzi-vuoto">
                  Nessuna rilevazione registrata per questo titolo.
                </td>
              </tr>
            ) : (
              detail.priceHistory.map((osservazione, indice) => (
                <tr
                  key={`${osservazione.observedAt}-${osservazione.price}`}
                  className={indice === 0 ? 'rilevazione-ultima' : undefined}
                  data-testid={`osservazione-${indice}`}
                >
                  <td>
                    <span className="voce">
                      <strong>
                        {dataRilevazione(osservazione.observedAt)}
                        {indice === 0 && (
                          <span className="postilla-ultima">
                            {numeroOsservazioni === 1 ? 'unica' : 'ultima'}
                          </span>
                        )}
                      </strong>
                      <small>{giornoSettimana(osservazione.observedAt)}</small>
                    </span>
                  </td>
                  <td className="cifra" data-testid={`osservazione-prezzo-${indice}`}>
                    {simboloValuta} {prezzo(osservazione.price)}
                  </td>
                  <td>
                    {/* Come nel timbro di provenienza: la fonte non registrata è
                        dichiarata tale, non attribuita d'ufficio alla primaria. */}
                    {osservazione.dataSource === null ? (
                      <span className="timbro-riga ignota">Fonte non registrata</span>
                    ) : (
                      <span
                        className={`timbro-riga${osservazione.dataSource === 'morningstar' ? ' di-backup' : ''}`}
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

      {/* L'avviso di radità sta sotto la tabella, non dentro: non riguarda una
          riga, ma ciò che fra le righe manca. È la trasparenza di ADR-003
          applicata a una copertura storica parziale per costruzione. */}
      <div className="avviso-rado" data-testid="avviso-storico-rado">
        {numeroOsservazioni === 0 ? (
          <span>
            Lo storico si popola dai tuoi aggiornamenti &mdash; ricerca titolo, scheda titolo,
            aggiornamento dei titoli obsoleti. Per questo titolo nessun prezzo risulta ancora
            rilevato, e nessuna quotazione viene ricostruita.
          </span>
        ) : numeroOsservazioni === 1 ? (
          <span>
            Lo storico contiene per ora <b>una sola</b> rilevazione: <b>parte da qui</b> e cresce
            dai prossimi aggiornamenti. Non esistono quotazioni anteriori, e nessuna viene
            ricostruita.
          </span>
        ) : (
          <span>
            Lo storico registra soltanto le <b>{numeroOsservazioni}</b> quotazioni che i tuoi
            aggiornamenti hanno gi&agrave; rilevato &mdash; ricerca titolo, scheda titolo,
            aggiornamento dei titoli obsoleti. I giorni non osservati restano vuoti: PortfolIA non
            li stima e non li interpola.
          </span>
        )}
      </div>

      <p className="nota-sezione" data-testid="nota-storico-prezzi">
        {numeroOsservazioni <= 1 ? (
          <>
            Una riga sola non &egrave; un difetto della scheda: &egrave; quanto l&rsquo;archivio
            contiene. Il prossimo aggiornamento in un giorno diverso, o a un prezzo diverso,
            aggiunger&agrave; la seconda.
          </>
        ) : (
          <>
            Due rilevazioni dello stesso giorno con lo stesso prezzo contano come una sola
            osservazione; con prezzi diversi restano entrambe. Il giorno &egrave; quello civile di
            Roma.
          </>
        )}
      </p>
    </div>
  );
}
