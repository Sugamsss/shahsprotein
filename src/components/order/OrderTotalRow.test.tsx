// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OrderTotalRow } from './OrderTotalRow';
import type { WebsiteQuote } from '../../types/offer';
import { siteConfig } from '../../data/siteConfig';

const auth = vi.hoisted(() => ({ session: null as { user: { id: string } } | null }));

vi.mock('../../context/CustomerAuthContext', () => ({
  useCustomerAuth: () => ({ session: auth.session, loading: false, requestOtp: async () => false, verifyOtp: async () => false, logout: async () => undefined }),
}));

// The founder's second-tier example: one 500 g pack is ₹489 + ₹70 = ₹559.
const secondTier: WebsiteQuote = {
  quote_id: '00000000-0000-4000-8000-0000000000cc',
  expires_at: '2099-01-01T00:00:00.000Z',
  version: 'fixture-3',
  offer_kind: 'second',
  coupon_code: null,
  free_delivery_rule: { min_grams: null, min_packs: 2, up_to_250: 50, above_250: 70, cap: 70 },
  lines: [{ product_id: 'muesli', size: '500 g', quantity: 1, grams: 500, mrp: 699, unit_price: 489, line_total: 489 }],
  catalogue: [{ product_id: 'muesli', size: '500 g', mrp: 699, unit_price: 489 }],
  mrp_total: 699,
  items_total: 489,
  savings: 210,
  grams: 500,
  packs: 1,
  delivery_base: 70,
  delivery_waived: false,
  delivery_fee: 70,
  total: 559,
  currency: 'INR',
};

describe('OrderTotalRow', () => {
  let root: Root;
  let container: HTMLDivElement;

  const render = (quote: WebsiteQuote) => act(() => root.render(
    <MemoryRouter><OrderTotalRow quote={quote} /></MemoryRouter>,
  ));

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    auth.session = null;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => { act(() => root.unmount()); container.remove(); });

  it('shows ₹489 + ₹70 = ₹559 and one pack away from free delivery', () => {
    render(secondTier);
    const text = container.textContent ?? '';
    expect(text).toContain('₹559');
    expect(text).toContain(siteConfig.order.savingsLine('₹210'));
    expect(text).toContain(siteConfig.order.deliveryNudgePacks);
    expect(text).not.toContain('₹629');
  });

  it('swaps the nudge for a free Delivery row once the second pack is there', () => {
    render({
      ...secondTier,
      grams: 1000,
      packs: 2,
      delivery_waived: true,
      delivery_fee: 0,
      items_total: 978,
      savings: 420,
      lines: [{ ...secondTier.lines[0], quantity: 2, line_total: 978 }],
      total: 978,
    });
    const text = container.textContent ?? '';
    expect(text).toContain(siteConfig.order.deliveryLabel);
    expect(text).toContain(siteConfig.order.freeLabel);
    expect(text).toContain('₹978');
    expect(text).not.toContain(siteConfig.order.deliveryNudgePacks);
  });

  it('offers the login chip to guests only', () => {
    render(secondTier);
    expect(container.textContent).toContain(siteConfig.order.logIn);
    auth.session = { user: { id: '00000000-0000-4000-8000-000000000002' } };
    render(secondTier);
    expect(container.textContent).not.toContain(siteConfig.order.logIn);
  });
});
