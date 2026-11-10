/**
 * Small HTTP helpers for the Slice B test Edge Functions.
 *
 * `fetch` + JSON only. The Supabase SDK is deliberately absent: these functions
 * run on Deno and talk to PostgREST and Razorpay directly.
 */

export interface FunctionConfig {
  supabaseUrl: string;
  serviceRoleKey: string;
}

/** The live site and local dev only. Extra origins come from an env list. */
export const DEFAULT_ALLOWED_ORIGINS = [
  'https://www.shahsnutrition.food',
  'https://shahsnutrition.food',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

export const allowedOrigins = (raw: string | undefined): string[] => {
  const extra = (raw ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  return [...new Set([...DEFAULT_ALLOWED_ORIGINS, ...extra])];
};

const corsHeaders = (origin: string | null, allowed: string[]): Record<string, string> => {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
  if (origin && allowed.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
};

export const jsonResponse = (
  body: Record<string, unknown>,
  status: number,
  origin: string | null,
  allowed: string[],
): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders(origin, allowed) },
  });

export const preflightResponse = (request: Request, allowed: string[]): Response =>
  new Response(null, { status: 204, headers: corsHeaders(request.headers.get('origin'), allowed) });

/** Reads a small JSON object body; null when it is oversized or not an object. */
export const readJsonBody = async <T extends Record<string, unknown>>(request: Request, maxBytes = 4096): Promise<T | null> => {
  let text: string;
  try {
    text = await request.text();
  } catch {
    return null;
  }
  if (!text || text.length > maxBytes) return null;
  try {
    const value: unknown = JSON.parse(text);
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as T) : null;
  } catch {
    return null;
  }
};

const serviceHeaders = (config: FunctionConfig, extra: Record<string, string> = {}): Record<string, string> => ({
  apikey: config.serviceRoleKey,
  Authorization: `Bearer ${config.serviceRoleKey}`,
  'Content-Type': 'application/json',
  ...extra,
});

/** One PostgREST request with the service role. Callers decide what a failure means. */
export const restRequest = async (
  config: FunctionConfig,
  path: string,
  init: { method: 'GET' | 'POST' | 'PATCH'; body?: unknown; prefer?: string; signal?: AbortSignal } = { method: 'GET' },
): Promise<Response> =>
  fetch(`${config.supabaseUrl}/rest/v1${path}`, {
    method: init.method,
    headers: serviceHeaders(config, init.prefer ? { Prefer: init.prefer } : {}),
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: init.signal,
  });

/** Reads rows and throws on a non-2xx answer, so a function can answer 500 and be retried. */
export const restJson = async <T>(
  config: FunctionConfig,
  path: string,
  init: { method: 'GET' | 'POST' | 'PATCH'; body?: unknown; prefer?: string; signal?: AbortSignal } = { method: 'GET' },
): Promise<T> => {
  const response = await restRequest(config, path, init);
  if (!response.ok) throw new Error(`PostgREST ${init.method} ${path} answered ${response.status}`);
  return (await response.json()) as T;
};

export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const retryKeyPattern = /^[A-Za-z0-9_-]{16,64}$/;
