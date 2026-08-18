import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { isValidIsin } from '@portfolia/shared';
import type { CreatePositionRequest, Position } from '@portfolia/shared';

interface PrefillState {
  isin: string;
  name: string | null;
  price: number | null;
  currency: string | null;
}

export function useFormCarico(
  id: string | undefined,
  onPositionCreated: () => void,
) {
  const location = useLocation();

  const [isin, setIsin] = useState('');
  const [prefillName, setPrefillName] = useState<string | null>(null);
  const [loadDate, setLoadDate] = useState('');
  const [loadPrice, setLoadPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [newPositionId, setNewPositionId] = useState<number | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    isin?: string;
    loadDate?: string;
    loadPrice?: string;
    quantity?: string;
  }>({});

  const hasPrefill = !!(location.state as { prefill?: PrefillState } | null)?.prefill?.isin;

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
    const normalizzato = quantity.trim().replace(',', '.');
    const qty = parseFloat(normalizzato);
    if (!quantity || isNaN(qty) || qty <= 0 || Math.round(qty * 1e6) / 1e6 !== qty) {
      errors.quantity = 'La quantità deve essere un numero positivo con al più sei decimali.';
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
        quantity: parseFloat(quantity.trim().replace(',', '.')),
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
      setIsin('');
      setLoadDate('');
      setLoadPrice('');
      setQuantity('');
      setFieldErrors({});
      onPositionCreated();
    } catch {
      setSubmitError('Backend non raggiungibile.');
    } finally {
      setSubmitting(false);
    }
  }

  return {
    isin,
    setIsin,
    prefillName,
    loadDate,
    setLoadDate,
    loadPrice,
    setLoadPrice,
    quantity,
    setQuantity,
    submitError,
    submitSuccess,
    submitting,
    newPositionId,
    fieldErrors,
    hasPrefill,
    handleCarico,
  };
}
