import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { Portfolio } from '@portfolia/shared';

export function usePortafoglio() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);

  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  const handleRename = useCallback(async (e: React.FormEvent) => {
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
  }, [id, renameValue]);

  const handleDelete = useCallback(async () => {
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
  }, [id, navigate, portfolio?.name]);

  return {
    id,
    portfolio,
    error,
    loading,
    notFound,
    renameValue,
    setRenameValue,
    renameError,
    renaming,
    handleRename,
    deleteError,
    deleting,
    handleDelete,
  };
}
