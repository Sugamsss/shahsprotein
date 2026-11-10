/**
 * Slice B TEST ONLY: creates a Razorpay test order from a frozen Slice A quote.
 *
 * The browser sends a quote id and its retry key. Every amount comes from the
 * saved quote snapshot, in integer paise. No live key is accepted, and the whole
 * function is off unless SLICE_B_TEST_CHECKOUT=on.
 *
 * Deploy to an isolated test project only (docs/slice-b-test.md).
 */
import {
  allowedOrigins,
  jsonResponse,
  preflightResponse,
  readJsonBody,
  restJson,
  retryKeyPattern,
  uuidPattern,
  type FunctionConfig,
} from '../_shared/http.ts';
import { isTestKeyId, rupeesToPaise } from '../_shared/razorpay.ts';

const FUNCTION = 'create-test-order';
const RAZORPAY_ORDERS_URL = 'https://api.razorpay.com/v1/orders';
const TIMEOUT_MS = 12_000;
const RETRY_WINDOW_MS = 15_000;

interface QuoteRow {
  id: string;
  snapshot: { quote_id?: unknown; total?: unknown; currency?: unknown };
  valid_at_send_until: string;
  confirmed_order_id: string | null;
}

interface IntentRow {
  id: string;
  quote_id: string;
  retry_key: string;
  status: 'created' | 'paid' | 'failed' | 'refunded' | 'cancelled';
  amount_paise: number;
  currency: string;
  receipt: string;
  provider_order_id: string | null;
  provider_payment_id: string | null;
  updated_at: string;
}

const readConfig = (): FunctionConfig | null => {
  const supabaseUrl = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/$/, '');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  return supabaseUrl && serviceRoleKey ? { supabaseUrl, serviceRoleKey } : null;
};

const receiptFor = (intentId: string): string => `sbt_${intentId.replace(/-/g, '').slice(0, 24)}`;

const orderResponse = (intent: IntentRow, keyId: string, reused: boolean): Record<string, unknown> => ({
  intent_id: intent.id,
  order_id: intent.provider_order_id,
  key_id: keyId,
  amount_paise: intent.amount_paise,
  currency: intent.currency,
  environment: 'test',
  quote_id: intent.quote_id,
  reused,
});

Deno.serve(async (request) => {
  const origin = request.headers.get('origin');
  const allowed = allowedOrigins(Deno.env.get('SLICE_B_ALLOWED_ORIGINS'));
  if (request.method === 'OPTIONS') return preflightResponse(request, allowed);
  const fail = (body: Record<string, unknown>, status: number) => jsonResponse(body, status, origin, allowed);
  if (request.method !== 'POST') return fail({ error: 'method_not_allowed' }, 405);

  if (Deno.env.get('SLICE_B_TEST_CHECKOUT') !== 'on') return fail({ error: 'test_checkout_disabled' }, 503);
  const keyId = Deno.env.get('RAZORPAY_TEST_KEY_ID') ?? '';
  const keySecret = Deno.env.get('RAZORPAY_TEST_KEY_SECRET') ?? '';
  if (!isTestKeyId(keyId) || !keySecret) {
    console.error(`${FUNCTION}: test keys are missing or are not rzp_test_ keys`);
    return fail({ error: 'test_keys_not_configured' }, 500);
  }
  const config = readConfig();
  if (!config) return fail({ error: 'server_not_configured' }, 500);

  const body = await readJsonBody<{ quote_id?: unknown; retry_key?: unknown }>(request);
  const quoteId = typeof body?.quote_id === 'string' ? body.quote_id : '';
  const retryKey = typeof body?.retry_key === 'string' ? body.retry_key : '';
  if (!uuidPattern.test(quoteId) || !retryKeyPattern.test(retryKey)) {
    return fail({ error: 'invalid_request' }, 400);
  }

  // The quote id is the capability here: guests have no session. Its snapshot is
  // the payable truth, so the browser never sends an amount.
  let quotes: QuoteRow[];
  try {
    quotes = await restJson<QuoteRow[]>(
      config,
      `/website_quotes?select=id,snapshot,valid_at_send_until,confirmed_order_id&id=eq.${quoteId}`,
    );
  } catch (error) {
    console.error(`${FUNCTION}: quote read failed`, (error as Error).message);
    return fail({ error: 'database_unavailable' }, 503);
  }
  const quote = quotes[0];
  if (!quote) return fail({ error: 'quote_not_found' }, 404);
  if (quote.confirmed_order_id) return fail({ error: 'already_ordered' }, 409);

  const usableUntil = Date.parse(quote.valid_at_send_until);
  if (!Number.isFinite(usableUntil) || usableUntil <= Date.now()) return fail({ error: 'quote_expired' }, 409);
  if (quote.snapshot?.quote_id !== quote.id || quote.snapshot?.currency !== 'INR') return fail({ error: 'quote_invalid' }, 409);
  const amountPaise = rupeesToPaise(quote.snapshot?.total);
  if (amountPaise === null) return fail({ error: 'quote_invalid' }, 409);

  const intentId = crypto.randomUUID();
  let intents: IntentRow[];
  try {
    intents = await restJson<IntentRow[]>(config, '/test_checkout_intents?on_conflict=quote_id', {
      method: 'POST',
      prefer: 'return=representation,resolution=ignore-duplicates',
      body: {
        id: intentId,
        quote_id: quoteId,
        retry_key: retryKey,
        status: 'created',
        amount_paise: amountPaise,
        currency: 'INR',
        receipt: receiptFor(intentId),
      },
    });
  } catch (error) {
    console.error(`${FUNCTION}: intent insert failed`, (error as Error).message);
    return fail({ error: 'database_unavailable' }, 503);
  }

  if (intents.length === 0) {
    // This quote already has an intent. Reuse its order; a second payable order
    // for one quote is exactly what this branch prevents.
    let existing: IntentRow[];
    try {
      existing = await restJson<IntentRow[]>(config, `/test_checkout_intents?select=*&quote_id=eq.${quoteId}`);
    } catch (error) {
      console.error(`${FUNCTION}: intent re-read failed`, (error as Error).message);
      return fail({ error: 'database_unavailable' }, 503);
    }
    const intent = existing[0];
    if (!intent) return fail({ error: 'intent_missing' }, 409);
    if (intent.status === 'paid' || intent.status === 'refunded') return fail({ error: 'already_paid' }, 409);
    if (intent.provider_order_id) return jsonResponse(orderResponse(intent, keyId, true), 200, origin, allowed);
    if (Date.now() - Date.parse(intent.updated_at) < RETRY_WINDOW_MS) {
      return jsonResponse({ error: 'creating_in_progress', retry_after_ms: RETRY_WINDOW_MS }, 409, origin, allowed);
    }
    // A previous attempt died before Razorpay answered. Take the pending intent
    // over with this call's retry key and try once more.
    try {
      const taken = await restJson<IntentRow[]>(config, `/test_checkout_intents?id=eq.${intent.id}&provider_order_id=is.null`, {
        method: 'PATCH',
        prefer: 'return=representation',
        body: { retry_key: retryKey, updated_at: new Date().toISOString() },
      });
      if (taken.length === 1) return await createProviderOrder(config, taken[0], keyId, keySecret, origin, allowed);
    } catch (error) {
      console.error(`${FUNCTION}: intent takeover failed`, (error as Error).message);
    }
    return jsonResponse({ error: 'creating_in_progress', retry_after_ms: RETRY_WINDOW_MS }, 409, origin, allowed);
  }

  return await createProviderOrder(config, intents[0], keyId, keySecret, origin, allowed);
});

