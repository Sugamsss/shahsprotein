// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OrderProvider, useOrder, type OrderContextType } from './OrderContext';
import type { QuoteResult, WebsiteQuote } from '../types/offer';
import type { OrderLine } from '../types/order';
import { saveOrder } from '../services/orderService';
import { buildOrderMessage } from '../utils/orderMessage';

// Synthetic rates only: never a real coupon code, phone or customer record.
const quoteFor = (lines: ReadonlyArray<{ productId: string; size: string; quantity: number }>, overrides: Partial<WebsiteQuote> = {}): WebsiteQuote => ({
  quote_id: '00000000-0000-4000-8000-0000000000aa',
  expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  version: 'fixture-1',
  offer_kind: 'second',
  coupon_code: null,
  free_delivery_rule: { min_grams: null, min_packs: 2, up_to_250: 50, above_250: 70, cap: 70 },
  lines: lines.map((line) => ({
    product_id: line.productId,
    size: line.size,
    quantity: line.quantity,
    grams: line.size === '500 g' ? 500 : 250,
    mrp: 399,
    unit_price: 279,
    line_total: 279 * line.quantity,
  })),
  catalogue: [
    { product_id: 'muesli', size: '250 g', mrp: 399, unit_price: 279 },
    { product_id: 'muesli', size: '500 g', mrp: 699, unit_price: 489 },
    { product_id: 'raggi-jaggi', size: '250 g', mrp: 249, unit_price: 174 },
    { product_id: 'raggi-jaggi', size: '500 g', mrp: 479, unit_price: 335 },
    { product_id: 'bites', size: '250 g', mrp: 319, unit_price: 223 },
  ],
  mrp_total: 399,
  items_total: 279,
  savings: 120,
  grams: 250,
  packs: 1,
  delivery_base: 50,
  delivery_waived: false,
  delivery_fee: 50,
  total: 329,
  currency: 'INR',
  ...overrides,
});

const orderState = vi.hoisted(() => ({
  session: null as { user: { id: string } } | null,
  quote: vi.fn(),
  offer: null as { version: string } | null,
}));
const saveState = vi.hoisted(() => ({ postCustomerQuote: vi.fn() }));

vi.mock('../context/CustomerAuthContext', () => ({
  useCustomerAuth: () => ({
    session: orderState.session,
    loading: false,
    requestOtp: async () => false,
    verifyOtp: async () => false,
    logout: async () => undefined,
  }),
}));
vi.mock('../services/customerAuthClient', () => ({ postCustomerQuote: saveState.postCustomerQuote }));
vi.mock('../services/publicRpc', () => ({ isLiveSite: () => true, postPublicRpc: vi.fn(), getPublicRpc: vi.fn() }));
vi.mock('../services/offerService', () => ({
  quoteWebsiteOrder: (...args: unknown[]) => orderState.quote(...args),
}));
vi.mock('../services/priceService', () => ({
  useWebsiteOffer: () => orderState.offer,
  usePrices: () => null,
}));

const STOCK = { isOut: () => false, isProductOut: () => false, loading: false };
vi.mock('../services/stockService', () => ({
  useStock: () => STOCK,
  firstInStockSize: () => '250 g',
}));

const deferred = () => {
  let resolve!: (value: QuoteResult) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<QuoteResult>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};

const memoryStorage = () => {
  const data = new Map<string, string>();
  return {
    get length() { return data.size; },
    key: (index: number) => [...data.keys()][index] ?? null,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, String(value)); },
    removeItem: (key: string) => { data.delete(key); },
    clear: () => data.clear(),
  } as Storage;
};

