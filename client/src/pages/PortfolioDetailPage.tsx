import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import type { Portfolio, Position, PositionSummary, EnrichedPositionSummary, CreatePositionRequest, UpdatePositionRequest, Sale, CaricoLotto, VenditaLotto, PortfolioSeriesEntry } from '@portfolia/shared';
import { isValidIsin, residuoPerIsin, rigiocaRegistro } from '@portfolia/shared';
import Foglio, { dataRegistro, importo, prezzo } from '../components/Foglio.js';
import SchedaTitolo from '../components/SchedaTitolo.js';
import AggiornaObsoleti from '../components/AggiornaObsoleti.js';
import ModuloScarico, { type TitoloScaricabile } from '../components/ModuloScarico.js';
import QuadroRisultato from '../components/QuadroRisultato.js';
import GraficoPortafoglio from '../components/GraficoPortafoglio.js';
import CellaTitolo from '../components/CellaTitolo.js';

/** Formatta una data ISO-8601 (YYYY-MM-DD) in stile registro (es. "15.III.2026"). */
const MESI_ROMANI = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'];
function dataCarico(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${String(d).padStart(2,'0')}.${MESI_ROMANI[m - 1]}.${y}`;
}

/**
 * Formatta il momento dell'ultimo rilevamento del prezzo (unix, secondi) come
 * `gg/mm/aaaa hh:mm`. In tabella la data compatta si legge meglio della forma
 * a mese romano usata dalla scheda titolo: la colonna è stretta e affiancata a
 * cifre, e il confronto fra righe deve essere immediato.
 */
function dataRilevamento(fetchedAt: number): string {
  const d = new Date(fetchedAt * 1000);
  const gg = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${gg}/${mm}/${d.getFullYear()} ${hh}:${min}`;
}

type Scheda = 'riepilogo' | 'carico' | 'titolo';

interface PrefillState {
  isin: string;
  name: string | null;
  price: number | null;
  currency: string | null;
}

