import type { PuntoSerie } from '@portfolia/shared';
import {
  RILEVAZIONI_MINIME_VARIAZIONE,
  calcolaVariazionePeriodo,
  definizioneScala,
  giornoCivilePunto,
} from '@portfolia/shared';
import type { ContestoSottoIlGrafico } from './GraficoTitolo.js';
import {
  classeSegno,
  dataCarico,
  importo,
  importoConSegno,
  percentualeConSegno,
  prezzo,
  segnoDi,
} from './Foglio.js';

/**
 * Props della bilancia a due piatti (US-038).
 *
 * Del contesto che il grafico consegna si prendono i **due soli** campi che
 * queste metriche leggono: la scala vive come stato di `GraficoTitolo` (US-037)
 * e i fatti della posizione stanno in `SchedaTitolo`, e una superficie
 * dichiarata più larga di quella usata farebbe credere a una dipendenza che non
 * c'è.
 *
 * I campi della posizione arrivano **così come il server li ha calcolati**
 * (`detail.*`): il client non rifà alcun conto. È così che il criterio «il P&L
 * coincide con la Differenza di *Posizione a conto*» diventa vero **per
 * costruzione** invece che per una formula ripetuta bene — due letture della
 * stessa variabile non possono divergere, due letture di due formule uguali sì.
 */
export interface MetricheTitoloProps extends Pick<ContestoSottoIlGrafico, 'punti' | 'scala'> {
  /** `detail.difference`: la stessa variabile che alimenta la casella «Differenza». */
  difference: number | null;
  /** `detail.differencePercent`, `null` quando non è calcolabile. */
  differencePercent: number | null;
  /** `detail.totalQuantity`. */
  totalQuantity: number;
  /**
   * `detail.avgLoadPrice`: la media **ponderata** che il server calcola. `null` da
   * US-042 a quantità residua nulla, dove non esiste un residuo su cui calcolarla.
   */
  avgLoadPrice: number | null;
  /** `detail.totalLoadValue`. */
  totalLoadValue: number;
  /** `detail.currentPrice`, `null` quando il prezzo non è in archivio. */
  currentPrice: number | null;
  /** Quanti carichi compongono la posizione: `detail.loads.length`. */
  numeroCarichi: number;
  /** Simbolo della valuta di denominazione; l'euro è la valuta del registro. */
  simboloValuta?: string;
}

/** Il giorno di un punto, scritto con il formattatore della tabella dei carichi. */
function dataPunto(punto: Pick<PuntoSerie, 'at' | 'origin'>): string {
  return dataCarico(giornoCivilePunto(punto));
}

/** Conteggio con separatore delle migliaia, es. "1.785". */
function conteggio(valore: number): string {
  return valore.toLocaleString('it-IT', { maximumFractionDigits: 6 });
}

/**
 * Le due metriche del titolo, sotto il grafico (US-038, FR-011, FR-012).
 *
 * La forma è quella dei mockup `docs/mockups/US-038/`: una **bilancia a due
 * piatti** il cui perno non equilibra ma separa, e porta il segno `≠`. A
 * sinistra il P&L da carico — quanto vale oggi il denaro speso — a destra la
 * variazione di periodo — quanto si è mosso il titolo dentro la finestra scelta.
 * Sono due fatti veri insieme, e il difetto che questo componente deve rendere
 * impossibile è che si sommino, si confrontino o si scambino l'uno per l'altro:
 * per questo ciascun piatto dichiara **su che cosa** è calcolato e **se dipende
 * dalla scala**.
 *
 * Due divergenze deliberate dai mockup, entrambe a favore dei criteri:
 *
 * - il piatto senza dato **non porta alcuna cifra**. Il mockup
 *   `variazione-non-disponibile.html` mostra un «−€ 0,00» barrato accanto alla
 *   scritta «mai zero»: è un espediente didattico che spiega il divieto
 *   *mostrando* ciò che si vieta, ma in pagina scriverebbe sullo schermo proprio
 *   le cifre che il criterio 4 proibisce, e nessuna asserzione potrebbe
 *   distinguerle da uno zero affermato. Restano il timbro e le ragioni;
 * - l'elenco delle ragioni non cita la rilevazione *precedente* alla finestra: è
 *   un fatto della serie intera, e questo componente riceve per contratto il solo
 *   ritaglio. Dichiarare un dato che non si possiede sarebbe la stessa colpa che
 *   la spec combatte.
 */
