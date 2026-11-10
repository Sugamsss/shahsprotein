/**
 * Slice B TEST scaffold: prepaid Razorpay test-mode checkout from a frozen quote.
 *
 * Loaded only when someone taps the flagged button (dynamic import from
 * `TestCheckout.tsx`), and Razorpay's checkout.js is loaded only after the server
 * has created the test order. The browser sends a quote id and a retry key; the
 * amount exists only in the server's answer and inside the provider's own modal.
 *
 * Test mode only: the functions refuse a live key, and `parseCreatedOrder` refuses
 * anything that is not an `rzp_test_` key id.
 */
import { siteConfig } from '../data/siteConfig';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const CHECKOUT_SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js';
const REQUEST_TIMEOUT_MS = 15_000;
const SCRIPT_TIMEOUT_MS = 10_000;

export interface TestOrder {
  intentId: string;
  orderId: string;
  keyId: string;
  amountPaise: number;
  currency: 'INR';
  quoteId: string;
  reused: boolean;
}

export interface TestStatus {
  status: string;
  amountPaise: number;
  currency: string;
  razorpayOrderId: string | null;
  returnSignatureValid: boolean | null;
}

export interface TestPaymentResult {
  paymentId: string;
  signature: string;
}

/** Razorpay's success handler answers snake_case ids; anything else is unusable. */
export interface RazorpayCheckoutResponse {
  razorpay_order_id?: unknown;
  razorpay_payment_id?: unknown;
  razorpay_signature?: unknown;
}

export const paymentFromCheckout = (response: RazorpayCheckoutResponse | null | undefined): TestPaymentResult | null => {
  const paymentId = typeof response?.razorpay_payment_id === 'string' ? response.razorpay_payment_id.trim() : '';
  const signature = typeof response?.razorpay_signature === 'string' ? response.razorpay_signature.trim() : '';
  return paymentId && signature ? { paymentId, signature } : null;
};

export interface TestPaymentHandlers {
  onPaid: (verified: boolean) => void;
  onDismiss: () => void;
  onError: () => void;
}

interface CheckoutInstance {
  open: () => void;
  on: (event: string, handler: () => void) => void;
}

type CheckoutConstructor = new (options: Record<string, unknown>) => CheckoutInstance;

declare global {
  interface Window {
    Razorpay?: CheckoutConstructor;
  }
}

/** One retry key per quote, so a double tap reuses the same server intent. */
const retryKeys = new Map<string, string>();

export const newRetryKey = (): string => {
  if (typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
};

export const retryKeyFor = (quoteId: string): string => {
  const existing = retryKeys.get(quoteId);
  if (existing) return existing;
  const created = newRetryKey();
  retryKeys.set(quoteId, created);
  return created;
};

/** The whole browser payload. Deliberately no amount, total or line prices. */
export const createRequestBody = (quoteId: string, retryKey: string): { quote_id: string; retry_key: string } => ({
  quote_id: quoteId,
  retry_key: retryKey,
});

const isWhole = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value > 0;

export const parseCreatedOrder = (raw: unknown): TestOrder | null => {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.intent_id !== 'string' || !value.intent_id) return null;
  if (typeof value.quote_id !== 'string' || !value.quote_id) return null;
  if (typeof value.order_id !== 'string' || !value.order_id.startsWith('order_')) return null;
  if (typeof value.key_id !== 'string' || !value.key_id.startsWith('rzp_test_')) return null;
  if (!isWhole(value.amount_paise) || value.currency !== 'INR') return null;
  return {
    intentId: value.intent_id,
    orderId: value.order_id,
    keyId: value.key_id,
    amountPaise: value.amount_paise,
    currency: 'INR',
    quoteId: value.quote_id,
    reused: value.reused === true,
  };
};

export const parseStatus = (raw: unknown): TestStatus | null => {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.status !== 'string' || !value.status) return null;
  if (!isWhole(value.amount_paise) || value.currency !== 'INR') return null;
  return {
    status: value.status,
    amountPaise: value.amount_paise,
    currency: 'INR',
    razorpayOrderId: typeof value.razorpay_order_id === 'string' ? value.razorpay_order_id : null,
    returnSignatureValid: typeof value.return_signature_valid === 'boolean' ? value.return_signature_valid : null,
  };
};

