// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductsSection } from './ProductsSection';
import type { WebsiteQuote } from '../../types/offer';
import { siteConfig } from '../../data/siteConfig';

const view = vi.hoisted(() => ({
  quote: null as WebsiteQuote | null,
  session: null as { user: { id: string } } | null,
  addItem: vi.fn(),
}));

// Second-tier, one 500 g Muesli is the founder's ₹489 + ₹70 example.
const quote: WebsiteQuote = {
  quote_id: '00000000-0000-4000-8000-0000000000bb',
  expires_at: '2099-01-01T00:00:00.000Z',
  version: 'fixture-2',
  offer_kind: 'second',
  coupon_code: null,
  free_delivery_rule: { min_grams: null, min_packs: 2, up_to_250: 50, above_250: 70, cap: 70 },
  lines: [{ product_id: 'muesli', size: '500 g', quantity: 1, grams: 500, mrp: 699, unit_price: 489, line_total: 489 }],
  catalogue: [
    { product_id: 'muesli', size: '250 g', mrp: 399, unit_price: 279 },
    { product_id: 'muesli', size: '500 g', mrp: 699, unit_price: 489 },
    { product_id: 'raggi-jaggi', size: '250 g', mrp: 249, unit_price: 174 },
    { product_id: 'raggi-jaggi', size: '500 g', mrp: 479, unit_price: 335 },
    { product_id: 'bites', size: '250 g', mrp: 319, unit_price: 223 },
  ],
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

vi.mock('../../context/OrderContext', () => ({
  useOrder: () => ({
    quote: view.quote,
    addItem: view.addItem,
    openOrder: () => undefined,
    closeOrder: () => undefined,
    isOpen: false,
    openedFrom: undefined,
    lines: [],
    itemCount: 0,
  }),
}));
vi.mock('../../context/CustomerAuthContext', () => ({
  useCustomerAuth: () => ({ session: view.session, loading: false, requestOtp: async () => false, verifyOtp: async () => false, logout: async () => undefined }),
}));
vi.mock('../../context/ThemeContext', () => ({
  useTheme: () => ({ theme: 'light', setTheme: () => undefined, mode: 'light', setMode: () => undefined }),
}));
vi.mock('../../services/priceService', () => ({
  usePrices: () => null,
  useWebsiteOffer: () => null,
}));
vi.mock('../../services/stockService', () => ({
  useStock: () => ({ isOut: () => false, isProductOut: () => false }),
  firstInStockSize: () => '250 g',
}));

describe('ProductsSection price lifecycle', () => {
  let root: Root;
  let container: HTMLDivElement;

  const render = () => act(() => root.render(
    <MemoryRouter><ProductsSection /></MemoryRouter>,
  ));
  const muesliCard = () => Array.from(container.querySelectorAll<HTMLElement>('.portfolio-card'))
    .find((card) => card.querySelector('h3')?.textContent === 'Muesli')!;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    view.quote = quote;
    view.session = null;
    view.addItem.mockReset();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => { act(() => root.unmount()); container.remove(); });

  it('shows each pack at the whole-cart quote rates, never the guest list', () => {
    render();
    const card = muesliCard();
    const pairs = Array.from(card.querySelectorAll('.pack-prices__item')).map((item) => item.textContent);
    expect(pairs[0]).toContain('₹399');
    expect(pairs[0]).toContain('₹279');
    expect(pairs[1]).toContain('₹699');
    expect(pairs[1]).toContain('₹489');
  });

  it('follows the size switch in the product popup', () => {
    render();
    act(() => muesliCard().querySelector<HTMLButtonElement>('.portfolio-card__action')!.click());
    const bar = document.querySelector<HTMLElement>('.product-detail__order')!;
    expect(bar.textContent).toContain('₹279');
    const fiveHundred = Array.from(bar.querySelectorAll<HTMLInputElement>('input[type="radio"]'))
      .find((radio) => radio.value === '500 g')!;
    act(() => fiveHundred.click());
    expect(bar.textContent).toContain('₹489');
    expect(bar.textContent).toContain('₹699');
  });

  it('offers the login chip only when a quote can carry the tier price', () => {
    // The legacy path: no quote is asked for, so no login can lower a price.
    view.quote = null;
    render();
    expect(container.textContent).not.toContain(siteConfig.products.loginChip);
    view.quote = quote;
    render();
    expect(container.textContent).toContain(siteConfig.products.loginChip);
  });

  it('hides the login chip once the customer is signed in', () => {
    render();
    expect(container.textContent).toContain(siteConfig.products.loginChip);
    view.session = { user: { id: '00000000-0000-4000-8000-000000000002' } };
    render();
    expect(container.textContent).not.toContain(siteConfig.products.loginChip);
  });

  it('asks for the first packet from a card without losing the quote', () => {
    render();
    act(() => muesliCard().querySelector<HTMLButtonElement>('.portfolio-card__add')!.click());
    expect(view.addItem).toHaveBeenCalledWith('muesli');
  });
});
