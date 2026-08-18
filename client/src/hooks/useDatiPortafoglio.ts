import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Position, PositionSummary, EnrichedPositionSummary, Sale, CaricoLotto, VenditaLotto, PortfolioSeriesEntry } from '@portfolia/shared';
import { residuoPerIsin, rigiocaRegistro } from '@portfolia/shared';
import type { TitoloScaricabile } from '../components/ModuloScarico.js';

export type Scheda = 'riepilogo' | 'carico' | 'titolo';

export function useDatiPortafoglio(
  id: string | undefined,
  ready: boolean,
  scheda: Scheda,
  setScheda: React.Dispatch<React.SetStateAction<Scheda>>,
) {
  const [positions, setPositions] = useState<Position[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [ultimaVendita, setUltimaVendita] = useState<Sale | null>(null);
  const [summaries, setSummaries] = useState<PositionSummary[]>([]);
  const [enrichedPositions, setEnrichedPositions] = useState<EnrichedPositionSummary[]>([]);
  const [enrichedLoading, setEnrichedLoading] = useState(false);
  const [series, setSeries] = useState<PortfolioSeriesEntry[]>([]);
  const [seriesLoading, setSeriesLoading] = useState(false);
  const [isinSelezionato, setIsinSelezionato] = useState<string | null>(null);
  const [isinInLavorazione, setIsinInLavorazione] = useState<string | null>(null);
  const [positionsLoading, setPositionsLoading] = useState(false);

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
    if (ready) {
      fetchPositions();
      fetchSales();
      fetchSummary();
      fetchEnriched();
      fetchSeries();
    }
  }, [ready, fetchPositions, fetchSales, fetchSummary, fetchEnriched, fetchSeries]);

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
      perIsin.get(vendita.isin)?.vendite.push({
        id: vendita.id,
        saleDate: vendita.saleDate,
        quantity: vendita.quantity,
        salePrice: vendita.salePrice,
      });
    }
    return perIsin;
  }, [positions, sales]);

  const residuoPerLotto = useMemo(() => {
    const residui = new Map<number, number>();
    for (const registro of registri.values()) {
      for (const lotto of rigiocaRegistro(registro).lotti) {
        residui.set(lotto.caricoId, lotto.quantitaResidua);
      }
    }
    return residui;
  }, [registri]);

  const posizioniAperte = useMemo(
    () => enrichedPositions.filter((ep) => ep.totalQuantity > 0),
    [enrichedPositions],
  );
  const posizioniChiuse = useMemo(
    () => enrichedPositions.filter((ep) => ep.totalQuantity === 0),
    [enrichedPositions],
  );

  const ultimaVenditaPerIsin = useMemo(() => {
    const date = new Map<string, string>();
    for (const [isin, registro] of registri.entries()) {
      const { vendite } = rigiocaRegistro(registro);
      const ultima = vendite.at(-1);
      if (ultima) date.set(isin, ultima.saleDate);
    }
    return date;
  }, [registri]);

  const nomePerIsin = useMemo(() => {
    const nomi = new Map<string, string>();
    for (const ep of enrichedPositions) {
      if (ep.name) nomi.set(ep.isin, ep.name);
    }
    return nomi;
  }, [enrichedPositions]);

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

  const dopoScarico = useCallback(
    (vendita: Sale) => {
      setUltimaVendita(vendita);
      fetchPositions();
      fetchSales();
      fetchSummary();
      void fetchEnriched();
    },
    [fetchPositions, fetchSales, fetchSummary, fetchEnriched],
  );

  const ricalcolaSilenzioso = useCallback(() => fetchEnriched(true), [fetchEnriched]);

  const primoGiroDellaScheda = useRef(true);
  useEffect(() => {
    if (primoGiroDellaScheda.current) {
      primoGiroDellaScheda.current = false;
      return;
    }
    if (scheda === 'riepilogo') void fetchEnriched(true);
  }, [scheda, fetchEnriched]);

  useEffect(() => {
    if (isinSelezionato === null || enrichedLoading) return;
    if (!enrichedPositions.some((ep) => ep.isin === isinSelezionato)) {
      setIsinSelezionato(null);
      setScheda((corrente) => (corrente === 'titolo' ? 'riepilogo' : corrente));
    }
  }, [enrichedPositions, enrichedLoading, isinSelezionato, setScheda]);

  return {
    positions,
    sales,
    ultimaVendita,
    summaries,
    enrichedPositions,
    enrichedLoading,
    series,
    seriesLoading,
    isinSelezionato,
    setIsinSelezionato,
    isinInLavorazione,
    setIsinInLavorazione,
    positionsLoading,
    registri,
    residuoPerLotto,
    posizioniAperte,
    posizioniChiuse,
    ultimaVenditaPerIsin,
    nomePerIsin,
    titoliScaricabili,
    iscrizioni,
    residuoDopoVendita,
    dopoScarico,
    ricalcolaSilenzioso,
    fetchPositions,
    fetchSummary,
    fetchEnriched,
  };
}
