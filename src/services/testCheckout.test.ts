import { describe, expect, it } from 'vitest';
import { createRequestBody, newRetryKey, parseCreatedOrder, parseStatus, paymentFromCheckout, retryKeyFor } from './testCheckout';

const created = {
  intent_id: '00000000-0000-4000-8000-0000000000aa',
  order_id: 'order_TEST00000000000001',
  key_id: 'rzp_test_Example123456',
  amount_paise: 40900,
  currency: 'INR',
  environment: 'test',
  quote_id: '00000000-0000-4000-8000-0000000000dd',
  reused: false,
};

describe('browser payload', () => {
  it('sends the quote id and retry key only, never a total', () => {
    const body = createRequestBody('00000000-0000-4000-8000-0000000000dd', newRetryKey());
    expect(Object.keys(body).sort()).toEqual(['quote_id', 'retry_key']);
    expect(JSON.stringify(body)).not.toMatch(/amount|total|paise/i);
  });

  it('keeps one retry key per quote', () => {
    const first = retryKeyFor('quote-a');
    expect(retryKeyFor('quote-a')).toBe(first);
    expect(retryKeyFor('quote-b')).not.toBe(first);
    expect(first).toMatch(/^[A-Za-z0-9_-]{16,64}$/);
  });
});

describe('create-test-order answer', () => {
  it('accepts a test order and keeps the server amount', () => {
    expect(parseCreatedOrder(created)).toEqual({
      intentId: created.intent_id,
      orderId: created.order_id,
      keyId: created.key_id,
      amountPaise: 40900,
      currency: 'INR',
      quoteId: created.quote_id,
      reused: false,
    });
  });

  it('refuses a live key id, a fractional amount and a non-order id', () => {
    expect(parseCreatedOrder({ ...created, key_id: 'rzp_live_Example123456' })).toBeNull();
    expect(parseCreatedOrder({ ...created, amount_paise: 40900.5 })).toBeNull();
    expect(parseCreatedOrder({ ...created, order_id: 'pay_TEST00000000000001' })).toBeNull();
    expect(parseCreatedOrder({ ...created, currency: 'USD' })).toBeNull();
    expect(parseCreatedOrder(null)).toBeNull();
  });
});

describe('checkout success payload', () => {
  it("maps Razorpay's snake_case ids into the status request", () => {
    expect(paymentFromCheckout({
      razorpay_order_id: 'order_TEST00000000000001',
      razorpay_payment_id: 'pay_TEST00000000000001',
      razorpay_signature: 'a'.repeat(64),
    })).toEqual({ paymentId: 'pay_TEST00000000000001', signature: 'a'.repeat(64) });
  });

  it('refuses a half-filled success payload', () => {
    expect(paymentFromCheckout({ razorpay_payment_id: 'pay_TEST00000000000001' })).toBeNull();
    expect(paymentFromCheckout({ razorpay_payment_id: '', razorpay_signature: 'a'.repeat(64) })).toBeNull();
    expect(paymentFromCheckout(null)).toBeNull();
  });
});

describe('checkout-status answer', () => {
  it('reads a paid intent with a checked return signature', () => {
    expect(parseStatus({
      status: 'paid',
      amount_paise: 40900,
      currency: 'INR',
      razorpay_order_id: 'order_TEST00000000000001',
      return_signature_valid: true,
    })).toEqual({
      status: 'paid',
      amountPaise: 40900,
      currency: 'INR',
      razorpayOrderId: 'order_TEST00000000000001',
      returnSignatureValid: true,
    });
  });

  it('rejects an answer without an amount or with another currency', () => {
    expect(parseStatus({ status: 'created', currency: 'INR' })).toBeNull();
    expect(parseStatus({ status: 'created', amount_paise: 40900, currency: 'USD' })).toBeNull();
  });
});