describe('OrderContext quote lifecycle', () => {
  let root: Root | undefined;
  let container: HTMLDivElement;
  let order: OrderContextType;
  let orderTypes: OrderLine[] = [];

  function Capture() { order = useOrder(); orderTypes = order.lines; return null; }

  const render = () => act(() => root!.render(<React.StrictMode><OrderProvider><Capture /></OrderProvider></React.StrictMode>));
  const run = (fn: (value: OrderContextType) => void) => act(() => fn(order));

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    Object.defineProperty(window, 'localStorage', { configurable: true, value: memoryStorage() });
    orderState.session = null;
    orderState.offer = { version: 'guest-1' };
    orderState.quote.mockReset();
    orderState.quote.mockImplementation(async (lines: ReadonlyArray<{ productId: string; size: string; quantity: number }>) => ({ status: 'ready', quote: quoteFor(lines), prices: {} }));
    saveState.postCustomerQuote.mockReset();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    render();
  });

  afterEach(() => {
    if (root) act(() => root!.unmount());
    container.remove();
    vi.clearAllTimers();
  });

  it('asks for a quote only once the cart has something sendable', async () => {
    await act(async () => undefined);
    expect(orderState.quote).not.toHaveBeenCalled();
    run((value) => value.addItem('muesli', '250 g'));
    await act(async () => undefined);
    expect(orderState.quote).toHaveBeenCalledTimes(1);
    const [, , coupon] = orderState.quote.mock.calls[0];
    expect(coupon).toBe(null);
  });

  it('freezes the quote Send builds, amounts included', async () => {
    run((value) => value.addItem('muesli', '250 g'));
    await act(async () => undefined);
    const sent = order.currentOrder();
    expect(sent.unpriced).toBe(false);
    expect(sent.quote?.total).toBe(329);
    expect(sent.quote?.lines[0].unit_price).toBe(279);
  });

  it('marks the order unpriced until a matching quote arrives', async () => {
    const pending = deferred();
    orderState.quote.mockImplementationOnce(() => pending.promise);
    run((value) => value.addItem('muesli', '250 g'));
    await act(async () => undefined);
    expect(order.currentOrder().unpriced).toBe(true);
    await act(async () => { pending.resolve({ status: 'ready', quote: quoteFor([{ productId: 'muesli', size: '250 g', quantity: 1 }]), prices: {} }); });
    expect(order.currentOrder().unpriced).toBe(false);
  });

  it('ignores an earlier quote reply after the cart changed', async () => {
    const first = deferred();
    orderState.quote.mockImplementationOnce(() => first.promise);
    run((value) => value.addItem('muesli', '250 g'));
    await act(async () => undefined);
    run((value) => value.addItem('bites', '250 g'));
    await act(async () => undefined);
    // The second request resolves first; the stale one must not overwrite it.
    await act(async () => { first.resolve({ status: 'ready', quote: quoteFor([{ productId: 'muesli', size: '250 g', quantity: 1 }]), prices: {} }); });
    const sent = order.currentOrder();
    expect(sent.quote?.lines).toHaveLength(2);
    expect(sent.unpriced).toBe(false);
  });

  it('prices and saves a mixed cart whose server order differs from the popup order', async () => {
    // The SQL canonical cart sorts by product id: bites, then muesli. The popup
    // shows catalogue order: muesli, then bites.
    const serverOrder = [
      { productId: 'bites', size: '250 g', quantity: 1 },
      { productId: 'muesli', size: '250 g', quantity: 1 },
    ];
    orderState.quote.mockImplementation(async () => ({ status: 'ready', quote: quoteFor(serverOrder), prices: {} }));
    run((value) => { value.addItem('muesli', '250 g'); value.addItem('bites', '250 g'); });
    await act(async () => undefined);

    const placed = order.currentOrder();
    expect(placed.unpriced).toBe(false);
    expect(placed.quote?.lines.map((line) => line.product_id)).toEqual(['bites', 'muesli']);
    const message = buildOrderMessage(placed);
    expect(message).toContain('• Muesli 250 g × 1 · ₹279');
    expect(message).toContain('• Date Bites 250 g × 1 · ₹279');

    saveOrder(placed);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(saveState.postCustomerQuote).toHaveBeenCalledTimes(1);
    expect(saveState.postCustomerQuote.mock.calls[0][0]).toBe(placed.quote!.quote_id);
    expect(saveState.postCustomerQuote.mock.calls[0][1]).toBe(placed.code);
  });

  it('drops an expired quote and offers retry', async () => {
    orderState.quote.mockImplementationOnce(async (lines: ReadonlyArray<{ productId: string; size: string; quantity: number }>) => ({
      status: 'ready', quote: quoteFor(lines, { expires_at: new Date(Date.now() - 1000).toISOString() }), prices: {},
    }));
    run((value) => value.addItem('muesli', '250 g'));
    await act(async () => undefined);
    expect(order.quote).toBeNull();
    expect(order.quoteError).toBe(true);
    expect(order.currentOrder().unpriced).toBe(true);
  });

  it('re-asks for a guest quote after logout and never keeps the personal one', async () => {
    orderState.session = { user: { id: '00000000-0000-4000-8000-000000000002' } };
    render();
    run((value) => value.addItem('muesli', '250 g'));
    await act(async () => undefined);
    expect(order.quote?.offer_kind).toBe('second');

    orderState.session = null;
    const guestReply = deferred();
    orderState.quote.mockImplementationOnce(() => guestReply.promise);
    render();
    expect(order.quote).toBeNull();
    await act(async () => { guestReply.resolve({ status: 'ready', quote: quoteFor([{ productId: 'muesli', size: '250 g', quantity: 1 }], { offer_kind: 'guest', items_total: 359, total: 409 }), prices: {} }); });
    expect(order.quote?.offer_kind).toBe('guest');
    expect(order.quote?.total).toBe(409);
  });

  it('keeps only the cart in storage between visits', async () => {
    run((value) => { value.setName('Example'); value.setPhone('919800000003'); value.addItem('muesli', '250 g'); });
    await act(async () => undefined);
    const saved = window.localStorage.getItem('shahs-order-v1') ?? '';
    expect(saved).toContain('muesli');
    expect(saved).not.toContain('Example');
    expect(saved).not.toContain('9800000003');
    act(() => root!.unmount());
    root = createRoot(container);
    render();
    expect(orderTypes).toEqual([{ productId: 'muesli', size: '250 g', quantity: 1 }]);
    expect(order.name).toBe('');
  });
});
