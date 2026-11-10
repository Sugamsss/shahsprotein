/**
 * Slice B TEST ONLY: read one checkout intent back for its own browser.
 *
 * Capability: intent id + the retry key that created it. Read-only. The optional
 * Razorpay return ids are only checked, never trusted as proof: the webhook is
 * what moves an intent to paid (docs/slice-b-test.md).
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
import { verifyPaymentSignature } from '../_shared/razorpay.ts';

const FUNCTION = 'checkout-status';

interface IntentRow {
  id: string;
  status: string;
  amount_paise: number;
  currency: string;
  provider_order_id: string | null;
  provider_payment_id: string | null;
}

const readConfig = (): FunctionConfig | null => {
  const supabaseUrl = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/$/, '');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  return supabaseUrl && serviceRoleKey ? { supabaseUrl, serviceRoleKey } : null;
};

Deno.serve(async (request) => {
  const origin = request.headers.get('origin');
  const allowed = allowedOrigins(Deno.env.get('SLICE_B_ALLOWED_ORIGINS'));
  if (request.method === 'OPTIONS') return preflightResponse(request, allowed);
  const fail = (body: Record<string, unknown>, status: number) => jsonResponse(body, status, origin, allowed);
  if (request.method !== 'POST') return fail({ error: 'method_not_allowed' }, 405);
  if (Deno.env.get('SLICE_B_TEST_CHECKOUT') !== 'on') return fail({ error: 'test_checkout_disabled' }, 503);

  const config = readConfig();
  if (!config) return fail({ error: 'server_not_configured' }, 500);

  const body = await readJsonBody<{
    intent_id?: unknown;
    retry_key?: unknown;
    razorpay_payment_id?: unknown;
    razorpay_signature?: unknown;
  }>(request);
  const intentId = typeof body?.intent_id === 'string' ? body.intent_id : '';
  const retryKey = typeof body?.retry_key === 'string' ? body.retry_key : '';
  const paymentId = typeof body?.razorpay_payment_id === 'string' ? body.razorpay_payment_id : '';
  const signature = typeof body?.razorpay_signature === 'string' ? body.razorpay_signature : '';
  if (!uuidPattern.test(intentId) || !retryKeyPattern.test(retryKey)) return fail({ error: 'invalid_request' }, 400);
  if (Boolean(paymentId) !== Boolean(signature)) return fail({ error: 'invalid_request' }, 400);

  let intents: IntentRow[];
  try {
    intents = await restJson<IntentRow[]>(
      config,
      `/test_checkout_intents?select=id,status,amount_paise,currency,provider_order_id,provider_payment_id&id=eq.${intentId}&retry_key=eq.${encodeURIComponent(retryKey)}`,
    );
  } catch (error) {
    console.error(`${FUNCTION}: intent read failed`, (error as Error).message);
    return fail({ error: 'database_unavailable' }, 503);
  }
  const intent = intents[0];
  if (!intent) return fail({ error: 'not_found' }, 404);

  let returnSignatureValid: boolean | null = null;
  if (paymentId && signature) {
    const keySecret = Deno.env.get('RAZORPAY_TEST_KEY_SECRET') ?? '';
    returnSignatureValid = Boolean(keySecret) && Boolean(intent.provider_order_id)
      && (await verifyPaymentSignature(intent.provider_order_id ?? '', paymentId, signature, keySecret));
  }

  return jsonResponse({
    status: intent.status,
    amount_paise: intent.amount_paise,
    currency: intent.currency,
    razorpay_order_id: intent.provider_order_id,
    razorpay_payment_id: intent.provider_payment_id,
    return_signature_valid: returnSignatureValid,
    environment: 'test',
  }, 200, origin, allowed);
});
