/**
 * Unit fixtures for the Razorpay test scaffold. No network and no live keys:
 * the webhook secret here is a placeholder that matches nothing real.
 */
import { describe, expect, it } from 'vitest';
import {
  canApplyStatus,
  hmacSha256Hex,
  intentStatusForEvent,
  isTestKeyId,
  paymentSignatureMessage,
  readRazorpayWebhook,
  rupeesToPaise,
  sha256Hex,
  signaturesMatch,
  verifyPaymentSignature,
  verifyWebhookSignature,
} from './razorpay';
import {
  capturedWebhook,
  DUMMY_WEBHOOK_SECRET,
  failedWebhook,
  refundedWebhook,
  reserialisedCapturedBody,
  tamperedCapturedBody,
} from './fixtures';

describe('webhook signature (hex HMAC-SHA256 of the raw body)', () => {
  it('accepts the captured, failed and refund fixtures', async () => {
    await expect(verifyWebhookSignature(capturedWebhook.rawBody, capturedWebhook.signature, DUMMY_WEBHOOK_SECRET)).resolves.toBe(true);
    await expect(verifyWebhookSignature(failedWebhook.rawBody, failedWebhook.signature, DUMMY_WEBHOOK_SECRET)).resolves.toBe(true);
    await expect(verifyWebhookSignature(refundedWebhook.rawBody, refundedWebhook.signature, DUMMY_WEBHOOK_SECRET)).resolves.toBe(true);
  });

  it('rejects a body with one amount digit changed', async () => {
    expect(tamperedCapturedBody).not.toBe(capturedWebhook.rawBody);
    await expect(verifyWebhookSignature(tamperedCapturedBody, capturedWebhook.signature, DUMMY_WEBHOOK_SECRET)).resolves.toBe(false);
  });

  it('rejects parsed and re-serialised JSON, however equal it looks', async () => {
    expect(JSON.parse(reserialisedCapturedBody)).toEqual(JSON.parse(capturedWebhook.rawBody));
    await expect(verifyWebhookSignature(reserialisedCapturedBody, capturedWebhook.signature, DUMMY_WEBHOOK_SECRET)).resolves.toBe(false);
  });

  it('rejects the wrong secret, a missing signature and a malformed signature', async () => {
    await expect(verifyWebhookSignature(capturedWebhook.rawBody, capturedWebhook.signature, 'whsec_test_wrong')).resolves.toBe(false);
    await expect(verifyWebhookSignature(capturedWebhook.rawBody, null, DUMMY_WEBHOOK_SECRET)).resolves.toBe(false);
    await expect(verifyWebhookSignature(capturedWebhook.rawBody, 'not-hex', DUMMY_WEBHOOK_SECRET)).resolves.toBe(false);
  });

  it('compares hex case-insensitively and never by prefix', async () => {
    expect(signaturesMatch(capturedWebhook.signature, capturedWebhook.signature.toUpperCase())).toBe(true);
    expect(signaturesMatch(capturedWebhook.signature, capturedWebhook.signature.slice(0, 63))).toBe(false);
    expect(signaturesMatch(capturedWebhook.signature, `${capturedWebhook.signature.slice(0, 63)}0`)).toBe(false);
  });

  it('hashes the raw body to the fixture digest', async () => {
    await expect(sha256Hex(capturedWebhook.rawBody)).resolves.toBe(capturedWebhook.bodySha256);
  });

  it('builds the same signature the provider would for a fixed body', async () => {
    await expect(hmacSha256Hex(DUMMY_WEBHOOK_SECRET, capturedWebhook.rawBody)).resolves.toBe(capturedWebhook.signature);
  });
});

describe('checkout return signature (`order_id|payment_id`)', () => {
  it('accepts the Razorpay return signature and rejects a swapped order', async () => {
    const signature = await hmacSha256Hex(DUMMY_WEBHOOK_SECRET, paymentSignatureMessage('order_TEST00000000000001', 'pay_TEST00000000000001'));
    await expect(verifyPaymentSignature('order_TEST00000000000001', 'pay_TEST00000000000001', signature, DUMMY_WEBHOOK_SECRET)).resolves.toBe(true);
    await expect(verifyPaymentSignature('order_TEST00000000000002', 'pay_TEST00000000000001', signature, DUMMY_WEBHOOK_SECRET)).resolves.toBe(false);
  });

  it('rejects an empty payment id or signature', async () => {
    await expect(verifyPaymentSignature('order_TEST00000000000001', '', capturedWebhook.signature, DUMMY_WEBHOOK_SECRET)).resolves.toBe(false);
    await expect(verifyPaymentSignature('order_TEST00000000000001', 'pay_TEST00000000000001', '', DUMMY_WEBHOOK_SECRET)).resolves.toBe(false);
  });
});

