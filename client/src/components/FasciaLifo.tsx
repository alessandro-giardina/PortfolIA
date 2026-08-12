import type { CaricoLotto, VenditaLotto } from '@portfolia/shared';
import { rigiocaRegistro } from '@portfolia/shared';
import { dataCarico, importo, prezzo } from './Foglio.js';

/**
 * La **fascia dei lotti**: l'attribuzione LIFO resa visibile (US-042, FR-023).
 *
 * LIFO è un *ordine*, e un ordine si mostra disponendo le cose. I lotti stanno
 * uno sotto l'altro **dal più recente al più antico** — l'ordine esatto in cui il
 * criterio li consuma — con la quota consumata tratteggiata in carminio e quella
 * ancora detenuta piena in ottone.
 *
 * Tre scelte deliberate, riprese dal mockup `docs/mockups/US-042/index.html`:
 *
 * - **la quantità è la larghezza.** Le barre sono proporzionali (`flex: 400`
 *   contro `flex: 600`), così il rapporto fra consumato e residuo si legge senza
 *   aritmetica. Una barra a larghezza fissa con la cifra scritta dentro
 *   costringerebbe a fare il conto a mente, che è esattamente ciò che la fascia
 *   esiste per evitare;
 * - **il lotto successivo alla data di vendita non è nascosto, è dichiarato fuori
 *   data.** Sparire direbbe «non esiste»; comparire tratteggiato dice la cosa
 *   vera, cioè «esiste ma non a quella data» — che è precisamente il criterio 5,
 *   e la ragione per cui un rifiuto di vendita antedatata si capisce guardando
 *   invece di leggere;
 * - **nessuna cifra è animata o interpolata.** La fascia racconta un fatto già
 *   accaduto, non una simulazione.
 *
 * Il criterio non è riscritto qui: la funzione pura `rigiocaRegistro` è la stessa
 * che il server usa per iscrivere una vendita e per calcolare il residuo delle
 * viste aggregate. Un LIFO reimplementato nel componente sarebbe la prima cosa a
 * divergere, e divergerebbe in silenzio — la fascia mostrerebbe un'attribuzione
 * diversa da quella su cui il prezzo medio del residuo è stato calcolato.
 */
export interface FasciaLifoProps {
  /** ISIN del titolo, per l'intestazione. */
  isin: string;
  /** I carichi del titolo in questo portafoglio. */
  carichi: readonly CaricoLotto[];
  /** Le vendite già iscritte per lo stesso titolo. */
  vendite: readonly VenditaLotto[];
  /**
   * Data di riferimento (ISO `YYYY-MM-DD`): i lotti successivi sono dichiarati
   * fuori data invece di essere omessi. `null` quando non c'è una data in gioco —
   * allora la fascia mostra semplicemente lo stato del registro.
   */
  data?: string | null;
}

export default function FasciaLifo({ isin, carichi, vendite, data = null }: FasciaLifoProps) {
  const registro = rigiocaRegistro({ carichi, vendite });
  if (registro.lotti.length === 0) return null;

  // Dal più recente al più antico: `registro.lotti` arriva in ordine di registro
  // — `(loadDate, id)` crescente — e la fascia lo legge al rovescio perché quello
  // è l'ordine di consumo. L'inversione avviene qui e non nel dominio: il
  // registro si *legge* dal primo carico, si *consuma* dall'ultimo.
  const lotti = [...registro.lotti].reverse();
  const costoCarichi = registro.costoAttribuito + registro.costoResiduo;

  return (
    <div className="fascia-lifo" data-testid="fascia-lifo">
      <div className="capo">
        <h3>
          {isin} — lotti{data ? ` al ${dataCarico(data)}` : ''}
        </h3>
        <span className="freccia-lifo">ordine di consumo</span>
      </div>

      <div className="lotti">
        {lotti.map((lotto, indice) => {
          // Il numero del carico è quello di **registro** (il primo iscritto è il
          // n. 1), non la posizione nella fascia: la fascia è al rovescio, e
          // numerarla dall'alto darebbe due nomi diversi allo stesso lotto fra la
          // fascia e la tabella del registro.
          const numero = lotti.length - indice;
          const fuoriData = data !== null && lotto.loadDate > data;
          const intatto = !fuoriData && lotto.quantitaConsumata === 0;

          return (
            <div
              className={`lotto${intatto ? ' intatto' : ''}`}
              key={lotto.caricoId}
              data-testid={`lotto-${lotto.caricoId}`}
            >
              <div className="targa">
                <b>Carico n. {numero}</b>
                <small>
                  {dataCarico(lotto.loadDate)} · {lotto.quantita} quote · € {prezzo(lotto.loadPrice)}
                </small>
              </div>

              <div className="barra">
                {fuoriData ? (
                  <div className="quota futura" style={{ flex: lotto.quantita }}>
                    non ancora avvenuto al {dataCarico(data)}
                  </div>
                ) : (
                  <>
                    {lotto.quantitaConsumata > 0 && (
                      <div className="quota consumata" style={{ flex: lotto.quantitaConsumata }}>
                        {lotto.quantitaConsumata} consumate
                      </div>
                    )}
                    {lotto.quantitaResidua > 0 && (
                      <div className="quota residua" style={{ flex: lotto.quantitaResidua }}>
                        {lotto.quantitaResidua} residue
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="esito" data-testid={`esito-lotto-${lotto.caricoId}`}>
                {fuoriData ? (
                  <>
                    fuori dalla data
                    <b>non attribuibile</b>
                  </>
                ) : lotto.quantitaResidua === 0 ? (
                  <>
                    consumato per intero
                    <b>costo attribuito € {importo(lotto.loadPrice * lotto.quantitaConsumata)}</b>
                  </>
                ) : lotto.quantitaConsumata === 0 ? (
                  <>
                    non toccato
                    <b>costo residuo € {importo(lotto.loadPrice * lotto.quantitaResidua)}</b>
                  </>
                ) : (
                  <>
                    consumato in parte
                    <b>costo residuo € {importo(lotto.loadPrice * lotto.quantitaResidua)}</b>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="legenda-lifo">
        {registro.costoAttribuito > 0 && (
          <span>
            <i className="consumata" /> quote consumate da una vendita
          </span>
        )}
        {registro.quantitaResidua > 0 && (
          <span>
            <i className="residua" /> quote ancora detenute
          </span>
        )}
        {/*
          L'identità che regge l'intero criterio, scritta a schermo perché sia
          verificabile a occhio prima ancora che da un test: il costo dei carichi
          non si crea né si distrugge, si ripartisce fra ciò che è uscito e ciò
          che resta. È la base che US-043 userà per la percentuale.
        */}
        <span data-testid="identita-costo">
          costo attribuito € {importo(registro.costoAttribuito)} + costo residuo €{' '}
          {importo(registro.costoResiduo)} = costo dei carichi € {importo(costoCarichi)}
        </span>
      </div>
    </div>
  );
}