const callFunction = async (name: string, body: unknown): Promise<unknown | null> => {
  if (!supabaseUrl || !anonKey) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
      method: 'POST',
      signal: controller.signal,
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

export const createTestOrder = async (quoteId: string, retryKey: string): Promise<TestOrder | null> =>
  parseCreatedOrder(await callFunction('create-test-order', createRequestBody(quoteId, retryKey)));

export const readTestStatus = async (
  intentId: string,
  retryKey: string,
  payment?: TestPaymentResult,
): Promise<TestStatus | null> =>
  parseStatus(await callFunction('checkout-status', {
    intent_id: intentId,
    retry_key: retryKey,
    ...(payment ? { razorpay_payment_id: payment.paymentId, razorpay_signature: payment.signature } : {}),
  }));

/** checkout.js loads once, lazily, and only when a test payment is actually starting. */
let checkoutScript: Promise<CheckoutConstructor> | null = null;

export const loadRazorpayCheckout = (): Promise<CheckoutConstructor> => {
  if (typeof window !== 'undefined' && window.Razorpay) return Promise.resolve(window.Razorpay);
  if (checkoutScript) return checkoutScript;
  checkoutScript = new Promise<CheckoutConstructor>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${CHECKOUT_SCRIPT}"]`);
    const script = existing ?? document.createElement('script');
    const settle = (error?: Error) => {
      if (error) reject(error);
      else if (window.Razorpay) resolve(window.Razorpay);
      else reject(new Error('checkout_unavailable'));
    };
    const timeout = setTimeout(() => settle(new Error('checkout_timeout')), SCRIPT_TIMEOUT_MS);
    script.addEventListener('load', () => { clearTimeout(timeout); settle(); }, { once: true });
    script.addEventListener('error', () => { clearTimeout(timeout); settle(new Error('checkout_blocked')); }, { once: true });
    if (!existing) {
      script.src = CHECKOUT_SCRIPT;
      script.async = true;
      document.head.appendChild(script);
    }
  });
  checkoutScript.catch(() => { checkoutScript = null; });
  return checkoutScript;
};

const confirmReturn = async (order: TestOrder, payment: TestPaymentResult, handlers: TestPaymentHandlers) => {
  const status = await readTestStatus(order.intentId, retryKeyFor(order.quoteId), payment);
  // A signed return is checked server-side. It is still not payment proof: the
  // webhook owns that (see docs/slice-b-test.md).
  handlers.onPaid(status?.returnSignatureValid === true);
};

/** Creates the server order, loads checkout.js, and opens the test modal. */
export const startTestPayment = async (quoteId: string, handlers: TestPaymentHandlers): Promise<void> => {
  const created = await createTestOrder(quoteId, retryKeyFor(quoteId));
  if (!created) {
    handlers.onError();
    return;
  }
  let Checkout: CheckoutConstructor;
  try {
    Checkout = await loadRazorpayCheckout();
  } catch {
    handlers.onError();
    return;
  }
  try {
    let failed = false;
    const checkout = new Checkout({
      key: created.keyId,
      order_id: created.orderId,
      amount: created.amountPaise,
      currency: created.currency,
      name: "Shah's Nutrition",
      description: siteConfig.order.testCheckout.label,
      handler: (response: RazorpayCheckoutResponse) => {
        const payment = paymentFromCheckout(response);
        if (!payment) {
          handlers.onError();
          return;
        }
        void confirmReturn(created, payment, handlers);
      },
      modal: {
        // A failure and a dismiss can arrive together; the failure is the useful one.
        ondismiss: () => { if (!failed) handlers.onDismiss(); },
        escape: true,
        confirm_close: true,
      },
    });
    checkout.on('payment.failed', () => { failed = true; handlers.onError(); });
    checkout.open();
  } catch {
    handlers.onError();
  }
};