describe('money and key rules', () => {
  it('turns whole rupees into integer paise, ₹409 → 40900', () => {
    expect(rupeesToPaise(409)).toBe(40900);
    expect(rupeesToPaise(1)).toBe(100);
  });

  it('refuses fractions, zero, negatives and out-of-range amounts', () => {
    expect(rupeesToPaise(409.5)).toBeNull();
    expect(rupeesToPaise('40900')).toBeNull();
    expect(rupeesToPaise(0)).toBeNull();
    expect(rupeesToPaise(-5)).toBeNull();
    expect(rupeesToPaise(500_001)).toBeNull();
    expect(rupeesToPaise(Number.NaN)).toBeNull();
  });

  it('only accepts test-mode key ids', () => {
    expect(isTestKeyId('rzp_test_Example123456')).toBe(true);
    expect(isTestKeyId('rzp_live_Example123456')).toBe(false);
    expect(isTestKeyId('')).toBe(false);
  });
});

describe('webhook reading', () => {
  it('reads ids, amount and currency from a captured payment', () => {
    expect(readRazorpayWebhook(capturedWebhook.rawBody)).toEqual({
      event: 'payment.captured',
      paymentId: 'pay_TEST00000000000001',
      orderId: 'order_TEST00000000000001',
      refundId: null,
      amountPaise: 40900,
      currency: 'INR',
      status: 'captured',
    });
  });

  it('reads a failed payment as failed, never as captured', () => {
    const summary = readRazorpayWebhook(failedWebhook.rawBody);
    expect(summary?.event).toBe('payment.failed');
    expect(summary?.status).toBe('failed');
    expect(summary?.amountPaise).toBe(40900);
  });

  it('reads a processed refund by its payment id', () => {
    const summary = readRazorpayWebhook(refundedWebhook.rawBody);
    expect(summary).toMatchObject({
      event: 'refund.processed',
      paymentId: 'pay_TEST00000000000001',
      refundId: 'rfnd_TEST00000000000001',
      amountPaise: 40900,
      status: 'processed',
    });
  });

  it('returns null for invalid JSON or a body without an event name', () => {
    expect(readRazorpayWebhook('not json')).toBeNull();
    expect(readRazorpayWebhook('{"payload":{}}')).toBeNull();
    expect(readRazorpayWebhook('[]')).toBeNull();
  });
});

describe('lifecycle mapping and guards', () => {
  it('maps the handled events and ignores the rest', () => {
    expect(intentStatusForEvent('payment.captured')).toBe('paid');
    expect(intentStatusForEvent('order.paid')).toBe('paid');
    expect(intentStatusForEvent('payment.failed')).toBe('failed');
    expect(intentStatusForEvent('refund.processed')).toBe('refunded');
    expect(intentStatusForEvent('refund.created')).toBeNull();
    expect(intentStatusForEvent('payment.authorized')).toBeNull();
    expect(intentStatusForEvent('refund.failed')).toBeNull();
  });

  it('never undoes a capture and never double-counts a payment', () => {
    expect(canApplyStatus('created', 'paid')).toBe(true);
    expect(canApplyStatus('failed', 'paid')).toBe(true);
    expect(canApplyStatus('paid', 'paid')).toBe(false);
    expect(canApplyStatus('paid', 'failed')).toBe(false);
    expect(canApplyStatus('created', 'failed')).toBe(true);
    expect(canApplyStatus('paid', 'refunded')).toBe(true);
    expect(canApplyStatus('created', 'refunded')).toBe(false);
    expect(canApplyStatus('refunded', 'paid')).toBe(false);
    expect(canApplyStatus('cancelled', 'paid')).toBe(false);
  });
});
