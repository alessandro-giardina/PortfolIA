import type { EnrichedPositionSummary } from '@portfolia/shared';
import { classeSegno, importo, percentualeConSegno, segnoDi } from '../domain/formattazione.js';

export interface QuadroRisultatoProps {
  /** Le posizioni arricchite del portafoglio, le stesse del riquadro del valore totale. */
  enrichedPositions: readonly EnrichedPositionSummary[];
}

/** Cifra con segno, in Playfair — la stessa resa di `.cifra-pl` nel mockup. */
function Cifra({ valore }: { valore: number }) {
  // Zero **misurato** (nessuna vendita, o residuo esaurito) e zero per un
  // rapporto ancora incompleto sono due situazioni diverse, ma nessuna delle
  // due è un dato assente: qui c'è sempre una cifra, mai un "–". La classe
  // `nulla` (nera, non verde né carminio) segnala solo che il segno non si
  // applica a un valore pari a zero — il colore resta il terzo segnale, come
  // vuole il resto del registro. La partialità, quando c'è, si legge
  // dall'etichetta «— parziale» e dalla nota sotto, non da un modificatore
  // sulla cifra stessa: il mockup (`casi-limite.html`, caso III) non ne porta
  // uno, e introdurne uno qui senza stile creerebbe una classe morta.
  const classe = valore === 0 ? 'nulla zero-misurato' : classeSegno(valore);
  return (
    <span className={`cifra-pl ${classe}`}>
      {valore !== 0 && <span className="segno">{segnoDi(valore)}</span>}
      <span className="euro-pl">€</span>
      {importo(Math.abs(valore))}
    </span>
  );
}

/**
 * Il quadro del risultato: P&amp;L realizzato, latente e totale (US-043, FR-025,
 * ADR-009).
 *
 * Sta subito sotto il riquadro del valore attuale totale, nella linguetta
 * Riepilogo: quel riquadro dichiara **che cosa** il conto possiede oggi, questo
 * dichiara **quanto quel possesso è valso** — comprese le quote già vendute. La
 * somma è scritta e non sottintesa (`realizzato + latente ═ totale`), con gli
 * operatori veri fra le tre caselle: il criterio 1 si legge nella disposizione,
 * non va preso sulla parola.
 *
 * A differenza del mockup `docs/mockups/US-043/`, questo componente aggrega
 * **tutte** le posizioni del portafoglio in una sola lettura, e non racconta un
 * singolo evento di vendita: non porta perciò `.sigillo` né `.moto` — quel chrome
 * ha senso per «questa vendita, prima e dopo un rilevamento», non per «la somma
 * di N titoli, alcuni venduti e altri no». Il congelamento del criterio 2 si
 * comunica con una chiosa statica sotto la cifra del realizzato: non cambia da
 * un rendering all'altro perché non dipende dal prezzo corrente, punto.
 */
