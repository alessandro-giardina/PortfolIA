import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isValidIsin, normalizeIsin } from '@portfolia/shared';
import type { SecurityInfo, SecurityLookupResponse, RefetchConfirmation } from '@portfolia/shared';

type DataSource = 'borsaitaliana' | 'morningstar';
type Status = 'idle' | 'loading' | 'found' | 'notfound' | 'error';

export function useRicercaTitolo() {
  const navigate = useNavigate();
  const [isin, setIsin] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [security, setSecurity] = useState<SecurityInfo | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null);
  const [confirmation, setConfirmation] = useState<RefetchConfirmation | null>(null);
  const [dataSource, setDataSource] = useState<DataSource>('borsaitaliana');
  const [esito, setEsito] = useState<string | null>(null);
  const [searchedIsin, setSearchedIsin] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);

  function handleDialogConfirm(portfolioId: number) {
    setDialogOpen(false);
    navigate(`/portfolio/${portfolioId}`, {
      state: {
        prefill: {
          isin: security?.isin ?? '',
          name: security?.name ?? null,
          price: security?.price ?? null,
          currency: security?.currency ?? null,
        },
      },
    });
  }

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
    setDataSource('borsaitaliana');
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
      setDataSource(body.dataSource ?? 'borsaitaliana');
      setStatus('found');
    } catch {
      setStatus('error');
      setEsito('Backend non raggiungibile.');
    }
  }

  return {
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
  };
}
