/**
 * Helper HTTP condivisi della suite E2E.
 *
 * Prima di US-029 ogni file spec riscriveva la propria copia di `createPortfolio`,
 * `addPosition` e `deletePortfolio`: sette definizioni identiche, e quindi sette
 * punti da correggere a ogni cambio di contratto. Qui vivono una volta sola.
 *
 * Ogni helper apre il proprio request context e lo smaltisce sempre, anche quando
 * la chiamata fallisce: un context non smaltito tiene vivo il processo worker.
 */
import { request, type APIRequestContext } from '@playwright/test';

export const BASE_API = 'http://localhost:3200';

/** Portafoglio così come lo restituisce l'API. */
export interface Portafoglio {
  id: number;
  name: string;
}

/** Posizione (carico) così come la restituisce l'API. */
export interface Posizione {
  id: number;
  portfolioId: number;
  isin: string;
  loadDate: string;
  loadPrice: number;
  quantity: number;
}

/** Esegue `fn` con un request context dedicato, smaltendolo in ogni caso. */
async function conContesto<T>(fn: (ctx: APIRequestContext) => Promise<T>): Promise<T> {
  const ctx = await request.newContext();
  try {
    return await fn(ctx);
  } finally {
    await ctx.dispose();
  }
}

/** Crea un portafoglio con il nome indicato. */
export async function creaPortafoglio(nome: string): Promise<Portafoglio> {
  return conContesto(async (ctx) => {
    const res = await ctx.post(`${BASE_API}/api/portfolios`, { data: { name: nome } });
    if (!res.ok()) {
      throw new Error(`creaPortafoglio("${nome}") ha risposto ${res.status()}: ${await res.text()}`);
    }
    return (await res.json()) as Portafoglio;
  });
}

/** Elenca tutti i portafogli presenti in archivio. */
export async function elencaPortafogli(): Promise<Portafoglio[]> {
  return conContesto(async (ctx) => {
    const res = await ctx.get(`${BASE_API}/api/portfolios`);
    if (!res.ok()) {
      throw new Error(`elencaPortafogli ha risposto ${res.status()}`);
    }
    return (await res.json()) as Portafoglio[];
  });
}

/** Legge il record di un singolo portafoglio. */
export async function leggiPortafoglio(id: number): Promise<Portafoglio> {
  return conContesto(async (ctx) => {
    const res = await ctx.get(`${BASE_API}/api/portfolios/${id}`);
    if (!res.ok()) {
      throw new Error(`leggiPortafoglio(${id}) ha risposto ${res.status()}`);
    }
    return (await res.json()) as Portafoglio;
  });
}

/**
 * Elimina un portafoglio. Non solleva: viene invocato anche in teardown, dove un
 * portafoglio già rimosso dal test stesso è un esito normale, non un errore.
 */
export async function eliminaPortafoglio(id: number): Promise<void> {
  await conContesto(async (ctx) => {
    await ctx.delete(`${BASE_API}/api/portfolios/${id}`);
  });
}

/** Aggiunge un carico al portafoglio e restituisce l'id della posizione creata. */
export async function aggiungiPosizione(
  portafoglioId: number,
  isin: string,
  dataCarico: string,
  prezzoCarico: number,
  quantita: number,
): Promise<number> {
  return conContesto(async (ctx) => {
    const res = await ctx.post(`${BASE_API}/api/portfolios/${portafoglioId}/positions`, {
      data: { isin, load_date: dataCarico, load_price: prezzoCarico, quantity: quantita },
    });
    if (!res.ok()) {
      throw new Error(`aggiungiPosizione(${portafoglioId}, ${isin}) ha risposto ${res.status()}`);
    }
    const dati = (await res.json()) as { id: number };
    return dati.id;
  });
}

/** Elenca le posizioni (carichi) di un portafoglio. */
export async function elencaPosizioni(portafoglioId: number): Promise<Posizione[]> {
  return conContesto(async (ctx) => {
    const res = await ctx.get(`${BASE_API}/api/portfolios/${portafoglioId}/positions`);
    if (!res.ok()) {
      throw new Error(`elencaPosizioni(${portafoglioId}) ha risposto ${res.status()}`);
    }
    return (await res.json()) as Posizione[];
  });
}

