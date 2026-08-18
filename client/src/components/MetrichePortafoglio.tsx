import type { EnrichedPositionSummary, TitoloPortafoglio } from '@portfolia/shared';
import {
  RILEVAZIONI_MINIME_VARIAZIONE,
  calcolaScomposizioneFinestra,
  definizioneScala,
  giornoCivilePunto,
  istanteDataCivile,
} from '@portfolia/shared';
import type { ContestoSottoIlGraficoPortafoglio } from './GraficoPortafoglio.js';
import { dataCarico } from './Foglio.js';
import { classeSegno, importo, importoConSegno, percentualeConSegno, segnoDi } from '../domain/formattazione.js';

/**
 * Props della stanga a tre pesi (US-015).
 *
 * Del contesto che il grafico del portafoglio consegna si prendono i **due
 * soli** campi che questo componente legge — `punti` (già ritagliati sulla
 * finestra) e `scala` (per l'etichetta dell'orizzonte) — gemello di come
 * `MetricheTitolo` ritaglia `ContestoSottoIlGrafico` per US-038.
 *
 * `titoli` ed `enrichedPositions` non fanno parte del contesto: il grafico non
 * li possiede e non deve possederli. Arrivano da chi monta la pagina, che li
 * ha già in mano (`series` ed `enrichedPositions` di `PortfolioDetailPage`) —
 * nessuna nuova richiesta di rete.
 */
export interface MetrichePortafoglioProps
  extends Pick<ContestoSottoIlGraficoPortafoglio, 'punti' | 'scala'> {
  /**
   * Il perimetro completo del portafoglio, con carichi e vendite di ciascun
   * titolo: la stessa `series` che alimenta `GraficoPortafoglio`. Necessario
   * a `calcolaScomposizioneFinestra` per i flussi di cassa, che `punti` da
   * solo non porta.
   */
  titoli: readonly TitoloPortafoglio[];
  /**
   * Le posizioni arricchite del portafoglio, le stesse del quadro del
   * risultato (US-043): il sigillo le cita **senza ricalcolarle** — la somma
   * `realizzato + latente` è la stessa aritmetica di `QuadroRisultato`,
   * applicata alle stesse variabili, non una seconda formula che potrebbe
   * divergere.
   */
  enrichedPositions: readonly EnrichedPositionSummary[];
  /** Simbolo della valuta di denominazione; l'euro è la valuta del registro. */
  simboloValuta?: string;
}

/** Conteggio con separatore delle migliaia, es. "1.785". */
function conteggio(valore: number): string {
  return valore.toLocaleString('it-IT');
}

/** Il giorno di un punto del portafoglio, scritto con il formattatore della tabella dei carichi. */
function dataPunto(punto: { at: number; origin: 'carico' | 'vendita' | 'rilevazione' }): string {
  return dataCarico(giornoCivilePunto(punto));
}

/**
 * Quanti carichi e vendite del perimetro cadono nell'intervallo semiaperto
 * `(prima, ultima]`: la stessa regola dei capi che il dominio applica al
 * denaro, qui applicata a un conteggio — testo di cornice, non una cifra
 * dell'identità. Un conteggio sbagliato scriverebbe "2 carichi" invece di
 * "1", non farebbe divergere una cifra in euro: le somme restano quelle di
 * `calcolaScomposizioneFinestra`.
 */
function contaFlussi(
  titoli: readonly TitoloPortafoglio[],
  perimetro: ReadonlySet<string>,
  prima: number,
  ultima: number,
): { carichi: number; vendite: number } {
  let carichi = 0;
  let vendite = 0;
  for (const titolo of titoli) {
    if (!perimetro.has(titolo.isin)) continue;
    for (const carico of titolo.loads) {
      const istante = istanteDataCivile(carico.loadDate);
      if (Number.isFinite(istante) && istante > prima && istante <= ultima) carichi += 1;
    }
    for (const vendita of titolo.sales) {
      const istante = istanteDataCivile(vendita.saleDate);
      if (Number.isFinite(istante) && istante > prima && istante <= ultima) vendite += 1;
    }
  }
  return { carichi, vendite };
}

