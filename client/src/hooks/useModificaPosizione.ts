import { useState } from 'react';
import type { Position, UpdatePositionRequest } from '@portfolia/shared';

export function useModificaPosizione(
  id: string | undefined,
  onPositionChanged: () => void,
) {
  const [editingPositionId, setEditingPositionId] = useState<number | null>(null);
  const [editLoadDate, setEditLoadDate] = useState('');
  const [editLoadPrice, setEditLoadPrice] = useState('');
  const [editQuantity, setEditQuantity] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [positionDeleteError, setPositionDeleteError] = useState<string | null>(null);
  const [deletingPositionId, setDeletingPositionId] = useState<number | null>(null);

  function startEdit(pos: Position) {
    setEditingPositionId(pos.id);
    setEditLoadDate(pos.loadDate);
    setEditLoadPrice(String(pos.loadPrice));
    setEditQuantity(String(pos.quantity));
    setEditError(null);
  }

  function cancelEdit() {
    setEditingPositionId(null);
    setEditError(null);
  }

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

    const normalizzatoEdit = editQuantity.trim().replace(',', '.');
    const qty = parseFloat(normalizzatoEdit);
    if (!editQuantity || isNaN(qty) || qty <= 0 || Math.round(qty * 1e6) / 1e6 !== qty) {
      setEditError('La quantità deve essere un numero positivo con al più sei decimali.');
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
      onPositionChanged();
    } catch {
      setEditError('Backend non raggiungibile.');
    } finally {
      setEditSubmitting(false);
    }
  }

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
      onPositionChanged();
    } catch {
      setPositionDeleteError('Backend non raggiungibile.');
    } finally {
      setDeletingPositionId(null);
    }
  }

  return {
    editingPositionId,
    editLoadDate,
    setEditLoadDate,
    editLoadPrice,
    setEditLoadPrice,
    editQuantity,
    setEditQuantity,
    editError,
    editSubmitting,
    positionDeleteError,
    setPositionDeleteError,
    deletingPositionId,
    startEdit,
    cancelEdit,
    handleEditSubmit,
    handleDeletePosition,
  };
}