/** Aggiorna una posizione esistente (PATCH parziale). */
export async function modificaPosizione(
  portafoglioId: number,
  posizioneId: number,
  campi: Partial<{ load_date: string; load_price: number; quantity: number }>,
): Promise<void> {
  await conContesto(async (ctx) => {
    const res = await ctx.patch(
      `${BASE_API}/api/portfolios/${portafoglioId}/positions/${posizioneId}`,
      { data: campi },
    );
    if (!res.ok()) {
      throw new Error(`modificaPosizione(${posizioneId}) ha risposto ${res.status()}`);
    }
  });
}

/** Vendita (scarico) così come la restituisce l'API (US-042). */
export interface Vendita {
  id: number;
  portfolioId: number;
  isin: string;
  saleDate: string;
  salePrice: number;
  quantity: number;
}

/**
 * Esito di una richiesta che il test si aspetta possa **fallire**: stato e
 * messaggio, senza sollevare.
 *
 * Gli altri helper sollevano su risposta non ok, ed è giusto: un carico che non
 * si aggiunge è una premessa mancata, non un esito da esaminare. I rifiuti di
 * US-042 sono l'opposto — sono *il* fatto sotto esame — e vanno restituiti al
 * chiamante insieme al messaggio, che i criteri 4, 5 e 6 chiedono di distinguere.
 */
export interface EsitoRichiesta {
  stato: number;
  errore: string | null;
}

/** Legge il campo `error` di una risposta di rifiuto, `null` se non c'è. */
async function leggiErrore(res: { json: () => Promise<unknown> }): Promise<string | null> {
  try {
    const dati = (await res.json()) as { error?: string };
    return dati.error ?? null;
  } catch {
    return null;
  }
}

/** Registra una vendita e restituisce l'iscrizione creata. Solleva su rifiuto. */
export async function registraVendita(
  portafoglioId: number,
  isin: string,
  dataVendita: string,
  prezzoVendita: number,
  quantita: number,
): Promise<Vendita> {
  return conContesto(async (ctx) => {
    const res = await ctx.post(`${BASE_API}/api/portfolios/${portafoglioId}/sales`, {
      data: { isin, sale_date: dataVendita, sale_price: prezzoVendita, quantity: quantita },
    });
    if (!res.ok()) {
      throw new Error(
        `registraVendita(${portafoglioId}, ${isin}) ha risposto ${res.status()}: ${await res.text()}`,
      );
    }
    return (await res.json()) as Vendita;
  });
}

/** Tenta una vendita restituendo stato e messaggio, senza sollevare. */
export async function tentaVendita(
  portafoglioId: number,
  isin: string,
  dataVendita: string,
  prezzoVendita: number,
  quantita: number,
): Promise<EsitoRichiesta> {
  return conContesto(async (ctx) => {
    const res = await ctx.post(`${BASE_API}/api/portfolios/${portafoglioId}/sales`, {
      data: { isin, sale_date: dataVendita, sale_price: prezzoVendita, quantity: quantita },
    });
    return { stato: res.status(), errore: await leggiErrore(res) };
  });
}

/** Elenca le vendite di un portafoglio, in ordine di registro. */
export async function elencaVendite(portafoglioId: number): Promise<Vendita[]> {
  return conContesto(async (ctx) => {
    const res = await ctx.get(`${BASE_API}/api/portfolios/${portafoglioId}/sales`);
    if (!res.ok()) {
      throw new Error(`elencaVendite(${portafoglioId}) ha risposto ${res.status()}`);
    }
    return (await res.json()) as Vendita[];
  });
}

/** Tenta la rimozione di un carico restituendo stato e messaggio, senza sollevare. */
export async function tentaRimozionePosizione(
  portafoglioId: number,
  posizioneId: number,
): Promise<EsitoRichiesta> {
  return conContesto(async (ctx) => {
    const res = await ctx.delete(
      `${BASE_API}/api/portfolios/${portafoglioId}/positions/${posizioneId}`,
    );
    return { stato: res.status(), errore: await leggiErrore(res) };
  });
}