/** "1 carico" / "3 carichi", "nessuna vendita" / "1 vendita" / "2 vendite". */
function descriviFlussi(carichi: number, vendite: number): string {
  const partCarichi = carichi === 0 ? 'nessun carico' : carichi === 1 ? '1 carico' : `${conteggio(carichi)} carichi`;
  const partVendite = vendite === 0 ? 'nessuna vendita' : vendite === 1 ? '1 vendita' : `${conteggio(vendite)} vendite`;
  return `${partCarichi} · ${partVendite}`;
}

/**
 * La scomposizione della variazione del portafoglio, sotto il grafico
 * (US-015, FR-011, FR-012).
 *
 * La forma è quella dei mockup `docs/mockups/US-015/`: la **stanga a tre
 * pesi** — l'equazione incisa `variazione = versato + mercato`, il regolo che
 * ne divide la barra nei due addendi (ottone campito per il denaro versato,
 * pieno per il mercato), la base della percentuale scritta per esteso coi
 * suoi addendi, e il sigillo che cita il P&L complessivo di US-043 **senza
 * ricalcolarlo**, separato da una doppia riga e da un «≠».
 *
 * Il perimetro viene **prima** delle cifre (`calcolaScomposizioneFinestra`):
 * quando non tutti i titoli detenuti sono valorizzati, le tre cifre restano
 * scritte ma dichiarate parziali, e il riquadro del perimetro nomina chi è
 * escluso — mai in silenzio, perché il suo carico assorbito nel movimento di
 * mercato con il segno rovesciato sarebbe un guadagno o una perdita inventata.
 *
 * Sotto soglia (meno di due punti) nessuna delle tre cifre si scrive, nemmeno
 * zero: un timbro le sostituisce tutte insieme, perché sono un'identità sola.
 */