export default function MetricheTitolo({
  punti,
  scala,
  difference,
  differencePercent,
  totalQuantity,
  avgLoadPrice,
  totalLoadValue,
  currentPrice,
  numeroCarichi,
  simboloValuta = '€',
}: MetricheTitoloProps) {
  const etichettaScala = definizioneScala(scala).etichetta.toLowerCase();

  // ─── Piatto 1 · P&L da carico ──────────────────────────────────────────────
  // Nessun ricalcolo: si mostra ciò che il server ha già prodotto.
  const pnlDisponibile = difference !== null;

  // ─── Piatto 2 · variazione di periodo ──────────────────────────────────────
  // Il conto vive nel dominio condiviso e adopera le sole rilevazioni comprese
  // nel ritaglio: i prezzi di carico dicono quanto ha pagato l'utente, non a
  // quanto il mercato scambiava il titolo.
  const variazione = calcolaVariazionePeriodo({ punti });
  const carichiInFinestra = punti.filter((p) => p.origin === 'carico').length;

  return (
    <>
      <div className="bilancia" data-testid="metriche-titolo" data-scala={scala}>
        <div className="intestazione-bilancia">
          <span>Le due misure &mdash; e su che cosa sono calcolate</span>
          <span className="chiosa">stessa scheda, stesso titolo, due domande diverse</span>
        </div>

        {/* ---------- Piatto 1 · P&L da carico ---------- */}
        <div
          className={`piatto pnl${pnlDisponibile ? '' : ' assente'}`}
          data-testid="pnl-da-carico"
          data-stato={pnlDisponibile ? 'disponibile' : 'non-disponibile'}
        >
          <div className="testa-piatto">
            <span className="et-piatto">P&amp;L da carico</span>
            <span className="unita">
              sull&rsquo;intera posizione &middot; <b>{conteggio(totalQuantity)}</b>{' '}
              {totalQuantity === 1 ? 'quota' : 'quote'} &middot;{' '}
              {numeroCarichi === 1 ? (
                <>l&rsquo;unico carico</>
              ) : (
                <>
                  tutti e <b>{conteggio(numeroCarichi)}</b> i carichi
                </>
              )}
            </span>
          </div>

          {difference !== null ? (
            <>
              <div className="cifre">
                <span
                  className={`importo ${classeSegno(difference)}`}
                  data-testid="pnl-da-carico-valore"
                >
                  {importoConSegno(difference, simboloValuta)}
                </span>
                <span
                  className={`percento ${classeSegno(difference)}`}
                  data-testid="pnl-da-carico-percentuale"
                >
                  {differencePercent !== null
                    ? percentualeConSegno(differencePercent)
                    : 'percentuale non calcolabile'}
                </span>
              </div>

              <p className="provenienza">
                <span className="et-prov">Da dove viene questo numero</span>
                <span className="passo">
                  prezzo medio di carico{' '}
                  <b>
                    {avgLoadPrice !== null ? (
                      <>
                        {simboloValuta}&thinsp;{prezzo(avgLoadPrice)}
                      </>
                    ) : (
                      <span className="dato-mancante">non disponibile</span>
                    )}
                  </b>{' '}
                  su{' '}
                  <b>{conteggio(totalQuantity)}</b> {totalQuantity === 1 ? 'quota' : 'quote'}
                </span>
                <span className="freccia">&rarr;</span>
                <span className="passo">
                  prezzo attuale{' '}
                  <b>
                    {simboloValuta}&thinsp;
                    {currentPrice !== null ? prezzo(currentPrice) : '—'}
                  </b>
                </span>
                <span className="coda">
                  media <b>ponderata sulle quantit&agrave;</b> dei carichi iscritti, non media
                  semplice dei prezzi d&rsquo;acquisto &middot; carico complessivo {simboloValuta}
                  &thinsp;{importo(totalLoadValue)}
                </span>
              </p>

              <p className="rimando-differenza" data-testid="rimando-differenza">
                <span className="croce">&#8225;</span>
                <span>
                  Stessa cifra della &laquo;Differenza&raquo; in <em>Posizione a conto</em>, in cima
                  alla scheda: &egrave; la medesima lettura, non un secondo conto.
                </span>
              </p>
            </>
          ) : (
            <>
              <span className="timbro-piatto" data-testid="pnl-non-disponibile">
                Dato non disponibile
              </span>
              <p className="perche-assente">
                <span className="et-perche">Perch&eacute; il dato non c&rsquo;&egrave;</span>
                Il prezzo attuale di questo titolo non risulta in archivio, e senza di esso non
                c&rsquo;&egrave; nulla da confrontare con il prezzo di carico. La posizione resta
                nota &mdash; <b>{conteggio(totalQuantity)}</b>{' '}
                {totalQuantity === 1 ? 'quota' : 'quote'}{' '}
                {avgLoadPrice !== null ? (
                  <>
                    a {simboloValuta}&thinsp;{prezzo(avgLoadPrice)} di media ponderata,
                  </>
                ) : (
                  <>senza un prezzo medio di carico &mdash; la posizione &egrave; azzerata &mdash;</>
                )}{' '}
                carico {simboloValuta}&thinsp;
                {importo(totalLoadValue)} &mdash; ma il
                guadagno no: uno zero al suo posto affermerebbe di non aver guadagnato n&eacute;
                perso, che &egrave; cosa diversa dal non saperlo (ADR&#8209;003).
              </p>
            </>
          )}

          <p className="orizzonte-piatto">
            <span className="segna-orizzonte fisso" data-testid="orizzonte-pnl">
              non dipende dalla scala
            </span>
            <span>
              Cambiando i cinque bottoni qui sopra questo riquadro non si muove di un centesimo:
              cambia solo se registri un nuovo carico o se il prezzo attuale viene aggiornato.
            </span>
          </p>
        </div>

        {/* ---------- Il perno: non un fulcro, un «≠» ---------- */}
        <div className="fulcro" aria-hidden="true">
          <span className="segno">&ne;</span>
        </div>

        {/* ---------- Piatto 2 · variazione di periodo ---------- */}
        <div
          className={`piatto periodo${variazione.stato === 'disponibile' ? '' : ' assente'}`}
          data-testid="variazione-periodo"
          data-stato={variazione.stato}
          data-rilevazioni={variazione.rilevazioniComprese}
        >
          <div className="testa-piatto">
            <span className="et-piatto">Variazione di periodo</span>
            <span className="unita">
              sul prezzo unitario &middot; <b>1</b> quota &middot; finestra <b>{etichettaScala}</b>
            </span>
          </div>

          {variazione.stato === 'disponibile' ? (
            <>
              <div className="cifre">
                <span
                  className={`importo ${classeSegno(variazione.valore)}`}
                  data-testid="variazione-periodo-valore"
                >
                  {/* Quattro decimali e non due: è un prezzo **unitario**, e va
                      scritto come tutti gli altri prezzi unitari della scheda. */}
                  {`${segnoDi(variazione.valore)}${simboloValuta} ${prezzo(Math.abs(variazione.valore))}`}
                </span>
                <span
                  className={`percento ${classeSegno(variazione.valore)}`}
                  data-testid="variazione-periodo-percentuale"
                >
                  {variazione.percentuale !== null
                    ? percentualeConSegno(variazione.percentuale)
                    : 'percentuale non calcolabile'}
                </span>
              </div>

              <p className="provenienza">
                <span className="et-prov">Da dove viene questo numero</span>
                <span className="passo">
                  prima rilevazione del <b>{dataPunto(variazione.prima)}</b> &nbsp;
                  <b>
                    {simboloValuta}&thinsp;{prezzo(variazione.prima.price)}
                  </b>
                </span>
                <span className="freccia">&rarr;</span>
                <span className="passo">
                  ultima del <b>{dataPunto(variazione.ultima)}</b> &nbsp;
                  <b>
                    {simboloValuta}&thinsp;{prezzo(variazione.ultima.price)}
                  </b>
                </span>
                <span className="coda">
                  {conteggio(variazione.giorni)} {variazione.giorni === 1 ? 'giorno' : 'giorni'} fra
                  i due capi &nbsp;&middot;&nbsp; {conteggio(variazione.rilevazioniComprese)}{' '}
                  {/* Sempre plurale: su questo ramo le rilevazioni sono almeno due. */}
                  rilevazioni comprese nella finestra, nessun prezzo di carico
                  {carichiInFinestra > 0 && (
                    <>
                      {' '}
                      &mdash; i <b>{conteggio(carichiInFinestra)}</b> che vi cadono dentro restano
                      fuori dal conto
                    </>
                  )}
                </span>
              </p>
            </>
          ) : (
            <>
              <span className="timbro-piatto" data-testid="variazione-non-disponibile">
                Dato non disponibile
              </span>

              {/* Un `div` e non un `p` come nel mockup: l'elenco delle ragioni è
                  una `ul`, che dentro un paragrafo il browser chiuderebbe
                  d'autorità — spostando le ragioni **fuori** dal riquadro che le
                  incornicia. */}
              <div className="perche-assente">
                <span className="et-perche">Perch&eacute; il dato non c&rsquo;&egrave;</span>
                Per misurare un movimento servono due capi: uno da cui partire e uno a cui arrivare.
                Nella finestra chiesta &mdash; <b>{etichettaScala}</b> &mdash; l&rsquo;archivio non
                ne possiede abbastanza.
                <ul className="elenco-perche">
                  <li data-testid="conteggio-rilevazioni">
                    Rilevazioni comprese: <b>{conteggio(variazione.rilevazioniComprese)}</b>
                    {variazione.unica !== null && (
                      <>
                        {' '}
                        &mdash; quella del <b>{dataPunto(variazione.unica)}</b>,{' '}
                        <b>
                          {simboloValuta}&thinsp;{prezzo(variazione.unica.price)}
                        </b>
                      </>
                    )}
                    {/* La soglia si legge dalla costante che la guardia applica:
                        il testo a schermo e la regola devono restare lo stesso
                        fatto, non due numeri scritti in due posti. */}
                    . Ne servono almeno <b>{RILEVAZIONI_MINIME_VARIAZIONE}</b>.
                  </li>
                  <li>
                    {carichiInFinestra > 0 ? (
                      <>
                        I <b>{conteggio(carichiInFinestra)}</b> prezzi di carico compresi nella
                        finestra non entrano nel conto
                      </>
                    ) : (
                      <>I prezzi di carico non entrano nel conto</>
                    )}{' '}
                    &mdash; n&eacute; qui n&eacute; altrove. Un prezzo di carico dice quanto hai
                    pagato <em>tu</em>, non a quanto il mercato scambiava il titolo: metterlo in
                    questa formula misurerebbe le tue decisioni, non il movimento del titolo.
                  </li>
                  <li>
                    Il riquadro resta perci&ograve; senza cifra. Uno zero direbbe &laquo;il prezzo
                    non si &egrave; mosso&raquo;, e non &egrave; ci&ograve; che l&rsquo;archivio sa:
                    sa di <em>non sapere</em> (ADR&#8209;003).
                  </li>
                </ul>
              </div>
            </>
          )}

          <p className="orizzonte-piatto">
            <span className="segna-orizzonte mobile" data-testid="orizzonte-variazione">
              cambia con la scala
            </span>
            <span>
              &Egrave; la finestra a decidere quali rilevazioni entrano nel conto: scegli
              un&rsquo;altra scala e i due capi cambiano, perch&eacute; cambia il periodo &mdash; non
              il tuo guadagno.
            </span>
          </p>
        </div>
      </div>

      {/* ---------- La postilla: non sono la stessa cosa ---------- */}
      <p className="postilla-bilancia" data-testid="postilla-metriche">
        <span className="glifo-postilla">&ne;</span>
        <span>
          Le due cifre <span className="mai">non si sommano e non si confrontano</span>. Il{' '}
          <b>P&amp;L da carico</b> dice quanto vale oggi il denaro che hai speso: guarda al{' '}
          <em>prezzo che hai pagato</em>, e non sa nulla della finestra scelta. La{' '}
          <b>variazione di periodo</b> dice quanto si &egrave; mosso il prezzo del titolo dentro la
          finestra che stai guardando: guarda alle <em>rilevazioni</em>, e non sa nulla di quanto hai
          speso n&eacute; di quante quote possiedi. Un titolo pu&ograve; essere insieme in guadagno
          da carico e in calo nell&rsquo;ultimo anno: sono due fatti veri insieme, e sarebbe un
          errore leggere il secondo come una perdita sul portafoglio.
        </span>
      </p>
    </>
  );
}
