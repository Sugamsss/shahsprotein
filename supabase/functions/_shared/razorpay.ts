/**
 * Razorpay test-mode rules shared by the Edge Functions and the unit tests.
 *
 * Pure Web Crypto and plain objects only: no Deno globals, no SDK, no network.
 * The functions wrap these; `razorpay.test.ts` pins them with fixtures.
 */

export const RAZORPAY_MIN_PAISE = 100;
export const RAZORPAY_MAX_PAISE = 50_000_000;
const HEX_64 = /^[0-9a-f]{64}$/;

export type IntentStatus = 'created' | 'paid' | 'failed' | 'refunded' | 'cancelled';
export type EventStatus = 'paid' | 'failed' | 'refunded';

/**
 * Slice A quotes are whole rupees; Razorpay wants integer paise. Anything that
 * is not a whole ₹ amount inside the provider's bounds is refused, never rounded.
 */
export const rupeesToPaise = (total: unknown): number | null => {
  if (typeof total !== 'number' || !Number.isInteger(total)) return null;
  const paise = total * 100;
  if (!Number.isSafeInteger(paise) || paise < RAZORPAY_MIN_PAISE || paise > RAZORPAY_MAX_PAISE) return null;
  return paise;
};

/** Test keys only. A `rzp_live_...` key is refused before any API call. */
export const isTestKeyId = (keyId: string): boolean => /^rzp_test_[A-Za-z0-9]+$/.test(keyId);

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

const hmacKey = (secret: string) =>
  crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);

export const hmacSha256Hex = async (secret: string, message: string): Promise<string> => {
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret), new TextEncoder().encode(message));
  return toHex(new Uint8Array(signature));
};

export const sha256Hex = async (message: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(message));
  return toHex(new Uint8Array(digest));
};

/** Lowercase hex comparison that does not return early on the first wrong digit. */
export const signaturesMatch = (expectedHex: string, receivedHex: string | null | undefined): boolean => {
  const expected = expectedHex.trim().toLowerCase();
  const received = (receivedHex ?? '').trim().toLowerCase();
  if (!HEX_64.test(expected) || !HEX_64.test(received)) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= expected.charCodeAt(index) ^ received.charCodeAt(index);
  }
  return difference === 0;
};

/**
 * Webhook proof: `X-Razorpay-Signature` is hex HMAC-SHA256 of the exact raw
 * request bytes. The caller must read the body once and never re-serialise it.
 */
export const verifyWebhookSignature = async (
  rawBody: string,
  signature: string | null | undefined,
  secret: string,
): Promise<boolean> => {
  if (!secret || !signature) return false;
  return signaturesMatch(await hmacSha256Hex(secret, rawBody), signature);
};

/** Checkout return proof: HMAC-SHA256(`${order_id}|${payment_id}`), hex. */
export const paymentSignatureMessage = (orderId: string, paymentId: string): string => `${orderId}|${paymentId}`;

export const verifyPaymentSignature = async (
  orderId: string,
  paymentId: string,
  signature: string | null | undefined,
  secret: string,
): Promise<boolean> => {
  if (!secret || !orderId || !paymentId || !signature) return false;
  return signaturesMatch(await hmacSha256Hex(secret, paymentSignatureMessage(orderId, paymentId)), signature);
};

export interface RazorpayWebhookSummary {
  event: string;
  /** `payment.entity`, or the payment behind an `order.paid` event. */
  paymentId: string | null;
  orderId: string | null;
  refundId: string | null;
  amountPaise: number | null;
  currency: string | null;
  status: string | null;
}

const asObject = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const asText = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);
const asPaise = (value: unknown): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;

const entityAt = (payload: Record<string, unknown> | null, key: string): Record<string, unknown> | null => {
  const wrapper = asObject(payload?.[key]);
  return asObject(wrapper?.entity);
};

/**
 * Reads the ids, amount and currency from an authenticated webhook body.
 * Returns null for a body that is not a Razorpay event. Unknown event names are
 * still returned: the caller acknowledges them and changes nothing.
 */
export const readRazorpayWebhook = (rawBody: string): RazorpayWebhookSummary | null => {
  let body: Record<string, unknown> | null;
  try {
    body = asObject(JSON.parse(rawBody));
  } catch {
    return null;
  }
  const event = asText(body?.event);
  if (!body || !event) return null;

  const payload = asObject(body.payload);
  const payment = entityAt(payload, 'payment');
  const refund = entityAt(payload, 'refund');
  const order = entityAt(payload, 'order');
  const entity = refund ?? payment ?? order;
  if (!entity) return null;

  return {
    event,
    paymentId: asText(payment?.id) ?? asText(refund?.payment_id) ?? asText(refund?.paymentId),
    orderId: asText(payment?.order_id) ?? asText(refund?.order_id) ?? asText(refund?.orderId) ?? asText(order?.id),
    refundId: asText(refund?.id),
    amountPaise: asPaise(entity.amount),
    currency: asText(entity.currency),
    status: asText(entity.status),
  };
};

/**
 * Which lifecycle change a provider event means. Refunds are only final on
 * `refund.processed`: `refund.created` is the provider accepting the request.
 */
export const intentStatusForEvent = (event: string): EventStatus | null => {
  switch (event) {
    case 'payment.captured':
    case 'order.paid':
      return 'paid';
    case 'payment.failed':
      return 'failed';
    case 'refund.processed':
      return 'refunded';
    default:
      return null;
  }
};

/**
 * Guarded transitions: an out-of-order failed event never undoes a capture, a
 * second successful attempt is ignored, and only a paid intent can be refunded.
 */
export const canApplyStatus = (current: IntentStatus, next: EventStatus): boolean => {
  if (current === 'refunded' || current === 'cancelled') return false;
  if (next === 'refunded') return current === 'paid';
  if (next === 'paid') return current === 'created' || current === 'failed';
  return next === 'failed' && current === 'created';
};