export default function MetrichePortafoglio({
  punti,
  scala,
  titoli,
  enrichedPositions,
  simboloValuta = '€',
}: MetrichePortafoglioProps) {
  const etichettaScala = definizioneScala(scala).etichetta.toLowerCase();
  const esito = calcolaScomposizioneFinestra({ punti, titoli });

  // ─── Il sigillo: il P&L complessivo di US-043, citato e non ricalcolato ───
  // Stessa aritmetica di `QuadroRisultato`, applicata alle stesse variabili:
  // due letture della stessa somma non possono divergere se sono la stessa
  // somma. La sua eventuale parzialità (prezzo corrente mancante per qualche
  // posizione) è un fatto **suo**, indipendente dal perimetro della
  // scomposizione qui sopra — due parzialità diverse, mai una media delle due.
  const realizedTotal = enrichedPositions.reduce((somma, ep) => somma + ep.realizedPnl, 0);
  const conLatente = enrichedPositions.filter((ep) => ep.latentPnl !== null);
  const missingCount = enrichedPositions.length - conLatente.length;
  const latentTotal = conLatente.reduce((somma, ep) => somma + (ep.latentPnl ?? 0), 0);
  const totalPnl = realizedTotal + latentTotal;
  const quadroParziale = missingCount > 0;

  const sigillo = (
    <div className="sigillo-non-pl">
      <span className="glifo" aria-hidden="true">
        &ne;
      </span>
      <p>
        Nessuna di queste cifre &egrave; il tuo <b>P&amp;L complessivo</b>. Dipendono dalla finestra:
        cambia scala e cambiano. Il P&amp;L complessivo &mdash; realizzato pi&ugrave; latente &mdash;
        sta nel <em>quadro del risultato</em> qui sopra, non dipende dall&rsquo;orizzonte e{' '}
        <b>non viene ricalcolato qui</b>: due letture dello stesso fatto non possono divergere, e per
        non divergere devono essere una sola.
      </p>
      <span className="pl-congelato" data-testid="rimando-quadro-risultato">
        <span className="et">P&amp;L totale &middot; US-043{quadroParziale ? ' — parziale' : ''}</span>
        <span className="cifra">{importoConSegno(totalPnl, simboloValuta)}</span>
        <span className="fisso">non dipende dalla scala, non ricalcolato qui</span>
      </span>
    </div>
  );

  // ─── Stato «non disponibile»: un timbro, mai una cifra ────────────────────
  if (esito.stato === 'non-disponibile') {
    return (
      <div className="stanga assente" data-testid="metriche-portafoglio" data-scala={scala} data-stato={esito.stato}>
        <div className="capo-stanga">
          <h2>Che cosa &egrave; successo in questa finestra</h2>
          <span className="rimando">nessuna delle tre cifre &egrave; affermabile</span>
        </div>

        <div style={{ padding: '14px 16px 0' }}>
          <span className="timbro-scomposizione" data-testid="scomposizione-non-disponibile">
            Dato non disponibile
          </span>
        </div>

        <div className="perche-assente-scomposizione">
          <span className="et-perche">Perch&eacute; il dato non c&rsquo;&egrave;</span>
          {esito.ragione === 'punti-insufficienti' ? (
            <>
              Una variazione &egrave; una differenza fra <b>due</b> capi: uno da cui partire e uno a
              cui arrivare. Nella finestra <b>{etichettaScala}</b> l&rsquo;archivio non ne possiede
              abbastanza.
              <ul>
                <li>
                  Punti compresi nella finestra: <b>{conteggio(esito.puntiCompresi)}</b>. Ne servono
                  almeno <b>{RILEVAZIONI_MINIME_VARIAZIONE}</b>: &egrave; la stessa soglia gi&agrave;
                  in uso per la variazione di periodo del singolo titolo (US&#8209;038), letta dalla
                  stessa costante e non riscritta qui con lo stesso numero.
                </li>
                <li>
                  Nessuna cifra viene scritta, <b>nemmeno zero</b>. &laquo;{simboloValuta}&thinsp;0,00&raquo;
                  affermerebbe che il portafoglio non si &egrave; mosso e che non &egrave; stato
                  versato nulla: due affermazioni, entrambe diverse dal non saperlo (ADR&#8209;003).
                </li>
                <li>
                  Nemmeno il <b>capitale netto versato</b> si scrive da solo. Sarebbe pure
                  calcolabile &mdash; i carichi e le vendite della finestra sono noti anche con un
                  punto solo &mdash; ma esporlo accanto a due caselle vuote inviterebbe a leggerlo
                  come una variazione, cio&egrave; esattamente lo scambio che questa spec esiste per
                  impedire. Le tre cifre stanno o cadono insieme, perch&eacute; sono un&rsquo;identit&agrave;
                  sola.
                </li>
              </ul>
            </>
          ) : (
            <>
              La finestra <b>{etichettaScala}</b> ha punti a sufficienza, ma nessun titolo detenuto vi
              ha un prezzo noto per intero: il perimetro su cui calcolare la scomposizione &egrave;
              vuoto.
              <ul>
                <li>
                  Punti compresi nella finestra: <b>{conteggio(esito.puntiCompresi)}</b> &mdash; non
                  &egrave; la soglia dei due capi a mancare, &egrave; il perimetro.
                </li>
                <li>
                  Nessuna cifra viene scritta: senza un solo titolo valorizzato non esiste una somma da
                  cui partire, e uno zero al suo posto affermerebbe un valore che non &egrave; stato
                  osservato.
                </li>
                <li>
                  Il rimedio &egrave; aggiornare i prezzi dei titoli detenuti (US&#8209;035), non una
                  scala diversa.
                </li>
              </ul>
            </>
          )}
        </div>

        {sigillo}
      </div>
    );
  }

  // ─── Stato «disponibile»: le tre cifre, per intero o parziali ─────────────
  const parziale = esito.perimetro === 'parziale';
  const perimetroIsin = new Set(esito.titoliCompresi.map((t) => t.isin));
  const { carichi, vendite } = contaFlussi(titoli, perimetroIsin, esito.prima.at, esito.ultima.at);

  const mercatoNegativo = esito.movimentoMercato < 0;
  const absVersato = Math.abs(esito.capitaleNettoVersato);
  const absMercato = Math.abs(esito.movimentoMercato);
  const totaleAssoluto = absVersato + absMercato;
  const percBarraVersato = totaleAssoluto > 0 ? (absVersato / totaleAssoluto) * 100 : 50;
  const percBarraMercato = totaleAssoluto > 0 ? (absMercato / totaleAssoluto) * 100 : 50;

  const suffissoParziale = parziale ? ' — parziale' : '';

  return (
    <div className="stanga" data-testid="metriche-portafoglio" data-scala={scala} data-stato={esito.stato}>
      <div className="capo-stanga">
        <h2>
          Che cosa &egrave; successo in questa finestra
          {parziale && <em> &mdash; parziale</em>}
        </h2>
        <span className="rimando">
          {parziale
            ? `calcolata su ${conteggio(esito.titoliCompresi.length)} dei ${conteggio(
                esito.titoliCompresi.length + esito.titoliEsclusi.length,
              )} titoli detenuti`
            : 'variazione del valore = capitale netto versato + movimento di mercato'}
        </span>
      </div>

      <div className="equazione">
        <div className="voce-scomposizione variazione">
          <span className="et-voce">Variazione del valore{suffissoParziale}</span>
          <span className="cifra-scomposizione neutra" data-testid="variazione-valore">
            <span className="euro">{simboloValuta}</span>
            {segnoDi(esito.variazione)}
            {importo(Math.abs(esito.variazione))}
          </span>
          <span className="verdetto-voce">
            {parziale
              ? `su ${conteggio(esito.titoliCompresi.length)} titoli di ${conteggio(
                  esito.titoliCompresi.length + esito.titoliEsclusi.length,
                )}`
              : `dal ${dataPunto(esito.prima)} al ${dataPunto(esito.ultima)}`}
          </span>
          <span className="chiosa-voce">
            Quanto &egrave; cambiato il <b>valore complessivo</b>
            {parziale ? ' sul perimetro nominato qui sotto' : ''} fra il primo e l&rsquo;ultimo
            punto della finestra: da {simboloValuta}&thinsp;{importo(esito.valoreIniziale)} a{' '}
            {simboloValuta}&thinsp;{importo(esito.valoreFinale)}. Da sola non dice <em>perch&eacute;</em>{' '}
            &mdash; ed &egrave; per questo che non compare mai da sola.
          </span>
        </div>

        <div className="operatore uguale" aria-hidden="true">
          =
        </div>

        <div className="voce-scomposizione versato">
          <span className="et-voce">Capitale netto versato{suffissoParziale}</span>
          <span className="cifra-scomposizione neutra" data-testid="capitale-netto">
            <span className="euro">{simboloValuta}</span>
            {segnoDi(esito.capitaleNettoVersato)}
            {importo(Math.abs(esito.capitaleNettoVersato))}
          </span>
          <span className="verdetto-voce">
            {descriviFlussi(carichi, vendite)}
            {parziale ? ' · sullo stesso perimetro' : ''}
          </span>
          <span className="chiosa-voce">
            Denaro <b>entrato</b> nel portafoglio dentro la finestra, al netto di quello uscito con le
            vendite. Non &egrave; un guadagno &mdash; &egrave; un bonifico.
          </span>
        </div>

        <div className="operatore" aria-hidden="true">
          +
        </div>

        <div
          className={`voce-scomposizione mercato${mercatoNegativo ? ' in-perdita' : ''}`}
          data-testid="movimento-mercato"
        >
          <span className="et-voce">Movimento di mercato{suffissoParziale}</span>
          <span
            className={`cifra-scomposizione ${classeSegno(esito.movimentoMercato)}`}
            data-testid="movimento-mercato-valore"
          >
            <span className="euro">{simboloValuta}</span>
            {segnoDi(esito.movimentoMercato)}
            {importo(Math.abs(esito.movimentoMercato))}
          </span>
          <span
            className={`percento-scomposizione ${classeSegno(esito.movimentoMercato)}`}
            data-testid="movimento-mercato-percentuale"
          >
            {esito.percentuale !== null ? percentualeConSegno(esito.percentuale) : 'percentuale non calcolabile'}
          </span>
          <span className="chiosa-voce">
            La sola parte che il <b>mercato</b> ha prodotto: ci&ograve; che resta della variazione
            una volta tolto il denaro versato. &Egrave; questa la cifra da leggere come rendimento
            del periodo{parziale ? ', sul perimetro dichiarato' : ''}, non quella a sinistra.
          </span>
        </div>
      </div>

      <div className="regolo-scomposizione" data-testid="regolo-scomposizione">
        <div className="testa-regolo">
          <span>
            Come si divide la variazione di {simboloValuta}&thinsp;{importo(Math.abs(esito.variazione))}
          </span>
          <span>
            {percBarraVersato.toFixed(0)}&thinsp;% denaro versato &middot; {percBarraMercato.toFixed(0)}&thinsp;% mercato
          </span>
        </div>
        <div
          className="barra-scomposizione"
          role="img"
          aria-label={`Della variazione di ${importo(Math.abs(esito.variazione))}, ${importo(absVersato)} sono capitale versato e ${importo(absMercato)} movimento di mercato.`}
        >
          <span className="quota versato" style={{ width: `${percBarraVersato}%` }}>
            capitale versato &nbsp;{simboloValuta} {importo(absVersato)}
          </span>
          <span className={`quota mercato${mercatoNegativo ? ' in-perdita' : ''}`} style={{ width: `${percBarraMercato}%` }}>
            mercato &nbsp;{simboloValuta} {importo(absMercato)}
          </span>
        </div>
        <p className="legenda-regolo">
          <span className="campione versato" aria-hidden="true"></span> campito &mdash; denaro
          entrato o uscito, <b>mai</b> performance &nbsp;&middot;&nbsp;
          <span className="campione mercato" aria-hidden="true"></span> pieno &mdash; movimento del
          mercato, la sola parte che misura un rendimento. Un portafoglio pu&ograve; muoversi di{' '}
          {simboloValuta}&thinsp;{importo(Math.abs(esito.variazione))} senza aver guadagnato un
          centesimo: basta versarceli o toglierceli.
        </p>
      </div>

      <p className="base-rapporto" data-testid="base-rapporto">
        <span className="et-base">Base della percentuale &mdash; dichiarata, non sottintesa</span>
        {esito.percentuale !== null ? (
          <>
            <span className="conto">
              {percentualeConSegno(esito.percentuale)} = {simboloValuta}&thinsp;
              {importo(Math.abs(esito.movimentoMercato))} &divide; {simboloValuta}&thinsp;
              {importo(esito.baseRapporto)}
            </span>
            , dove la base &egrave; il <b>capitale esposto nella finestra</b>: valore iniziale{' '}
            {simboloValuta}&thinsp;{importo(esito.valoreIniziale)} <b>+</b> capitale netto versato{' '}
            {simboloValuta}&thinsp;{importo(esito.capitaleNettoVersato)}. Non &egrave; un rendimento{' '}
            <em>ponderato per il tempo</em> &mdash; un versamento a met&agrave; finestra pesa come se
            ci fosse stato fin dal primo giorno, ed &egrave; la ragione per cui il denominatore
            &egrave; scritto e non lasciato indovinare.
          </>
        ) : (
          <>
            Percentuale non calcolabile: la base &mdash; valore iniziale {simboloValuta}&thinsp;
            {importo(esito.valoreIniziale)} <b>+</b> capitale netto versato {simboloValuta}&thinsp;
            {importo(esito.capitaleNettoVersato)} &mdash; non &egrave; positiva. Un rapporto su una
            base nulla o negativa sarebbe una percentuale inventata, non un dato.
          </>
        )}
      </p>

      {parziale && (
        <div className="perimetro-scomposizione" data-testid="perimetro-scomposizione">
          <span className="et-perimetro-scomp">
            Su che cosa &egrave; calcolata &mdash; il perimetro della scomposizione
          </span>
          <b>{conteggio(esito.titoliCompresi.length)}</b> dei{' '}
          <b>{conteggio(esito.titoliCompresi.length + esito.titoliEsclusi.length)}</b> titoli
          detenuti nella finestra. Un titolo &egrave; nel perimetro quando ha un prezzo noto a{' '}
          <em>ogni</em> data in cui risulta detenuto: basta un punto scoperto perch&eacute; ne
          esca &mdash; e quando esce, esce <b>da entrambi i lati dell&rsquo;identit&agrave;</b>,
          valore e flussi insieme.
          <ul className="elenco-esclusi">
            {esito.titoliEsclusi.map((t) => (
              <li key={t.isin}>
                <b>Escluso</b> &middot; {t.name ?? t.isin}
                {t.name !== null && <span className="isin"> &mdash; {t.isin}</span>} &middot; nessun
                prezzo noto a ogni data in cui era detenuto
              </li>
            ))}
            <li>
              Compresi &middot;{' '}
              {esito.titoliCompresi.map((t, indice) => (
                <span key={t.isin}>
                  {indice > 0 && ' · '}
                  {t.name ?? t.isin} <span className="isin">{t.isin}</span>
                </span>
              ))}
            </li>
          </ul>
          <span className="rimando-us016" style={{ display: 'block', marginTop: '8px' }}>
            Quale titolo manca, da quando l&rsquo;archivio lo copre e come rimediare &egrave;
            l&rsquo;elenco titolo per titolo di US&#8209;016; il prezzo si aggiorna da US&#8209;035.
          </span>
        </div>
      )}

      {sigillo}
    </div>
  );
}