export default function QuadroRisultato({ enrichedPositions }: QuadroRisultatoProps) {
  // Il realizzato è **sempre** completo: non dipende dal prezzo corrente, quindi
  // nessuna posizione senza prezzo in cache lo rende parziale (criterio 6 del
  // caso limite III nei mockup).
  const realizedTotal = enrichedPositions.reduce((somma, ep) => somma + ep.realizedPnl, 0);

  // Il latente si somma sulle sole posizioni per cui è calcolabile: `latentPnl`
  // è `null` quando manca il prezzo corrente e il residuo non è nullo (criterio
  // 3). Le posizioni escluse vengono contate, non ignorate in silenzio.
  const conLatente = enrichedPositions.filter((ep) => ep.latentPnl !== null);
  const missingCount = enrichedPositions.length - conLatente.length;
  const latentTotal = conLatente.reduce((somma, ep) => somma + (ep.latentPnl ?? 0), 0);

  // Il totale è parziale quando lo è il latente: sommare uno zero misurato a un
  // dato mancante darebbe un numero che sembra completo e non lo è.
  const totalPnl = realizedTotal + latentTotal;
  const parziale = missingCount > 0;

  // La base della percentuale è il costo di **tutti** i carichi, lotti già
  // venduti inclusi (criterio 5): sommarla sul solo residuo farebbe saltare la
  // percentuale per il solo fatto che una vendita sia avvenuta, senza che nulla
  // di reale sia cambiato. Non calcolabile se il totale è parziale (numeratore
  // incompleto su una base intera sarebbe una cifra falsa, ADR-003) o se la base
  // è zero (nessun carico iscritto).
  const totalLoadCost = enrichedPositions.reduce((somma, ep) => somma + ep.totalLoadCost, 0);
  const percentuale = !parziale && totalLoadCost !== 0 ? (totalPnl / totalLoadCost) * 100 : null;

  const nessunPrezzoAlcunaPosizione = missingCount === enrichedPositions.length && missingCount > 0;

  return (
    <div
      className={`quadro-risultato${parziale ? ' parziale' : ''}`}
      data-testid="quadro-risultato"
      aria-label="Quadro del risultato: P&L realizzato, latente e totale"
    >
      <div className="fascia-colore"></div>
      <div className="interno">
        <div className="capo-quadro">
          <h2>Quadro del risultato{parziale ? ' — parziale' : ''}</h2>
          <span className="rimando">FR-025 &middot; ADR-009 &mdash; realizzato + latente = totale</span>
        </div>

        <div className="somma">
          {/* ── addendo I: il realizzato ── */}
          <div className="voce-pl" data-testid="pnl-realizzato">
            <span className="et-pl">P&amp;L realizzato</span>
            <Cifra valore={realizedTotal} />
            <span className={`verdetto ${realizedTotal === 0 ? 'neutro' : classeSegno(realizedTotal)}`}>
              {realizedTotal === 0
                ? 'nessun risultato ancora realizzato'
                : realizedTotal > 0
                  ? 'guadagno incassato'
                  : 'perdita incassata'}
            </span>
            <span className="chiosa">
              Calcolato all&rsquo;atto di ciascuna vendita &mdash; ricavo meno costo LIFO
              attribuito &mdash; e congelato da allora: <b>nessuna</b> rilevazione di prezzo
              successiva lo modifica.
            </span>
          </div>

          <div className="operatore" aria-hidden="true">+</div>

          {/* ── addendo II: il latente ── */}
          <div className="voce-pl" data-testid="pnl-latente">
            <span className="et-pl">P&amp;L latente{parziale ? ' — parziale' : ''}</span>
            <Cifra valore={latentTotal} />
            <span
              className={`verdetto ${
                latentTotal === 0 && !parziale ? 'neutro' : classeSegno(latentTotal)
              }`}
            >
              {latentTotal === 0 && !parziale ? 'nessuna quota residua' : 'sulla carta'}
            </span>
            {parziale ? (
              <div className="nota-mancante" role="note">
                <strong>{nessunPrezzoAlcunaPosizione ? 'Nessun prezzo disponibile' : 'Valore parziale'}</strong>
                {missingCount} {missingCount === 1 ? 'posizione' : 'posizioni'} senza prezzo
                corrente:{' '}
                {missingCount === 1
                  ? 'il latente esclude questo titolo, il cui risultato non è calcolabile — non zero.'
                  : 'il latente esclude questi titoli, il cui risultato non è calcolabile — non zero.'}
              </div>
            ) : (
              <span className="chiosa">
                Sulla sola quantità residua: è la somma della colonna <em>Differenza</em> della
                tabella qui sotto, e si muove a ogni nuovo rilevamento di prezzo.
              </span>
            )}
          </div>

          <div className="operatore uguale" aria-hidden="true">═</div>

          {/* ── il totale, oltre la doppia riga ── */}
          <div className="voce-pl totale" data-testid="pnl-totale">
            <span className="et-pl">P&amp;L totale{parziale ? ' — parziale' : ''}</span>
            <Cifra valore={totalPnl} />
            <span className={`verdetto ${totalPnl === 0 && !parziale ? 'neutro' : classeSegno(totalPnl)}`}>
              {totalPnl === 0 && !parziale ? 'nessun guadagno né perdita' : 'complessivo'}
            </span>
            <span
              className={`percentuale ${percentuale === null ? 'assente' : classeSegno(percentuale)}`}
              data-testid="pnl-percentuale"
            >
              {percentuale !== null ? percentualeConSegno(percentuale) : '–'}
            </span>
            <span className="base-percentuale">
              {percentuale !== null ? (
                <>
                  su <b>&euro;&nbsp;{importo(totalLoadCost)}</b>, costo di <em>tutti</em> i
                  carichi &mdash; lotti già venduti inclusi.
                </>
              ) : (
                <>
                  Percentuale non calcolabile: il numeratore non copre {missingCount === 1 ? 'una posizione' : `${missingCount} posizioni`} senza prezzo corrente, e un rapporto fra un
                  numeratore parziale e una base intera sarebbe una cifra falsa.
                </>
              )}
            </span>
          </div>
        </div>

        {/* ── criterio 6: dove è finito l'incasso ── */}
        <div className="postilla-liquidita" data-testid="pnl-postilla-liquidita">
          <span className="titoletto">L&rsquo;app tiene i titoli, non la cassa</span>
          <div>
            <p>
              L&rsquo;incasso delle vendite <b>non</b> è trattenuto come liquidità del
              portafoglio. Il <em>valore attuale totale</em> qui sopra comprende i soli titoli
              ancora posseduti: l&rsquo;esito delle vendite già registrate sta per intero nel{' '}
              <em>P&amp;L realizzato</em>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
