// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SentOrder } from '../../context/OrderContext';
import type { WebsiteQuote } from '../../types/offer';
import { siteConfig } from '../../data/siteConfig';

const { startMock } = vi.hoisted(() => ({ startMock: vi.fn() }));
vi.mock('../../services/testCheckout', () => ({ startTestPayment: startMock }));

vi.stubEnv('VITE_TEST_CHECKOUT', 'true');
const { TestCheckout } = await import('./TestCheckout');

const copy = siteConfig.order.testCheckout;

const quote: WebsiteQuote = {
  quote_id: '00000000-0000-4000-8000-0000000000dd',
  expires_at: '2099-01-01T00:00:00.000Z',
  version: 'fixture-4',
  offer_kind: 'guest',
  coupon_code: null,
  free_delivery_rule: { min_grams: 500, min_packs: null, up_to_250: 50, above_250: 70, cap: 70 },
  lines: [{ product_id: 'muesli', size: '250 g', quantity: 1, grams: 250, mrp: 399, unit_price: 359, line_total: 359 }],
  catalogue: [{ product_id: 'muesli', size: '250 g', mrp: 399, unit_price: 359 }],
  mrp_total: 399,
  items_total: 359,
  savings: 40,
  grams: 250,
  packs: 1,
  delivery_base: 50,
  delivery_waived: false,
  delivery_fee: 50,
  total: 409,
  currency: 'INR',
};

const sent: SentOrder = {
  code: 'SN-EXAMP',
  lines: [{ productId: 'muesli', size: '250 g', quantity: 1 }],
  name: 'Asha Example',
  pincode: '415001',
  phone: '919876543210',
  address: { premises: '12 Example Road', area: 'Example Area', city: 'Satara', state: 'Maharashtra', pincode: '415001' },
  coupon: null,
  quote,
  unpriced: false,
  url: 'https://wa.me/910000000000?text=fixture',
};

describe('test checkout button', () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    startMock.mockReset();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => { act(() => root.unmount()); container.remove(); });

  const payButton = () => container.querySelector<HTMLButtonElement>('.order-test-pay__button');

  it('renders a test-only pay button for a frozen quote', () => {
    act(() => root.render(<TestCheckout sent={sent} />));
    expect(payButton()?.textContent).toBe(copy.label);
    expect(container.textContent).toContain(copy.lead);
    expect(container.textContent).toContain(copy.note);
  });

  it('renders nothing for an unpriced order or without a quote', () => {
    act(() => root.render(<TestCheckout sent={{ ...sent, quote: null, unpriced: true }} />));
    expect(container.querySelector('.order-test-pay')).toBeNull();
  });

  it('passes the quote id to the lazily loaded service', async () => {
    act(() => root.render(<TestCheckout sent={sent} />));
    await act(async () => {
      payButton()?.click();
      await Promise.resolve();
    });
    expect(startMock).toHaveBeenCalledTimes(1);
    expect(startMock.mock.calls[0][0]).toBe(quote.quote_id);
  });

  it('falls back to the WhatsApp message when checkout cannot start', async () => {
    act(() => root.render(<TestCheckout sent={sent} />));
    await act(async () => {
      payButton()?.click();
      await Promise.resolve();
    });
    const handlers = startMock.mock.calls[0][1] as { onError: () => void };
    act(() => handlers.onError());
    expect(container.textContent).toContain(copy.failedLead);
    expect(container.querySelector('a')?.getAttribute('href')).toBe(sent.url);
    expect(container.querySelector('a')?.textContent).toBe(copy.fallback);
  });

  it('shows the paid note only when the server checked the return signature', async () => {
    act(() => root.render(<TestCheckout sent={sent} />));
    await act(async () => {
      payButton()?.click();
      await Promise.resolve();
    });
    const handlers = startMock.mock.calls[0][1] as { onPaid: (verified: boolean) => void };
    act(() => handlers.onPaid(true));
    expect(container.textContent).toContain(copy.paid);
    expect(container.querySelector('.order-test-pay__status--ok')).not.toBeNull();
  });
});