async function createProviderOrder(
  config: FunctionConfig,
  intent: IntentRow,
  keyId: string,
  keySecret: string,
  origin: string | null,
  allowed: string[],
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(RAZORPAY_ORDERS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${keyId}:${keySecret}`)}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: intent.amount_paise,
        currency: intent.currency,
        receipt: intent.receipt,
        partial_payment: false,
        notes: { environment: 'test', intent_id: intent.id, quote_id: intent.quote_id },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    console.error(`${FUNCTION}: Razorpay request failed`, (error as Error).name);
    return jsonResponse({ error: 'order_not_created' }, 502, origin, allowed);
  }
  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).slice(0, 300);
    console.error(`${FUNCTION}: Razorpay answered ${response.status}`, detail);
    return jsonResponse({ error: 'order_not_created' }, 502, origin, allowed);
  }

  let created: { id?: unknown; amount?: unknown; currency?: unknown };
  try {
    created = (await response.json()) as typeof created;
  } catch {
    return jsonResponse({ error: 'order_not_created' }, 502, origin, allowed);
  }
  const providerOrderId = typeof created.id === 'string' && created.id.startsWith('order_') ? created.id : '';
  if (!providerOrderId || created.amount !== intent.amount_paise || created.currency !== intent.currency) {
    console.error(`${FUNCTION}: Razorpay returned an unexpected order shape`);
    return jsonResponse({ error: 'order_not_created' }, 502, origin, allowed);
  }

  try {
    const saved = await restJson<IntentRow[]>(config, `/test_checkout_intents?id=eq.${intent.id}&provider_order_id=is.null`, {
      method: 'PATCH',
      prefer: 'return=representation',
      body: { provider_order_id: providerOrderId, updated_at: new Date().toISOString() },
    });
    if (saved.length === 0) {
      const current = await restJson<IntentRow[]>(config, `/test_checkout_intents?select=*&id=eq.${intent.id}`);
      if (current[0]?.provider_order_id) return jsonResponse(orderResponse(current[0], keyId, true), 200, origin, allowed);
      return jsonResponse({ error: 'creating_in_progress', retry_after_ms: RETRY_WINDOW_MS }, 409, origin, allowed);
    }
    return jsonResponse(orderResponse(saved[0], keyId, false), 200, origin, allowed);
  } catch (error) {
    console.error(`${FUNCTION}: intent update failed`, (error as Error).message);
    return jsonResponse({ error: 'database_unavailable' }, 503, origin, allowed);
  }
}
