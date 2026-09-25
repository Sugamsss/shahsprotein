// The landing page's own way to call public Supabase RPCs: plain fetch, so
// supabase-js stays out of the landing and order popup bundles. Used by click
// events, order saves and the stock check. Neither call ever throws.

const PRODUCTION_HOSTS = ['shahsnutrition.food', 'www.shahsnutrition.food'];

/**
 * Only the live site writes events and saves orders. Local dev, `vite preview` and
 * Vercel preview deploys all point at the production Supabase, so they must stay
 * out of the data. `VITE_TRACK_EVENTS=true` forces it, for testing against a local Supabase.
 */
export const isLiveSite = (): boolean =>
  import.meta.env.VITE_TRACK_EVENTS === 'true'
  || (import.meta.env.PROD && PRODUCTION_HOSTS.includes(window.location.hostname));

const endpoint = (name: string): { url: string; key: string } | null => {
  const base = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  return base && key ? { url: `${base}/rest/v1/rpc/${name}`, key } : null;
};

/**
 * POSTs to an RPC and moves on: fire and forget, never throws, the answer is ignored.
 * `keepalive` lets the request finish while the page closes or WhatsApp opens.
 * It doesn't check `isLiveSite()`; callers that write data do.
 */
export const postPublicRpc = (name: string, body: Record<string, unknown>): void => {
  const target = endpoint(name);
  if (!target) return;
  try {
    fetch(target.url, {
      method: 'POST',
      keepalive: true,
      headers: { apikey: target.key, Authorization: `Bearer ${target.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => undefined);
  } catch {
    // Never break the click that started it.
  }
};

/**
 * GETs a `stable` RPC with the key in the query string: a simple request, so
 * there's no CORS preflight. Returns the parsed JSON, or null on any failure or timeout.
 */
export const getPublicRpc = async (name: string, { timeoutMs }: { timeoutMs: number }): Promise<unknown> => {
  const target = endpoint(name);
  if (!target) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${target.url}?apikey=${encodeURIComponent(target.key)}`, { signal: controller.signal });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};