export default function PortfolioDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  // La scheda iniziale dipende da come si è arrivati qui: con un carico da
  // registrare (dalla ricerca titoli) si apre su "Carico titoli", altrimenti su
  // "Riepilogo". Lazy initializer, non useEffect, per non mostrare la scheda
  // sbagliata al primo render.
  const [scheda, setScheda] = useState<Scheda>(() => {
    const state = location.state as { prefill?: PrefillState } | null;
    return state?.prefill?.isin ? 'carico' : 'riepilogo';
  });

  // Rename form state
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);

  // Delete state
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Positions state
  const [positions, setPositions] = useState<Position[]>([]);
  // Le vendite iscritte (US-042): la seconda specie di iscrizione del registro.
  // Vive accanto ai carichi e non dentro di essi perché è ciò che sono — due
  // elenchi di fatti distinti, che la tabella riunisce in un solo libro (ADR-009).
  const [sales, setSales] = useState<Sale[]>([]);
  // L'ultima vendita iscritta in questa sessione, per il riquadro del residuo:
  // mostra il prezzo medio ricalcolato accanto a quello che aveva **prima**, e
  // quel «prima» si ottiene rigiocando il registro senza questa vendita.
  const [ultimaVendita, setUltimaVendita] = useState<Sale | null>(null);
  const [summaries, setSummaries] = useState<PositionSummary[]>([]);
  const [enrichedPositions, setEnrichedPositions] = useState<EnrichedPositionSummary[]>([]);
  const [enrichedLoading, setEnrichedLoading] = useState(false);
  // Il perimetro grezzo per il grafico dell'andamento (US-019, TASK-05/TASK-10):
  // un solo fetch per l'intera sezione, mai una richiesta per singolo titolo.
  const [series, setSeries] = useState<PortfolioSeriesEntry[]>([]);
  const [seriesLoading, setSeriesLoading] = useState(false);
  // ISIN del titolo aperto nella scheda di dettaglio (US-018). Finché è null la
  // linguetta "Scheda titolo" resta disabilitata: non c'è nulla da mostrare.
  const [isinSelezionato, setIsinSelezionato] = useState<string | null>(null);
  // ISIN interrogato in questo istante dall'aggiornamento in blocco (US-035).
  // Vive qui e non nel componente del comando perché è la *tabella* a doverne
  // marcare la riga: è la terza variante della postilla di US-034.
  const [isinInLavorazione, setIsinInLavorazione] = useState<string | null>(null);
  const [positionsLoading, setPositionsLoading] = useState(false);
  const [newPositionId, setNewPositionId] = useState<number | null>(null);

  // Edit/Delete position state
  const [editingPositionId, setEditingPositionId] = useState<number | null>(null);
  const [editLoadDate, setEditLoadDate] = useState('');
  const [editLoadPrice, setEditLoadPrice] = useState('');
  const [editQuantity, setEditQuantity] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [positionDeleteError, setPositionDeleteError] = useState<string | null>(null);
  const [deletingPositionId, setDeletingPositionId] = useState<number | null>(null);

  // Carico form state
  const [isin, setIsin] = useState('');
  const [prefillName, setPrefillName] = useState<string | null>(null);
  const [loadDate, setLoadDate] = useState('');
  const [loadPrice, setLoadPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{
    isin?: string;
    loadDate?: string;
    loadPrice?: string;
    quantity?: string;
  }>({});

  const fetchPositions = useCallback(() => {
    if (!id) return;
    setPositionsLoading(true);
    fetch(`/api/portfolios/${id}/positions`)
      .then((res) => {
        if (!res.ok) return [];
        return res.json() as Promise<Position[]>;
      })
      .then((data) => setPositions(data))
      .catch(() => setPositions([]))
      .finally(() => setPositionsLoading(false));
  }, [id]);

  const fetchSales = useCallback(() => {
    if (!id) return;
    fetch(`/api/portfolios/${id}/sales`)
      .then((res) => {
        if (!res.ok) return [];
        return res.json() as Promise<Sale[]>;
      })
      .then((data) => setSales(data))
      .catch(() => setSales([]));
  }, [id]);

  const fetchSummary = useCallback(() => {
    if (!id) return;
    fetch(`/api/portfolios/${id}/positions/summary`)
      .then((res) => {
        if (!res.ok) return [];
        return res.json() as Promise<PositionSummary[]>;
      })
      .then((data) => setSummaries(data))
      .catch(() => setSummaries([]));
  }, [id]);

  /**
   * Rilegge la vista arricchita: prezzi, valori, differenze e `freshness`
   * ricalcolati dal server a ogni chiamata.
   *
   * `silenzioso` non cambia *cosa* si legge, cambia se la lettura si dichiara.
   * In modalità rumorosa alza `enrichedLoading` e il riepilogo sostituisce la
   * tabella con «Caricamento titoli…»: giusto al primo caricamento, sbagliato
   * durante l'aggiornamento in blocco (US-035), che rilegge dopo *ogni* titolo e
   * farebbe lampeggiare via la tabella una volta per titolo — l'opposto del
   * criterio «i valori si aggiornano dopo ogni titolo rilevato».
   *
   * Restituisce la promessa della lettura, così il ciclo di US-035 può attendere
   * che la tabella sia riscritta prima di passare al titolo successivo.
   */
  const fetchEnriched = useCallback(
    (silenzioso = false): Promise<void> => {
      if (!id) return Promise.resolve();
      if (!silenzioso) setEnrichedLoading(true);
      return fetch(`/api/portfolios/${id}/positions/enriched`)
        .then((res) => {
          if (!res.ok) return [];
          return res.json() as Promise<EnrichedPositionSummary[]>;
        })
        .then((data) => setEnrichedPositions(data))
        .catch(() => setEnrichedPositions([]))
        .finally(() => {
          if (!silenzioso) setEnrichedLoading(false);
        });
    },
    [id],
  );

  useEffect(() => {
    if (!id) return;
    fetch(`/api/portfolios/${id}`)
      .then((res) => {
        if (res.status === 404) { setNotFound(true); return null; }
        if (!res.ok) throw new Error('Risposta non valida dal server');
        return res.json() as Promise<Portfolio>;
      })
      .then((data) => {
        if (data) {
          setPortfolio(data);
          setRenameValue(data.name);
        }
      })
      .catch(() => setError('Backend non raggiungibile'))
      .finally(() => setLoading(false));
  }, [id]);

  /**
   * Rilegge il perimetro grezzo per il grafico dell'andamento (US-019).
   *
   * Stesso pattern di `fetchEnriched`: `silenzioso` non alza `seriesLoading`,
   * così il ricarico al rientro sulla linguetta del browser non fa lampeggiare
   * il grafico via uno stato di caricamento bloccante.
   */
  const fetchSeries = useCallback(
    (silenzioso = false): Promise<void> => {
      if (!id) return Promise.resolve();
      if (!silenzioso) setSeriesLoading(true);
      return fetch(`/api/portfolios/${id}/series`)
        .then((res) => {
          if (!res.ok) return [];
          return res.json() as Promise<PortfolioSeriesEntry[]>;
        })
        .then((data) => setSeries(data))
        .catch(() => setSeries([]))
        .finally(() => {
          if (!silenzioso) setSeriesLoading(false);
        });
    },
    [id],
  );

  useEffect(() => {
    if (!loading && !notFound && !error) {
      fetchPositions();
      fetchSales();
      fetchSummary();
      fetchEnriched();
      fetchSeries();
    }
  }, [loading, notFound, error, fetchPositions, fetchSales, fetchSummary, fetchEnriched, fetchSeries]);

  /**
   * Ricarico silenzioso al rientro sulla linguetta del browser (US-019).
   *
   * Nessun pattern equivalente esiste già altrove in questa pagina: il
   * ricalcolo di `fetchEnriched` al cambio di *scheda* (sopra) risponde a un
   * altro evento — la navigazione interna fra Riepilogo/Carico/Scheda titolo,
   * non l'uscita e il rientro sulla linguetta del browser. Qui l'evento è
   * `visibilitychange`/`focus`: chi lascia questa pagina aperta in una
   * linguetta e ci torna dopo un aggiornamento in blocco altrove (o dopo che
   * l'orologio ha fatto avanzare "oggi") ritrova un grafico aggiornato senza
   * un lampeggio di caricamento.
   */
  useEffect(() => {
    function alRientroSullaLinguetta() {
      if (document.visibilityState === 'visible') {
        void fetchSeries(true);
      }
    }
    document.addEventListener('visibilitychange', alRientroSullaLinguetta);
    window.addEventListener('focus', alRientroSullaLinguetta);
    return () => {
      document.removeEventListener('visibilitychange', alRientroSullaLinguetta);
      window.removeEventListener('focus', alRientroSullaLinguetta);
    };
  }, [fetchSeries]);

  /**
   * Il registro per ISIN — carichi e vendite — e il residuo di ogni singolo lotto.
   *
   * Il criterio LIFO **non è riscritto qui**: `rigiocaRegistro` è la stessa
   * funzione pura che il server usa per iscrivere una vendita e per calcolare il
   * residuo delle viste aggregate. Ricalcolarlo nel client non è una seconda
   * verità ma la stessa, letta due volte: se divergesse, la fascia dei lotti
   * mostrerebbe un'attribuzione diversa da quella su cui il prezzo medio del
   * residuo a schermo è stato calcolato — e nulla lo segnalerebbe.
   */
  const registri = useMemo(() => {
    const perIsin = new Map<string, { carichi: CaricoLotto[]; vendite: VenditaLotto[] }>();
    for (const pos of positions) {
      const registro = perIsin.get(pos.isin) ?? { carichi: [], vendite: [] };
      registro.carichi.push({
        id: pos.id,
        loadDate: pos.loadDate,
        loadPrice: pos.loadPrice,
        quantity: pos.quantity,
      });
      perIsin.set(pos.isin, registro);
    }
    for (const vendita of sales) {
      // Come sul server: un ISIN venduto ma non caricato non è un titolo del
      // portafoglio, e non se ne crea una voce.
      perIsin.get(vendita.isin)?.vendite.push({
        id: vendita.id,
        saleDate: vendita.saleDate,
        quantity: vendita.quantity,
        salePrice: vendita.salePrice,
      });
    }
    return perIsin;
  }, [positions, sales]);

  /** Quote che ogni carico ha ancora, per `id` di posizione. */
  const residuoPerLotto = useMemo(() => {
    const residui = new Map<number, number>();
    for (const registro of registri.values()) {
      for (const lotto of rigiocaRegistro(registro).lotti) {
        residui.set(lotto.caricoId, lotto.quantitaResidua);
      }
    }
    return residui;
  }, [registri]);

  /**
   * Le posizioni **aperte** — quantità residua superiore a zero — e quelle
   * **chiuse** — venduto per intero (US-044, FR-013, FR-026).
   *
   * La partizione vive qui e non nel rendering perché entrambe le sezioni della
   * scheda Riepilogo (la tabella dei posseduti, il riquadro del valore totale, e
   * la nuova tabella «Posizioni chiuse») leggono lo stesso confine: calcolarlo in
   * due punti diversi rischierebbe di farli divergere su un arrotondamento o un
   * refactor futuro. `QuadroRisultato` **non** legge questi due elenchi: continua
   * a ricevere `enrichedPositions` per intero, perché il realizzato delle
   * posizioni chiuse deve restare nel P&L totale del portafoglio anche dopo che
   * la loro riga è uscita dalla tabella dei posseduti (criterio 3).
   */
  const posizioniAperte = useMemo(
    () => enrichedPositions.filter((ep) => ep.totalQuantity > 0),
    [enrichedPositions],
  );
  const posizioniChiuse = useMemo(
    () => enrichedPositions.filter((ep) => ep.totalQuantity === 0),
    [enrichedPositions],
  );

  /**
   * L'ultima data di vendita per ISIN, per la colonna «Chiusa il» di «Posizioni
   * chiuse» (US-044).
   *
   * Non è un nuovo campo di dominio: si legge dal registro già rigiocato per la
   * tabella unificata di «Carico titoli» (`registri`), lo stesso registro da cui
   * `residuoPerLotto` legge il residuo lotto per lotto. Le vendite sono ordinate
   * per data crescente da `rigiocaRegistro`, quindi l'ultima dell'array è la più
   * recente.
   */
  const ultimaVenditaPerIsin = useMemo(() => {
    const date = new Map<string, string>();
    for (const [isin, registro] of registri.entries()) {
      const { vendite } = rigiocaRegistro(registro);
      const ultima = vendite.at(-1);
      if (ultima) date.set(isin, ultima.saleDate);
    }
    return date;
  }, [registri]);

  /**
   * La denominazione di ogni ISIN mai iscritto in questo portafoglio (US-046).
   *
   * Non è un dato nuovo e non costa una richiesta in più: `enrichedPositions` è
   * già letta all'apertura del portafoglio — non al cambio di scheda — e riletta
   * dopo ogni iscrizione, e comprende anche le righe a residuo zero, cioè i
   * titoli venduti per intero che restano a registro. È per questo la sorgente
   * giusta per «Carico titoli», dove il *Registro delle iscrizioni* elenca anche
   * ciò che non si possiede più.
   *
   * Una `Map` e non un `.find()` per riga: le due tabelle risolvono il nome una
   * volta per riga, e il registro ne ha una per ogni iscrizione — la ricerca
   * lineare sarebbe quadratica sul numero di iscrizioni.
   */
  const nomePerIsin = useMemo(() => {
    const nomi = new Map<string, string>();
    for (const ep of enrichedPositions) {
      if (ep.name) nomi.set(ep.isin, ep.name);
    }
    return nomi;
  }, [enrichedPositions]);

  /**
   * I titoli con quantità residua: i soli vendibili.
   *
   * Un titolo interamente venduto resta a registro con residuo 0 — toglierlo dal
   * riepilogo è US-044 — ma sparisce da qui, perché offrire di vendere zero quote
   * sarebbe un rifiuto annunciato.
   */
  const titoliScaricabili = useMemo<TitoloScaricabile[]>(
    () =>
      [...registri.entries()]
        .map(([isin, registro]) => ({
          isin,
          name: nomePerIsin.get(isin) ?? null,
          residuo: residuoPerIsin(registro).totalQuantity,
          carichi: registro.carichi,
          vendite: registro.vendite,
        }))
        .filter((t) => t.residuo > 0)
        .sort((a, b) => (a.isin < b.isin ? -1 : 1)),
    [registri, nomePerIsin],
  );

  /**
   * Il registro **unificato**: carichi e scarichi nella stessa tabella, in ordine
   * di data.
   *
   * Due tabelle affiancate sarebbero più facili da costruire e direbbero una cosa
   * falsa — che i due fatti vivono in libri separati. Sono invece iscrizioni dello
   * stesso libro, ed è esattamente la tesi di ADR-009. L'`id` scioglie il pari
   * merito fra due iscrizioni dello stesso giorno, e a pari data un carico precede
   * lo scarico: non si può scaricare ciò che non è ancora stato caricato, e
   * mostrarlo al rovescio suggerirebbe il contrario.
   */
  const iscrizioni = useMemo(() => {
    const righe: Array<
      | { specie: 'carico'; data: string; ordine: number; posizione: Position }
      | { specie: 'scarico'; data: string; ordine: number; vendita: Sale }
    > = [
      ...positions.map((posizione) => ({
        specie: 'carico' as const,
        data: posizione.loadDate,
        ordine: 0,
        posizione,
      })),
      ...sales.map((vendita) => ({
        specie: 'scarico' as const,
        data: vendita.saleDate,
        ordine: 1,
        vendita,
      })),
    ];
    return righe.sort((a, b) => {
      if (a.data !== b.data) return a.data < b.data ? -1 : 1;
      if (a.ordine !== b.ordine) return a.ordine - b.ordine;
      const idA = a.specie === 'carico' ? a.posizione.id : a.vendita.id;
      const idB = b.specie === 'carico' ? b.posizione.id : b.vendita.id;
      return idA - idB;
    });
  }, [positions, sales]);

  /**
   * Il residuo del titolo appena venduto, con il prezzo medio **prima** e **dopo**.
   *
   * Il «prima» non è memorizzato: si ottiene rigiocando lo stesso registro senza
   * l'ultima vendita. Conservarlo in uno stato al momento dell'invio sarebbe la
   * solita seconda copia — vera all'istante in cui è stata scritta e non
   * necessariamente dopo, per esempio se un'altra scheda intanto ha corretto un
   * carico.
   */
  const residuoDopoVendita = useMemo(() => {
    if (!ultimaVendita) return null;
    const registro = registri.get(ultimaVendita.isin);
    if (!registro) return null;
    const dopo = residuoPerIsin(registro);
    const prima = residuoPerIsin({
      carichi: registro.carichi,
      vendite: registro.vendite.filter((v) => v.id !== ultimaVendita.id),
    });
    return { isin: ultimaVendita.isin, vendita: ultimaVendita, dopo, prima };
  }, [ultimaVendita, registri]);

  /** Rilegge l'intero registro dopo un'iscrizione di scarico. */
  const dopoScarico = useCallback(
    (vendita: Sale) => {
      setUltimaVendita(vendita);
      setPositionDeleteError(null);
      fetchPositions();
      fetchSales();
      fetchSummary();
      void fetchEnriched();
    },
    [fetchPositions, fetchSales, fetchSummary, fetchEnriched],
  );

  /**
   * Il ricalcolo che l'aggiornamento in blocco chiama dopo ogni titolo.
   *
   * Identità stabile (dipende dal solo `fetchEnriched`, a sua volta stabile per
   * `id`): il ciclo di US-035 la tiene in un riferimento e una nuova identità a
   * ogni render sarebbe rumore inutile.
   */
  const ricalcolaSilenzioso = useCallback(() => fetchEnriched(true), [fetchEnriched]);

  /**
   * Rientro sulla linguetta Riepilogo: il conteggio dei titoli obsoleti va
   * ricalcolato (US-035).
   *
   * Cambiare linguetta non smonta la pagina, quindi il ricalcolo al montaggio
   * qui sopra non basta: chi lascia il riepilogo mentre un aggiornamento in
   * blocco è in corso e poi ci torna troverebbe la fotografia di prima. La
   * lettura è silenziosa perché sostituire la tabella con «Caricamento titoli…»
   * a ogni cambio di linguetta sarebbe un lampeggio senza informazione.
   *
   * Il primo giro è saltato: al montaggio il riepilogo è già letto dall'effetto
   * precedente, e leggerlo due volte sarebbe una richiesta in più a ogni
   * apertura di portafoglio.
   */
  const primoGiroDellaScheda = useRef(true);
  useEffect(() => {
    if (primoGiroDellaScheda.current) {
      primoGiroDellaScheda.current = false;
      return;
    }
    if (scheda === 'riepilogo') void fetchEnriched(true);
  }, [scheda, fetchEnriched]);

  // Un titolo può sparire dal portafoglio mentre la sua scheda è aperta: basta
  // rimuoverne l'ultimo carico dalla scheda "Carico titoli". Senza questo,
  // la linguetta resterebbe attiva su un dettaglio che non esiste più.
  useEffect(() => {
    if (isinSelezionato === null || enrichedLoading) return;
    if (!enrichedPositions.some((ep) => ep.isin === isinSelezionato)) {
      setIsinSelezionato(null);
      setScheda((corrente) => (corrente === 'titolo' ? 'riepilogo' : corrente));
    }
  }, [enrichedPositions, enrichedLoading, isinSelezionato]);

  useEffect(() => {
    const state = location.state as { prefill?: PrefillState } | null;
    if (state?.prefill?.isin) {
      const prefill = state.prefill;
      setIsin(prefill.isin);
      if (prefill.price !== null) {
        setLoadPrice(String(prefill.price));
      }
      if (prefill.name) {
        setPrefillName(prefill.name);
      }
      window.history.replaceState({}, document.title);
    }
  }, []);

  /** Validazione client-side del form di carico. */
  function validateForm(): boolean {
    const errors: typeof fieldErrors = {};
    if (!isin || !isValidIsin(isin)) {
      errors.isin = 'Inserire un codice ISIN valido (12 caratteri alfanumerici).';
    }
    if (!loadDate || !/^\d{4}-\d{2}-\d{2}$/.test(loadDate)) {
      errors.loadDate = 'La data di carico è obbligatoria.';
    }
    const price = parseFloat(loadPrice);
    if (!loadPrice || isNaN(price) || price <= 0) {
      errors.loadPrice = 'Il prezzo deve essere un valore positivo.';
    }
    const qty = parseInt(quantity, 10);
    if (!quantity || isNaN(qty) || qty <= 0 || String(qty) !== quantity.trim()) {
      errors.quantity = 'La quantità deve essere un intero positivo.';
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleCarico(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(null);
    if (!validateForm()) return;

    setSubmitting(true);
    try {
      const payload: CreatePositionRequest = {
        isin: isin.trim().toUpperCase(),
        load_date: loadDate,
        load_price: parseFloat(loadPrice),
        quantity: parseInt(quantity, 10),
      };
      const res = await fetch(`/api/portfolios/${id}/positions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error: string };
        setSubmitError(data.error ?? 'Errore durante il salvataggio.');
        return;
      }
      const created = (await res.json()) as Position;
      setNewPositionId(created.id);
      setSubmitSuccess(`Posizione ${created.isin} iscritta nel registro con successo.`);
      // Reset form
      setIsin('');
      setLoadDate('');
      setLoadPrice('');
      setQuantity('');
      setFieldErrors({});
      fetchPositions();
      fetchSummary();
      fetchEnriched();
    } catch {
      setSubmitError('Backend non raggiungibile.');
    } finally {
      setSubmitting(false);
    }
  }

  /** Apre il form inline di modifica per la posizione specificata. */
  function startEdit(pos: Position) {
    setEditingPositionId(pos.id);
    setEditLoadDate(pos.loadDate);
    setEditLoadPrice(String(pos.loadPrice));
    setEditQuantity(String(pos.quantity));
    setEditError(null);
  }

  /** Annulla la modifica in corso. */
  function cancelEdit() {
    setEditingPositionId(null);
    setEditError(null);
  }

  /** Invia il form di modifica tramite PATCH. */
  async function handleEditSubmit(e: React.FormEvent, posId: number) {
    e.preventDefault();
    setEditError(null);

    const updates: UpdatePositionRequest = {};
    const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

    if (!editLoadDate || !ISO_DATE_RE.test(editLoadDate)) {
      setEditError('La data di carico deve essere nel formato YYYY-MM-DD.');
      return;
    }
    updates.load_date = editLoadDate;

    const price = parseFloat(editLoadPrice);
    if (!editLoadPrice || isNaN(price) || price <= 0) {
      setEditError('Il prezzo deve essere un valore positivo.');
      return;
    }
    updates.load_price = price;

    const qty = parseInt(editQuantity, 10);
    if (!editQuantity || isNaN(qty) || qty <= 0 || String(qty) !== editQuantity.trim()) {
      setEditError('La quantità deve essere un intero positivo.');
      return;
    }
    updates.quantity = qty;

    setEditSubmitting(true);
    try {
      const res = await fetch(`/api/portfolios/${id}/positions/${posId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error: string };
        setEditError(data.error ?? 'Errore durante il salvataggio.');
        return;
      }
      setEditingPositionId(null);
      fetchPositions();
      fetchSummary();
      fetchEnriched();
    } catch {
      setEditError('Backend non raggiungibile.');
    } finally {
      setEditSubmitting(false);
    }
  }

  /** Rimuove una posizione previa conferma. */
  async function handleDeletePosition(posId: number) {
    const confirmed = window.confirm('Rimuovere questo carico? L\'operazione è irreversibile.');
    if (!confirmed) return;
    setPositionDeleteError(null);
    setDeletingPositionId(posId);
    try {
      const res = await fetch(`/api/portfolios/${id}/positions/${posId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = (await res.json()) as { error: string };
        setPositionDeleteError(data.error ?? 'Errore durante la rimozione.');
        return;
      }
      fetchPositions();
      fetchSummary();
      fetchEnriched();
    } catch {
      setPositionDeleteError('Backend non raggiungibile.');
    } finally {
      setDeletingPositionId(null);
    }
  }

  async function handleRename(e: React.FormEvent) {
    e.preventDefault();
    setRenameError(null);
    if (!renameValue || renameValue.trim() === '') {
      setRenameError('Il nome non può essere vuoto.');
      return;
    }
    setRenaming(true);
    try {
      const res = await fetch(`/api/portfolios/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: renameValue.trim() }),
      });
      if (res.status === 409) {
        const data = (await res.json()) as { error: string };
        setRenameError(data.error);
        return;
      }
      if (!res.ok) {
        setRenameError('Errore durante il salvataggio. Riprova.');
        return;
      }
      const updated = (await res.json()) as Portfolio;
      setPortfolio(updated);
      setRenameValue(updated.name);
    } catch {
      setRenameError('Backend non raggiungibile.');
    } finally {
      setRenaming(false);
    }
  }

  async function handleDelete() {
    const confirmed = window.confirm(
      `Eliminare il portafoglio "${portfolio?.name}"? L'operazione è irreversibile.`
    );
    if (!confirmed) return;
    setDeleteError(null);
    setDeleting(true);
    try {
      const res = await fetch(`/api/portfolios/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = (await res.json()) as { error: string };
        setDeleteError(data.error ?? "Errore durante l'eliminazione.");
        return;
      }
      navigate('/');
    } catch {
      setDeleteError('Backend non raggiungibile.');
    } finally {
      setDeleting(false);
    }
  }

  const linguette = (
    <>
      <Link to="/">&larr; Portafogli</Link>
      <a
        className={scheda === 'riepilogo' ? 'attiva' : 'cliccabile'}
        onClick={() => setScheda('riepilogo')}
        style={{ cursor: 'pointer' }}
      >
        Riepilogo
      </a>
      <a
        className={scheda === 'carico' ? 'attiva' : 'cliccabile'}
        onClick={() => setScheda('carico')}
        style={{ cursor: 'pointer' }}
      >
        Carico titoli
      </a>
      {isinSelezionato === null ? (
        // Nessun titolo scelto: la linguetta non ha un dettaglio da aprire.
        <a className="disabilitata">Scheda titolo</a>
      ) : (
        <a
          className={scheda === 'titolo' ? 'attiva' : 'cliccabile'}
          onClick={() => setScheda('titolo')}
          style={{ cursor: 'pointer' }}
        >
          Scheda titolo
        </a>
      )}
    </>
  );

  /** Apre la scheda di dettaglio sul titolo indicato (US-018). */
  function apriSchedaTitolo(isinTitolo: string) {
    setIsinSelezionato(isinTitolo);
    setScheda('titolo');
  }

  const registro = (
    <>
      <div>VOL. <b>I</b> &mdash; ANNO <b>MMXXVI</b></div>
      <div>Portafoglio n. <b>{id ? String(id).padStart(3, '0') : '—'}</b></div>
      {portfolio && (
        <div>Aperto il <b>{dataRegistro(portfolio.created_at)}</b></div>
      )}
    </>
  );

  const hasFieldErrors = Object.keys(fieldErrors).length > 0;

  return (
    <Foglio
      marchio="Conto a mastro · partita singola"
      titolo="Conto "
      titoloCorsivo={portfolio?.name ?? ''}
      sottotesto={
        scheda === 'carico'
          ? 'Carico titoli · iscrizione nuova posizione'
          : scheda === 'titolo'
            ? 'Scheda titolo · anagrafica completa della posizione'
            : 'Vista di dettaglio'
      }
      registro={registro}
      linguette={linguette}
    >
      {loading && <p className="messaggio attesa">Caricamento portafoglio…</p>}
      {error && <p className="messaggio errore">{error}</p>}

      {notFound && (
        <>
          <div className="dettaglio-placeholder">
            <span className="icona-conto" aria-hidden="true">&#9634;</span>
            <h2>Portafoglio non trovato</h2>
            <p className="sottotitolo">Il portafoglio richiesto non esiste nel registro.</p>
          </div>
          <div className="bottoni">
            <Link to="/" className="bottone secondario">&larr; Torna all&rsquo;elenco portafogli</Link>
          </div>
        </>
      )}

      {!loading && !error && !notFound && portfolio && (
        <>
          {/* ===== SCHEDA: Riepilogo ===== */}
          {scheda === 'riepilogo' && (
            <>
              {/* Tabella titoli arricchita (FR-013) */}
              <div className="sezione-titolo" style={{ marginTop: '6px' }}>
                Titoli iscritti a conto
                <span className="nota">FR-013 &middot; valore attuale e differenza rispetto al carico</span>
              </div>

              {enrichedLoading ? (
                <p className="messaggio attesa">Caricamento titoli…</p>
              ) : enrichedPositions.length === 0 ? (
                <div className="dettaglio-placeholder" data-testid="riepilogo-vuoto">
                  <span className="icona-conto" aria-hidden="true">&#9634;</span>
                  <p className="sottotitolo" style={{ fontFamily: "'IM Fell English', serif", fontStyle: 'italic', fontSize: '18px', fontWeight: 400 }}>
                    Il registro è ancora bianco
                  </p>
                  <p className="sottotitolo">
                    Nessun titolo è stato ancora iscritto in questo portafoglio.
                    Vai alla scheda <em>Carico titoli</em> per registrare il primo carico.
                  </p>
                </div>
              ) : (
                <>
                  {(() => {
                    // Da US-044 il riquadro si calcola sulle sole posizioni
                    // APERTE, non più su `enrichedPositions`: una posizione
                    // chiusa contribuisce 0 al valore attuale (criterio 3), e
                    // non deve né contarsi come "posizione senza prezzo" né
                    // gonfiare il denominatore del conteggio qui sotto.
                    const positionsWithPrice = posizioniAperte.filter((ep) => ep.currentValue !== null);
                    const totalCurrentValue = positionsWithPrice.reduce((s, ep) => s + (ep.currentValue ?? 0), 0);
                    const missingPriceCount = posizioniAperte.length - positionsWithPrice.length;
                    // Zero **misurato**, non assente: nessuna posizione aperta
                    // significa che il conto non possiede oggi alcun titolo, non
                    // che un prezzo sia irreperibile. Il trattino resta riservato
                    // al solo caso — posizioni aperte, nessun prezzo in cache —
                    // in cui il dato manca davvero.
                    const nessunaPosizioneAperta = posizioniAperte.length === 0;
                    return (
                      <div className="riquadro-valore-totale" data-testid="valore-totale-portafoglio" aria-label="Valore attuale totale del portafoglio">
                        <div className={`fascia-colore${nessunaPosizioneAperta ? ' assente' : missingPriceCount > 0 ? (positionsWithPrice.length === 0 ? ' assente' : ' parziale') : ''}`}></div>
                        <div className="contenuto-totale">
                          <div className="blocco-cifra">
                            <span className="et-totale">Valore attuale totale</span>
                            <span className={`cifra-totale${nessunaPosizioneAperta ? ' zero-misurato' : positionsWithPrice.length === 0 ? ' assente' : missingPriceCount > 0 ? ' parziale' : ''}`}>
                              <span className="valuta">EUR</span>
                              {nessunaPosizioneAperta
                                ? '0,00'
                                : positionsWithPrice.length === 0
                                  ? '–'
                                  : totalCurrentValue.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </div>
                          {!nessunaPosizioneAperta && missingPriceCount > 0 && (
                            <div className="nota-mancante" role="note">
                              <strong>{positionsWithPrice.length === 0 ? 'Nessun prezzo disponibile' : 'Valore parziale'}</strong>
                              {positionsWithPrice.length === 0
                                ? `Il prezzo corrente non è in archivio per nessuna delle ${posizioniAperte.length} ${posizioniAperte.length === 1 ? 'posizione' : 'posizioni'}. Il valore sarà calcolato non appena almeno un prezzo sarà recuperato.`
                                : `${missingPriceCount} ${missingPriceCount === 1 ? 'posizione senza prezzo corrente' : 'posizioni senza prezzo corrente'}: il totale esclude ${missingPriceCount === 1 ? 'questo titolo' : 'questi titoli'}.`}
                            </div>
                          )}
                          <div className="timestamp-totale">
                            {nessunaPosizioneAperta
                              ? 'Nessuna posizione posseduta'
                              : <>{positionsWithPrice.length} di {posizioniAperte.length} {posizioniAperte.length === 1 ? 'posizione valorizzata' : 'posizioni valorizzate'}</>}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                  {/*
                    Il quadro del risultato (US-043) sta subito sotto il
                    riquadro del valore attuale e sopra il comando di
                    aggiornamento in blocco: il primo riquadro dichiara che
                    cosa il conto possiede oggi, questo quanto quel possesso è
                    valso — comprese le quote già vendute. Riceve le stesse
                    `enrichedPositions` del riquadro sopra: nessun secondo
                    calcolo, nessuna seconda richiesta.
                  */}
                  <QuadroRisultato enrichedPositions={enrichedPositions} />
                  {/*
                    Andamento del portafoglio (US-019, TASK-10): sta subito
                    sotto il quadro del risultato e sopra il comando di
                    aggiornamento in blocco — la stessa progressione di
                    lettura di QuadroRisultato, "quanto vale oggi" seguito da
                    "come vi è arrivato". Un solo fetch (`fetchSeries`) per
                    l'intera sezione: nessuna richiesta per singolo titolo, e
                    `GraficoPortafoglio` stesso non genera alcuna richiesta di
                    rete (TASK-05, TASK-08).
                  */}
                  <div className="sezione-titolo" style={{ marginTop: '40px' }}>
                    Andamento del portafoglio
                    <span className="nota">FR-015 &middot; valore complessivo nel tempo, dal registro dei carichi e delle rilevazioni</span>
                  </div>

                  {seriesLoading ? (
                    <p className="messaggio attesa">Caricamento andamento…</p>
                  ) : (
                    // Portafoglio senza titoli: `series` è `[]` e
                    // `GraficoPortafoglio` ha già un ramo dedicato che si
                    // degrada a testo invece di disegnare un riquadro vuoto.
                    <GraficoPortafoglio titoli={series} />
                  )}
                  {/*
                    Il riquadro di conteggio di US-034 e il comando di
                    aggiornamento in blocco di US-035 sono un corpo solo: la
                    cifra del riquadro *è* la ragione del comando. Vivono
                    perciò in un componente unico, che ospita anche la macchina
                    a stati del lavoro — fuori di qui, dove sarebbe l'ennesima
                    parentesi di una pagina già lunga.
                  */}
                  {id && (
                    <AggiornaObsoleti
                      portfolioId={id}
                      posizioni={enrichedPositions}
                      onRicalcola={ricalcolaSilenzioso}
                      onTitoloInCorso={setIsinInLavorazione}
                    />
                  )}
                  {posizioniAperte.length === 0 ? (
                    // Ogni posizione di questo portafoglio è stata venduta per
                    // intero (US-044, criterio 3): la tabella dei posseduti non
                    // ha righe da mostrare, ma non è lo stato "mai popolato" di
                    // `riepilogo-vuoto` — il registro porta carichi e vendite,
                    // solo nessuno con residuo. Il risultato non è perduto: sta
                    // nel quadro qui sopra e nella sezione «Posizioni chiuse» qui
                    // sotto.
                    <div className="dettaglio-placeholder" data-testid="riepilogo-tutte-chiuse">
                      <span className="icona-conto" aria-hidden="true">&#9634;</span>
                      <p className="sottotitolo" style={{ fontFamily: "'IM Fell English', serif", fontStyle: 'italic', fontSize: '18px', fontWeight: 400 }}>
                        Nessun titolo è oggi posseduto
                      </p>
                      <p className="sottotitolo">
                        Ogni titolo mai iscritto in questo portafoglio è stato venduto per intero.
                        Il suo esito resta consultabile qui sotto, in <em>Posizioni chiuse</em>.
                      </p>
                    </div>
                  ) : (
                  <>
                  <div className="tabella-scroll">
                    <table className="mastro" data-testid="tabella-riepilogo" aria-label="Tabella titoli del portafoglio">
                      <thead>
                        <tr>
                          <th>Denominazione &middot; ISIN</th>
                          <th>Quantità</th>
                          <th>Pr. medio carico</th>
                          <th>Prezzo attuale</th>
                          <th>Ultimo rilevamento</th>
                          <th>Valore attuale</th>
                          <th>Differenza</th>
                        </tr>
                      </thead>
                      <tbody>
                        {posizioniAperte.map((ep) => (
                          <tr
                            key={ep.isin}
                            className={`cliccabile${isinInLavorazione === ep.isin ? ' in-lavorazione' : ''}`}
                            data-testid={`riepilogo-${ep.isin}`}
                            role="button"
                            tabIndex={0}
                            aria-label={`Apri la scheda del titolo ${ep.name ?? ep.isin}`}
                            onClick={() => apriSchedaTitolo(ep.isin)}
                            onKeyDown={(e) => {
                              // Una riga con role="button" deve rispondere a Enter e
                              // Spazio come un bottone vero. `preventDefault` sullo
                              // Spazio evita che la pagina scorra sotto l'utente.
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                apriSchedaTitolo(ep.isin);
                              }
                            }}
                          >
                            <td>
                              <CellaTitolo isin={ep.isin} nome={ep.name}>
                                {/*
                                  Il segnale che questo ISIN ha un passato: una
                                  volta chiuso — residuo azzerato, uscito dalla
                                  tabella — un nuovo carico lo riporta qui, e
                                  `soldQuantity > 0` è il solo modo di saperlo
                                  senza consultare «Posizioni chiuse» (US-044).
                                  Non è un caso della sola prima apertura dopo
                                  la chiusura: resta finché il titolo è tenuto,
                                  perché il registro delle vendite non si azzera
                                  mai da solo.
                                */}
                                {ep.soldQuantity > 0 && (
                                  <span className="badge-riaperta" data-testid={`badge-riaperta-${ep.isin}`}>
                                    &#8635; riaperta
                                  </span>
                                )}
                              </CellaTitolo>
                            </td>
                            <td className="cifra">{ep.totalQuantity.toLocaleString('it-IT')}</td>
                            {/* Il medio del residuo, assente a residuo 0: il trattino
                                dice «non esiste», uno zero direbbe «comprato a zero». */}
                            <td className={ep.avgLoadPrice !== null ? 'cifra euro' : 'cifra dato-mancante'}>
                              {ep.avgLoadPrice !== null ? ep.avgLoadPrice.toFixed(4) : '–'}
                            </td>
                            <td
                              className={ep.currentPrice !== null ? 'cifra euro' : 'cifra dato-mancante'}
                              data-testid={`prezzo-attuale-${ep.isin}`}
                            >
                              {ep.currentPrice !== null ? ep.currentPrice.toFixed(4) : '–'}
                            </td>
                            {/*
                              Un solo predicato per entrambe le nuove colonne, e
                              include `currentPrice`: una riga in cache può avere
                              `fetched_at` valorizzato e `price` nullo, e mostrare
                              lì un istante racconterebbe che «il prezzo è stato
                              rilevato» — falso, e proprio accanto a un «–».
                            */}
                            {/*
                              La marcatura di US-034 sta DENTRO questa cella, su
                              riga propria: nessuna ottava colonna, quindi il
                              `tfoot` conserva il suo colSpan={5} e i due totali
                              restano incolonnati sotto le rispettive intestazioni.
                              Il `data-testid` e la classe `dato-mancante` vivono
                              sullo <span> dell'istante e non sul <td>: le
                              asserzioni di US-032 leggono il testo *completo*
                              dell'elemento marcato, e la postilla lo sporcherebbe.
                            */}
                            <td className="cifra cella-rilevamento">
                              <span
                                className={
                                  ep.currentPrice !== null && ep.fetchedAt !== null
                                    ? `istante${ep.freshness === 'stale' ? ' segnato' : ''}`
                                    : 'istante dato-mancante'
                                }
                                data-testid={`rilevamento-${ep.isin}`}
                              >
                                {ep.currentPrice !== null && ep.fetchedAt !== null
                                  ? dataRilevamento(ep.fetchedAt)
                                  : '–'}
                              </span>
                              {/*
                                Il verdetto arriva già deciso dal server: qui si
                                sceglie solo la parola. Le tre varianti portano
                                testi diversi — non soltanto colori diversi —
                                perché la marcatura deve restare leggibile in
                                scala di grigi.

                                «In aggiornamento» (US-035) è transitoria e non
                                viene dal server: dice che *questa* riga è quella
                                in volo, e prevale sulle altre due perché mentre
                                si aspetta la risposta il verdetto d'archivio non
                                è più l'informazione utile. Le cifre restano però
                                quelle in archivio: la riga non si svuota mentre
                                si aspetta, com'era già la regola di US-030.
                              */}
                              {isinInLavorazione === ep.isin ? (
                                <small
                                  className="marca-rilevamento in-lavorazione"
                                  data-testid={`marca-rilevamento-${ep.isin}`}
                                >
                                  in aggiornamento
                                </small>
                              ) : (
                                ep.freshness !== 'current' && (
                                  <small
                                    className={`marca-rilevamento ${ep.freshness === 'stale' ? 'obsoleto' : 'mai-rilevato'}`}
                                    data-testid={`marca-rilevamento-${ep.isin}`}
                                  >
                                    {ep.freshness === 'stale' ? 'da aggiornare' : 'mai rilevato'}
                                  </small>
                                )
                              )}
                            </td>
                            <td className={ep.currentValue !== null ? 'cifra euro' : 'cifra dato-mancante'}>
                              {ep.currentValue !== null
                                ? ep.currentValue.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                : '–'}
                            </td>
                            <td className={
                              ep.difference === null
                                ? 'cifra dato-mancante'
                                : ep.difference >= 0
                                  ? 'cifra guadagno'
                                  : 'cifra perdita'
                            } data-testid={`diff-${ep.isin}`}>
                              {ep.difference !== null
                                ? `${ep.difference >= 0 ? '+' : ''}${ep.difference.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                : '–'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      {(() => {
                        const enrichedWithPrice = posizioniAperte.filter((ep) => ep.currentValue !== null);
                        if (enrichedWithPrice.length === 0) return null;
                        const totalCurrentValue = enrichedWithPrice.reduce((s, ep) => s + (ep.currentValue ?? 0), 0);
                        const totalDiff = enrichedWithPrice.reduce((s, ep) => s + (ep.difference ?? 0), 0);
                        return (
                          <tfoot>
                            <tr>
                              <td colSpan={5}>Totale portafoglio ({enrichedWithPrice.length} {enrichedWithPrice.length === 1 ? 'posizione valorizzata' : 'posizioni valorizzate'}{enrichedWithPrice.length < posizioniAperte.length ? ` di ${posizioniAperte.length}` : ''})</td>
                              <td className="cifra euro">{totalCurrentValue.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                              <td className={totalDiff >= 0 ? 'cifra guadagno' : 'cifra perdita'}>
                                {`${totalDiff >= 0 ? '+' : ''}${totalDiff.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                              </td>
                            </tr>
                          </tfoot>
                        );
                      })()}
                    </table>
                  </div>
                  <p style={{ fontFamily: "'IM Fell English', serif", fontStyle: 'italic', color: 'var(--seppia)', fontSize: '13px', margin: '14px 0 0', paddingTop: '10px', borderTop: '1px dotted rgba(110,90,54,.4)' }}>
                    I valori contrassegnati con &laquo;&ndash;&raquo; indicano che il prezzo corrente non è ancora
                    disponibile in archivio; la differenza non può essere calcolata.
                    Seleziona una riga per aprirne la <em>scheda titolo</em> con l&rsquo;anagrafica completa.
                  </p>
                  </>
                  )}
                  {/*
                    ══ Posizioni chiuse (US-044, FR-026, FR-013) ══
                    Visibile solo quando esiste almeno un ISIN a residuo 0: un
                    elenco derivato dallo stesso registro delle iscrizioni, non
                    un secondo archivio. Vive sotto la tabella dei posseduti (o
                    sotto il suo stato vuoto) e sopra i comandi di gestione del
                    conto, così che chi legge trovi prima "che cosa ha" e poi
                    "che cosa ha prodotto ciò che non ha più".
                  */}
                  {posizioniChiuse.length > 0 && (
                    <>
                      <div className="sezione-titolo" style={{ marginTop: '40px' }}>
                        Posizioni chiuse
                        <span className="nota">FR-026, FR-013 &middot; titoli venduti per intero — fuori dalla tabella qui sopra, dentro il risultato del portafoglio</span>
                      </div>

                      <div className="blocco-posizioni-chiuse" aria-label="Posizioni interamente vendute">
                        <div className="fascia-colore"></div>
                        <div className="contenuto">
                          <div className="capo-chiuse">
                            <span className="timbro carminio">Sola consultazione</span>
                            <span className="nota-capo">
                              quantità residua 0 su ciascuna riga: nulla da vendere né da rettificare, solo da leggere
                            </span>
                          </div>

                          <div className="tabella-scroll">
                            <table className="mastro chiuse" data-testid="tabella-posizioni-chiuse" aria-label="Tabella delle posizioni interamente vendute">
                              <thead>
                                <tr>
                                  <th>Denominazione &middot; ISIN</th>
                                  <th>Chiusa il</th>
                                  <th>Quantità venduta</th>
                                  <th>Incasso</th>
                                  <th>P&amp;L realizzato</th>
                                </tr>
                              </thead>
                              <tbody>
                                {posizioniChiuse.map((ep) => {
                                  const chiusuraIl = ultimaVenditaPerIsin.get(ep.isin);
                                  return (
                                    <tr key={ep.isin} data-testid={`posizione-chiusa-${ep.isin}`}>
                                      <td>
                                        <CellaTitolo isin={ep.isin} nome={ep.name} />
                                      </td>
                                      <td className="et-chiusura">{chiusuraIl ? dataCarico(chiusuraIl) : '–'}</td>
                                      <td className="cifra">{ep.soldQuantity.toLocaleString('it-IT')}</td>
                                      <td className="cifra euro">{ep.soldRevenue.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                      <td className={ep.realizedPnl >= 0 ? 'cifra guadagno' : 'cifra perdita'}>
                                        {`${ep.realizedPnl >= 0 ? '+' : ''}${ep.realizedPnl.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                              <tfoot>
                                <tr>
                                  <td colSpan={3}>Totale posizioni chiuse ({posizioniChiuse.length})</td>
                                  <td className="cifra euro">
                                    {posizioniChiuse.reduce((s, ep) => s + ep.soldRevenue, 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </td>
                                  {(() => {
                                    const totaleRealizzato = posizioniChiuse.reduce((s, ep) => s + ep.realizedPnl, 0);
                                    return (
                                      <td className={totaleRealizzato >= 0 ? 'cifra guadagno' : 'cifra perdita'}>
                                        {`${totaleRealizzato >= 0 ? '+' : ''}${totaleRealizzato.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                                      </td>
                                    );
                                  })()}
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        </div>
                      </div>

                      <p style={{ fontFamily: "'IM Fell English', serif", fontStyle: 'italic', color: 'var(--seppia)', fontSize: '13px', margin: '14px 0 0', paddingTop: '10px', borderTop: '1px dotted rgba(110,90,54,.4)' }}>
                        Le due cifre «Quantità venduta» e «Incasso» sono la somma di <em>tutti</em> gli scarichi
                        registrati su quell&rsquo;ISIN, anche quando sono avvenuti in più iscrizioni distinte. Il
                        P&amp;L realizzato è la stessa cifra congelata che concorre al quadro del risultato qui
                        sopra: non è ricalcolato qui, è letto da lì.
                      </p>
                    </>
                  )}
                </>
              )}

              <div className="bottoni" style={{ marginTop: '24px' }}>
                <Link to="/" className="bottone secondario">&larr; Torna all&rsquo;elenco portafogli</Link>
              </div>

              <div className="sezione-titolo" style={{ marginTop: '40px' }}>
                Gestione del conto
                <span className="nota">rinomina o estingui il portafoglio</span>
              </div>

              <section className="sezione-gestione" aria-label="Gestione portafoglio">
                <form onSubmit={(e) => { void handleRename(e); }} className="form-gestione">
                  <div className={`riga-modulo${renameError ? ' con-errore' : ''}`}>
                    <label htmlFor="rename-input">Rinomina conto</label>
                    <div className={`campo${renameError ? ' con-errore' : ''}`}>
                      <input
                        id="rename-input"
                        type="text"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        maxLength={80}
                        autoComplete="off"
                        disabled={renaming}
                      />
                      <button type="submit" className="bottone" disabled={renaming}>
                        {renaming ? 'Salvataggio…' : 'Salva'}
                      </button>
                      {renameError && (
                        <span role="alert" className="errore-campo visibile">{renameError}</span>
                      )}
                    </div>
                  </div>
                </form>

                <hr className="separatore-gestione" />

                <div className="zona-pericolo">
                  <p className="avviso-pericolo">
                    L&rsquo;eliminazione del conto è irreversibile: ogni dato associato sarà
                    cancellato dal registro.
                  </p>
                  <button
                    type="button"
                    onClick={() => { void handleDelete(); }}
                    className="bottone rosso"
                    disabled={deleting}
                  >
                    {deleting ? 'Eliminazione…' : 'Elimina portafoglio'}
                  </button>
                  {deleteError && <p className="messaggio errore">{deleteError}</p>}
                </div>
              </section>
            </>
          )}

          {/* ===== SCHEDA: Scheda titolo (US-018) ===== */}
          {scheda === 'titolo' && isinSelezionato !== null && id && (
            <>
              {/* Un aggiornamento riuscito dalla scheda cambia il prezzo in
                  archivio, quindi valore totale e tabella di riepilogo: senza
                  questo ricalcolo, tornando al Riepilogo l'utente ritroverebbe
                  il prezzo vecchio (US-030). Il ricalcolo non chiude la scheda:
                  finché `enrichedLoading` è true l'effetto che azzera
                  `isinSelezionato` si astiene. */}
              <SchedaTitolo portfolioId={id} isin={isinSelezionato} onDatiAggiornati={fetchEnriched} />

              <div className="bottoni" style={{ marginTop: '24px' }}>
                <button
                  type="button"
                  className="bottone secondario"
                  data-testid="btn-torna-riepilogo"
                  onClick={() => setScheda('riepilogo')}
                >
                  &larr; Torna al riepilogo
                </button>
              </div>
            </>
          )}

          {/* ===== SCHEDA: Carico titoli ===== */}
          {scheda === 'carico' && (
            <>
              {/* Banner successo */}
              {submitSuccess && (
                <div className="avviso-successo" role="status" data-testid="avviso-successo">
                  <span className="timbro-ok">Iscritto</span>
                  <p>{submitSuccess}</p>
                </div>
              )}

              {/* Banner errori sommario */}
              {hasFieldErrors && (
                <div className="banner-errore" role="alert" data-testid="banner-errore">
                  <span className="timbro-ko">Rifiutato</span>
                  <div>
                    <p>Il modulo contiene voci non valide. Correggere prima di procedere:</p>
                    <ul>
                      {fieldErrors.isin && <li>{fieldErrors.isin}</li>}
                      {fieldErrors.loadDate && <li>{fieldErrors.loadDate}</li>}
                      {fieldErrors.loadPrice && <li>{fieldErrors.loadPrice}</li>}
                      {fieldErrors.quantity && <li>{fieldErrors.quantity}</li>}
                    </ul>
                  </div>
                </div>
              )}

              {/* Errore submit server */}
              {submitError && (
                <p className="messaggio errore" role="alert" data-testid="submit-errore">
                  {submitError}
                </p>
              )}

              {/* Sezione modulo iscrizione */}
              <div className="sezione-titolo">
                Iscrizione nuova posizione
                <span className="nota">FR-007 · compila tutti i campi obbligatori</span>
              </div>

              <div className="riquadro-modulo">
                <div className="intestazione-modulo">
                  <span>Modulo di carico titolo</span>
                  <span className="num-modulo">MOD/CPC-001 · rev. I</span>
                </div>
                <div className="corpo-modulo">
                  <form id="form-carico" onSubmit={(e) => { void handleCarico(e); }} noValidate>

                    {/* Nome titolo (da ricerca) */}
                    {prefillName && (
                      <div className="riga-modulo">
                        <label htmlFor="carico-nome">
                          Nome titolo
                          <span className="sotto-etichetta">da ricerca — sola lettura</span>
                        </label>
                        <div className="campo">
                          <input
                            id="carico-nome"
                            data-testid="input-nome-titolo"
                            type="text"
                            value={prefillName}
                            readOnly
                            disabled
                            style={{ fontStyle: 'italic', color: 'var(--seppia)' }}
                          />
                        </div>
                      </div>
                    )}

                    {/* ISIN */}
                    <div className={`riga-modulo${fieldErrors.isin ? ' con-errore' : ''}`}>
                      <label htmlFor="carico-isin">
                        ISIN
                        <span className="sotto-etichetta">12 caratteri alfanumerici</span>
                      </label>
                      <div className={`campo${fieldErrors.isin ? ' con-errore' : ''}`}>
                        <input
                          id="carico-isin"
                          data-testid="input-isin"
                          type="text"
                          maxLength={12}
                          placeholder="es. IE00BJRHVJ28"
                          autoComplete="off"
                          spellCheck={false}
                          style={{ textTransform: 'uppercase', letterSpacing: '.1em' }}
                          value={isin}
                          onChange={(e) => setIsin(e.target.value)}
                          disabled={submitting}
                        />
                        {fieldErrors.isin && (
                          <span className="errore-campo visibile" role="alert" data-testid="err-isin">
                            {fieldErrors.isin}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Data di carico */}
                    <div className={`riga-modulo${fieldErrors.loadDate ? ' con-errore' : ''}`}>
                      <label htmlFor="carico-data">
                        Data di carico
                        <span className="sotto-etichetta">data di acquisto</span>
                      </label>
                      <div className={`campo${fieldErrors.loadDate ? ' con-errore' : ''}`}>
                        <input
                          id="carico-data"
                          data-testid="input-data"
                          type="date"
                          value={loadDate}
                          onChange={(e) => setLoadDate(e.target.value)}
                          disabled={submitting}
                        />
                        {fieldErrors.loadDate && (
                          <span className="errore-campo visibile" role="alert" data-testid="err-data">
                            {fieldErrors.loadDate}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Prezzo di acquisto */}
                    <div className={`riga-modulo${fieldErrors.loadPrice ? ' con-errore' : ''}`}>
                      <label htmlFor="carico-prezzo">
                        Prezzo di acquisto
                        <span className="sotto-etichetta">per singola quota, in euro</span>
                      </label>
                      <div className={`campo${fieldErrors.loadPrice ? ' con-errore' : ''}`}>
                        <span className="unita">EUR</span>
                        <input
                          id="carico-prezzo"
                          data-testid="input-prezzo"
                          type="number"
                          min="0.0001"
                          step="0.0001"
                          placeholder="0,0000"
                          value={loadPrice}
                          onChange={(e) => setLoadPrice(e.target.value)}
                          disabled={submitting}
                        />
                        {fieldErrors.loadPrice && (
                          <span className="errore-campo visibile" role="alert" data-testid="err-prezzo">
                            {fieldErrors.loadPrice}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Quantità */}
                    <div className={`riga-modulo${fieldErrors.quantity ? ' con-errore' : ''}`}>
                      <label htmlFor="carico-quantita">
                        Quantità
                        <span className="sotto-etichetta">numero intero di quote</span>
                      </label>
                      <div className={`campo${fieldErrors.quantity ? ' con-errore' : ''}`}>
                        <span className="unita">QTÀ</span>
                        <input
                          id="carico-quantita"
                          data-testid="input-quantita"
                          type="number"
                          min="1"
                          step="1"
                          placeholder="0"
                          value={quantity}
                          onChange={(e) => setQuantity(e.target.value)}
                          disabled={submitting}
                        />
                        {fieldErrors.quantity && (
                          <span className="errore-campo visibile" role="alert" data-testid="err-quantita">
                            {fieldErrors.quantity}
                          </span>
                        )}
                      </div>
                    </div>

                  </form>

                  <p className="nota-contabile">
                    Il controvalore di carico sarà calcolato automaticamente come prodotto di prezzo &times; quantità
                    e iscritto nel registro al momento del salvataggio.
                  </p>

                  <div className="bottoni">
                    <button
                      type="submit"
                      form="form-carico"
                      className="bottone"
                      data-testid="btn-iscrive"
                      disabled={submitting}
                    >
                      {submitting ? 'Iscrizione…' : 'Iscrive nel registro'}
                    </button>
                    <Link to="/" className="bottone secondario">Annulla</Link>
                  </div>
                </div>
              </div>

              {/* Divisore */}
              <hr className="divisore-sezione" />

              {/*
                Lo scarico sta **sotto** il carico e nella stessa linguetta
                (criterio 1): è il secondo verso della stessa operazione, e
                confinarlo in una scheda propria suggerirebbe che sia un'altra
                materia. La testata in carminio è ciò che rende impossibile
                confondere i due moduli.
              */}
              <div className="sezione-titolo" style={{ marginTop: '32px' }}>
                Scarico titoli &middot; registrazione di una vendita
                <span className="nota">
                  FR-022 &middot; la vendita è una nuova iscrizione, non la rettifica di un carico
                </span>
              </div>

              {ultimaVendita && (
                <div className="avviso-successo" role="status" data-testid="scarico-successo">
                  <span className="timbro-ok">Iscritto</span>
                  <p>
                    Scarico di <b>{ultimaVendita.quantity}</b> quote <b>{ultimaVendita.isin}</b> del{' '}
                    <b>{dataCarico(ultimaVendita.saleDate)}</b> a{' '}
                    <b>€ {prezzo(ultimaVendita.salePrice)}</b> iscritto nel registro. Nessun carico è
                    stato modificato o cancellato.
                  </p>
                </div>
              )}

              <ModuloScarico
                portfolioId={id ?? ''}
                titoli={titoliScaricabili}
                onIscritta={dopoScarico}
              />

              {/*
                Le due cifre che il criterio 3 chiede di leggere dopo l'operazione:
                la quantità residua e il prezzo medio **ricalcolato**, quest'ultimo
                accanto al valore che aveva prima. Il ricalcolo è il fatto — non
                l'assestamento di una cifra qualunque — e mostrarlo senza il termine
                di confronto lo renderebbe invisibile.
              */}
              {residuoDopoVendita && (
                <div
                  className={`riquadro-residuo${residuoDopoVendita.dopo.totalQuantity === 0 ? ' chiuso' : ''}`}
                  data-testid="riquadro-residuo"
                >
                  <div className="fascia-colore" />
                  <div className="contenuto">
                    <div className="casella-residuo">
                      <span className="et">Quantità residua</span>
                      <span className="cifra-grande" data-testid="residuo-quantita">
                        {residuoDopoVendita.dopo.totalQuantity.toLocaleString('it-IT')}
                      </span>
                      <span className="prima-dopo">
                        Σ carichi {residuoDopoVendita.dopo.loadedQuantity.toLocaleString('it-IT')} − Σ
                        vendite {residuoDopoVendita.dopo.soldQuantity.toLocaleString('it-IT')}
                      </span>
                    </div>
                    <div className="casella-residuo">
                      <span className="et">Prezzo medio del residuo</span>
                      {residuoDopoVendita.dopo.avgLoadPrice !== null ? (
                        <span className="cifra-grande" data-testid="residuo-prezzo-medio">
                          <span className="valuta">EUR</span>
                          {prezzo(residuoDopoVendita.dopo.avgLoadPrice)}
                        </span>
                      ) : (
                        /* A residuo 0 non esiste un residuo su cui calcolare la
                           media: si dichiara assente, mai «0,0000» (ADR-003). */
                        <span
                          className="cifra-grande assente dato-mancante"
                          data-testid="residuo-prezzo-medio"
                        >
                          —
                        </span>
                      )}
                      <span className="prima-dopo">
                        {residuoDopoVendita.prima.avgLoadPrice !== null ? (
                          <>
                            prima dell&apos;operazione{' '}
                            <s>€ {prezzo(residuoDopoVendita.prima.avgLoadPrice)}</s> — ricalcolato sui
                            soli lotti non consumati
                          </>
                        ) : (
                          <>ricalcolato sui soli lotti non consumati</>
                        )}
                      </span>
                    </div>
                    <div className="casella-residuo">
                      <span className="et">Controvalore di carico residuo</span>
                      <span className="cifra-grande" data-testid="residuo-controvalore">
                        <span className="valuta">EUR</span>
                        {importo(residuoDopoVendita.dopo.totalLoadValue)}
                      </span>
                      <span className="prima-dopo">
                        {residuoDopoVendita.dopo.totalQuantity === 0
                          ? 'il titolo contribuisce 0 al valore attuale del portafoglio'
                          : 'nessun carico modificato: il registro conserva tutte le iscrizioni'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Divisore */}
              <hr className="divisore-sezione" />

              {/* Sezione tabella posizioni aggregate per ISIN */}
              <div className="sezione-titolo" style={{ marginTop: '32px' }}>
                Titoli iscritti a conto
                <span className="contatore-posizioni" data-testid="contatore-posizioni">
                  {positionsLoading ? '…' : `${summaries.length} ISIN distint${summaries.length === 1 ? 'o' : 'i'}`}
                </span>
              </div>

              <div className="tabella-scroll">
                <table className="mastro" data-testid="tabella-posizioni">
                  <thead>
                    <tr>
                      {/* Stessa intestazione e stessa cella del Riepilogo (US-046):
                          una seconda variante direbbe che sono due dati diversi. */}
                      <th>Denominazione &middot; ISIN</th>
                      {/* «Residua» e non «totale» da US-042: le vendite iscritte ne
                          hanno consumato quote, e i carichi restano tutti a registro. */}
                      <th>Quantità residua</th>
                      <th>Prezzo medio carico</th>
                      <th>Controvalore carico</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaries.length === 0 ? (
                      <tr className="riga-vuota">
                        <td colSpan={4}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontFamily: "'Playfair Display', serif", fontSize: '20px', fontWeight: 700, opacity: .45 }}>
                              Nessuna posizione iscritta
                            </span>
                            <span style={{ fontSize: '14px' }}>
                              Compila il modulo sopra per registrare il primo titolo del portafoglio.
                            </span>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      summaries.map((summary) => (
                        <tr key={summary.isin} data-testid={`summary-${summary.isin}`}>
                          <td>
                            <CellaTitolo isin={summary.isin} nome={nomePerIsin.get(summary.isin) ?? null} />
                          </td>
                          <td className="cifra">{summary.totalQuantity}</td>
                          <td className={summary.avgLoadPrice !== null ? 'cifra euro' : 'cifra dato-mancante'}>
                            {summary.avgLoadPrice !== null ? summary.avgLoadPrice.toFixed(4) : '—'}
                          </td>
                          <td className="cifra euro">{summary.totalLoadValue.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {summaries.length > 0 && (
                    <tfoot>
                      <tr>
                        <td colSpan={3}>Totale controvalore carico</td>
                        <td className="cifra euro">
                          {summaries.reduce((sum, s) => sum + s.totalLoadValue, 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

              {/* Divisore registro carichi */}
              <hr className="divisore-sezione" />

              {/* Sezione registro delle iscrizioni: carichi e scarichi (ledger completo) */}
              <div className="sezione-titolo" style={{ marginTop: '32px' }}>
                Registro delle iscrizioni
                <span className="nota">
                  carichi e scarichi in ordine di data &middot; nessuna riga è mai riscritta
                </span>
              </div>

              {positionDeleteError && (
                <p className="messaggio errore" role="alert" data-testid="position-delete-errore">
                  {positionDeleteError}
                </p>
              )}

              <div className="tabella-scroll">
                <table className="mastro" data-testid="tabella-registro-carichi">
                  <thead>
                    <tr>
                      <th>Iscrizione</th>
                      {/* Come sopra e come nel Riepilogo (US-046). La colonna resta
                          per iscrizione e non per ISIN: raggrupparla qui
                          cancellerebbe l'ordine cronologico, che è il senso stesso
                          del registro. */}
                      <th>Denominazione &middot; ISIN</th>
                      <th>Data</th>
                      <th>Prezzo</th>
                      <th>Quantità</th>
                      <th>Controvalore</th>
                      <th>Residuo del lotto</th>
                      <th>Azioni</th>
                    </tr>
                  </thead>
                  <tbody>
                    {iscrizioni.length === 0 ? (
                      <tr className="riga-vuota">
                        <td colSpan={8}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontFamily: "'Playfair Display', serif", fontSize: '20px', fontWeight: 700, opacity: .45 }}>
                              Nessuna iscrizione registrata
                            </span>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      iscrizioni.map((iscrizione) => {
                        if (iscrizione.specie === 'scarico') {
                          const { vendita } = iscrizione;
                          return (
                            /* Lo scarico è una riga della **stessa** tabella, distinta
                               dalla marca in prima colonna. Il «Residuo del lotto» non
                               si applica: una vendita non è un lotto, e scriverci 0
                               affermerebbe che un lotto è esaurito. */
                            <tr
                              key={`scarico-${vendita.id}`}
                              className={`iscrizione-scarico${ultimaVendita?.id === vendita.id ? ' riga-nuova' : ''}`}
                              data-testid={`scarico-${vendita.id}`}
                            >
                              <td>
                                <span className="marca scarico">Scarico</span>
                              </td>
                              <td>
                                <CellaTitolo isin={vendita.isin} nome={nomePerIsin.get(vendita.isin) ?? null} />
                              </td>
                              <td className="cifra">{dataCarico(vendita.saleDate)}</td>
                              <td className="cifra euro">{prezzo(vendita.salePrice)}</td>
                              <td className="cifra">{vendita.quantity}</td>
                              <td className="cifra euro">{importo(vendita.salePrice * vendita.quantity)}</td>
                              <td className="cifra dato-mancante">—</td>
                              <td />
                            </tr>
                          );
                        }
                        const pos = iscrizione.posizione;
                        // Il residuo del lotto: `undefined` solo nell'istante fra la
                        // POST di un carico e la rilettura del registro, e in quel
                        // caso la quantità nominale è la risposta giusta — nessuna
                        // vendita può ancora averlo toccato.
                        const residuo = residuoPerLotto.get(pos.id) ?? pos.quantity;
                        const consumato = residuo < pos.quantity;
                        // La ragione, scritta sotto i comandi resi inerti: la versione
                        // breve che sta in una colonna, mentre il testo completo arriva
                        // dal server con il 409. Entrambe le varianti nominano **la
                        // vendita e l'errata** e non solo la misura del consumo — è la
                        // distinzione che il criterio 6 chiede di rendere esplicita, e
                        // ometterla nel caso parziale la renderebbe leggibile solo su
                        // metà dei lotti impediti.
                        const perche = consumato
                          ? residuo === 0
                            ? 'consumato da una vendita: si rettifica solo un\'iscrizione errata'
                            : `consumato in parte (${pos.quantity - residuo} quote su ${pos.quantity}) da una vendita: si rettifica solo un'iscrizione errata`
                          : null;
                        return editingPositionId === pos.id ? (
                          /* ── Form inline modifica ── */
                          <tr key={pos.id} data-testid={`edit-riga-${pos.id}`}>
                            <td>
                              <span className="marca">Carico</span>
                            </td>
                            <td>
                              <CellaTitolo isin={pos.isin} nome={nomePerIsin.get(pos.isin) ?? null} />
                            </td>
                            <td>
                              <input
                                type="date"
                                value={editLoadDate}
                                onChange={(e) => setEditLoadDate(e.target.value)}
                                data-testid="edit-input-data"
                                disabled={editSubmitting}
                                style={{ width: '130px' }}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                min="0.0001"
                                step="0.0001"
                                value={editLoadPrice}
                                onChange={(e) => setEditLoadPrice(e.target.value)}
                                data-testid="edit-input-prezzo"
                                disabled={editSubmitting}
                                style={{ width: '90px' }}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                min="1"
                                step="1"
                                value={editQuantity}
                                onChange={(e) => setEditQuantity(e.target.value)}
                                data-testid="edit-input-quantita"
                                disabled={editSubmitting}
                                style={{ width: '70px' }}
                              />
                            </td>
                            <td className="cifra euro">—</td>
                            <td className="cifra">{residuo}</td>
                            <td>
                              {editError && (
                                <span
                                  role="alert"
                                  className="errore-campo visibile"
                                  data-testid={`edit-errore-${pos.id}`}
                                  style={{ display: 'block', marginBottom: '4px' }}
                                >
                                  {editError}
                                </span>
                              )}
                              <button
                                type="button"
                                className="bottone"
                                data-testid={`btn-salva-modifica-${pos.id}`}
                                disabled={editSubmitting}
                                onClick={(e) => { void handleEditSubmit(e, pos.id); }}
                                style={{ marginRight: '4px' }}
                              >
                                {editSubmitting ? 'Salvataggio…' : 'Salva'}
                              </button>
                              <button
                                type="button"
                                className="bottone secondario"
                                data-testid={`btn-annulla-modifica-${pos.id}`}
                                disabled={editSubmitting}
                                onClick={cancelEdit}
                              >
                                Annulla
                              </button>
                            </td>
                          </tr>
                        ) : (
                          /* ── Riga normale ── */
                          <tr
                            key={pos.id}
                            className={`${pos.id === newPositionId ? 'riga-nuova' : ''}${residuo === 0 ? ' lotto-esaurito' : ''}`.trim()}
                            data-testid={`posizione-${pos.id}`}
                          >
                            <td>
                              <span className={residuo === 0 ? 'marca esaurito' : 'marca'}>
                                {residuo === 0 ? 'Carico · esaurito' : 'Carico'}
                              </span>
                            </td>
                            <td>
                              <CellaTitolo isin={pos.isin} nome={nomePerIsin.get(pos.isin) ?? null} />
                            </td>
                            <td className="cifra">{dataCarico(pos.loadDate)}</td>
                            <td className="cifra euro">{pos.loadPrice.toFixed(4)}</td>
                            <td className="cifra">{pos.quantity}</td>
                            <td className="cifra euro">{(pos.loadPrice * pos.quantity).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td className="cifra" data-testid={`residuo-lotto-${pos.id}`}>{residuo}</td>
                            <td>
                              {/*
                                Sul carico consumato i due comandi **non spariscono**:
                                restano al loro posto, tratteggiati e inerti, con la
                                ragione scritta sotto. Un bottone scomparso non spiega
                                la propria scomparsa, e la distinzione fra la
                                correzione di un'iscrizione errata e la vendita è
                                proprio ciò che il criterio 6 chiede di rendere
                                esplicito. `disabled` e non un `onClick` che avvisa: il
                                comando è impossibile, non solo sconsigliato — e il
                                server risponde comunque 409 se qualcuno lo forza.
                              */}
                              <button
                                type="button"
                                className={`bottone secondario${consumato ? ' impedito' : ''}`}
                                data-testid={`btn-modifica-${pos.id}`}
                                disabled={consumato}
                                onClick={() => startEdit(pos)}
                                style={{ marginRight: '4px' }}
                              >
                                Modifica
                              </button>
                              <button
                                type="button"
                                className={`bottone rosso${consumato ? ' impedito' : ''}`}
                                data-testid={`btn-rimuovi-${pos.id}`}
                                disabled={consumato || deletingPositionId === pos.id}
                                onClick={() => { void handleDeletePosition(pos.id); }}
                              >
                                {deletingPositionId === pos.id ? 'Rimozione…' : 'Rimuovi'}
                              </button>
                              {perche && (
                                <span className="perche" data-testid={`perche-impedito-${pos.id}`}>
                                  {perche}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  {iscrizioni.length > 0 && (
                    <tfoot>
                      {/*
                        Solo il controvalore, e **non** un totale di quantità. Il
                        registro elenca tutti gli ISIN del portafoglio, e sommare le
                        quote di titoli diversi produrrebbe un numero che non misura
                        nulla: «600 + 100 quote» di due strumenti distinti non è una
                        quantità. Gli euro invece si sommano, ed è la stessa riga di
                        totale che questa tabella aveva prima di US-042 — misurata
                        ora sul residuo invece che sul nominale.
                      */}
                      <tr>
                        <td colSpan={5}>Controvalore di carico del residuo</td>
                        <td className="cifra euro" data-testid="registro-controvalore-residuo">
                          {importo(
                            positions.reduce(
                              (somma, p) => somma + p.loadPrice * (residuoPerLotto.get(p.id) ?? p.quantity),
                              0,
                            ),
                          )}
                        </td>
                        <td />
                        <td />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </>
          )}
        </>
      )}
    </Foglio>
  );
}
