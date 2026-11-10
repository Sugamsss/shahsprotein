/**
 * Slice B TEST ONLY: Razorpay webhook receiver.
 *
 * Order: read the raw body once → verify X-Razorpay-Signature (hex HMAC-SHA256,
 * separate webhook secret) → parse → find the intent → check amount/currency →
 * guarded status change → record the event. Nothing here creates an order or
 * touches the kitchen: this scaffold only releases payment state.
 *
 * Deploy with `--no-verify-jwt`; the signature is the authentication.
 */
import { allowedOrigins, jsonResponse, restJson, type FunctionConfig } from '../_shared/http.ts';
import {
  canApplyStatus,
  intentStatusForEvent,
  readRazorpayWebhook,
  sha256Hex,
  verifyWebhookSignature,
  type IntentStatus,
} from '../_shared/razorpay.ts';

const FUNCTION = 'verify-test-webhook';
const MAX_BODY_BYTES = 200_000;
const HANDLED = new Set(['payment.captured', 'order.paid', 'payment.failed', 'refund.processed']);

interface IntentRow {
  id: string;
  status: IntentStatus;
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
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  const reply = (body: Record<string, unknown>, status: number) => jsonResponse(body, status, origin, allowed);
  if (request.method !== 'POST') return reply({ error: 'method_not_allowed' }, 405);

  const secret = Deno.env.get('RAZORPAY_TEST_WEBHOOK_SECRET') ?? '';
  if (!secret) {
    console.error(`${FUNCTION}: RAZORPAY_TEST_WEBHOOK_SECRET is not set`);
    return reply({ error: 'webhook_not_configured' }, 500);
  }
  const config = readConfig();
  if (!config) return reply({ error: 'server_not_configured' }, 500);

  // Raw bytes, once. Re-serialising JSON would change the signature input.
  const rawBody = await request.text();
  if (!rawBody || rawBody.length > MAX_BODY_BYTES) return reply({ error: 'invalid_body' }, 413);

  if (!(await verifyWebhookSignature(rawBody, request.headers.get('x-razorpay-signature'), secret))) {
    console.warn(`${FUNCTION}: rejected a webhook with a bad signature`);
    return reply({ error: 'invalid_signature' }, 401);
  }

  const summary = readRazorpayWebhook(rawBody);
  if (!summary) return reply({ error: 'invalid_payload' }, 400);

  const payloadHash = await sha256Hex(rawBody);
  const eventId = request.headers.get('x-razorpay-event-id')?.trim() || `body:${payloadHash}`;
  const nextStatus = intentStatusForEvent(summary.event);

  // Unknown or informational events are acknowledged and change nothing.
  if (!nextStatus || !HANDLED.has(summary.event)) return reply({ ok: true, ignored: true, event: summary.event }, 200);

  try {
    const seen = await restJson<Array<{ id: string }>>(
      config,
      `/test_payment_events?select=id&event_id=eq.${encodeURIComponent(eventId)}`,
    );
    if (seen.length > 0) return reply({ ok: true, duplicate: true }, 200);

    const record = async (result: 'applied' | 'ignored' | 'amount_mismatch' | 'unknown_intent', intentId: string | null) => {
      await restJson(config, '/test_payment_events?on_conflict=event_id', {
        method: 'POST',
        prefer: 'return=representation,resolution=ignore-duplicates',
        body: {
          event_id: eventId,
          intent_id: intentId,
          event_type: summary.event,
          provider_order_id: summary.orderId,
          provider_payment_id: summary.paymentId,
          amount_paise: summary.amountPaise,
          result,
          payload_sha256: payloadHash,
        },
      });
    };

    let intents: IntentRow[] = [];
    if (summary.orderId) {
      intents = await restJson<IntentRow[]>(
        config,
        `/test_checkout_intents?select=id,status,amount_paise,currency,provider_order_id,provider_payment_id&provider_order_id=eq.${encodeURIComponent(summary.orderId)}`,
      );
    }
    if (intents.length === 0 && summary.paymentId) {
      intents = await restJson<IntentRow[]>(
        config,
        `/test_checkout_intents?select=id,status,amount_paise,currency,provider_order_id,provider_payment_id&provider_payment_id=eq.${encodeURIComponent(summary.paymentId)}`,
      );
    }
    const intent = intents[0];
    if (!intent) {
      await record('unknown_intent', null);
      console.warn(`${FUNCTION}: ${summary.event} for an unknown intent`);
      return reply({ ok: true, review: 'unknown_intent' }, 200);
    }

    // Partial refunds are launch work: an amount that is not the whole captured
    // amount is kept for review and does not change the intent.
    if (summary.amountPaise !== intent.amount_paise || summary.currency !== intent.currency) {
      await record('amount_mismatch', intent.id);
      console.warn(`${FUNCTION}: amount/currency mismatch for intent ${intent.id}`);
      return reply({ ok: true, review: 'amount_mismatch' }, 200);
    }

    if (!canApplyStatus(intent.status, nextStatus)) {
      await record('ignored', intent.id);
      return reply({ ok: true, ignored: true }, 200);
    }

    const saved = await restJson<IntentRow[]>(config, `/test_checkout_intents?id=eq.${intent.id}&status=eq.${intent.status}`, {
      method: 'PATCH',
      prefer: 'return=representation',
      body: {
        status: nextStatus,
        provider_order_id: intent.provider_order_id ?? summary.orderId,
        provider_payment_id: summary.paymentId ?? intent.provider_payment_id,
        updated_at: new Date().toISOString(),
      },
    });
    if (saved.length === 0) {
      await record('ignored', intent.id);
      return reply({ ok: true, ignored: true }, 200);
    }

    await record('applied', intent.id);
    return reply({ ok: true, status: nextStatus }, 200);
  } catch (error) {
    // Not acknowledged: Razorpay retries, and the guarded patch/insert makes a
    // retry safe.
    console.error(`${FUNCTION}: processing failed`, (error as Error).message);
    return reply({ error: 'database_unavailable' }, 500);
  }
});
