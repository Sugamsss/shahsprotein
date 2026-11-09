// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OrderSent } from './OrderSent';
import type { SentOrder } from '../../context/OrderContext';
import type { WebsiteQuote } from '../../types/offer';

vi.mock('../ui/Modal', () => ({ useModalClose: () => () => undefined }));

const quote: WebsiteQuote = {
  quote_id: '00000000-0000-4000-8000-0000000000dd',
  expires_at: '2099-01-01T00:00:00.000Z',
  version: 'fixture-4',
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

const sent: SentOrder = {
  code: 'SN-EXAMP',
  lines: [{ productId: 'muesli', size: '500 g', quantity: 1 }],
  name: 'Asha Example',
  pincode: '415001',
  phone: '919876543210',
  address: { premises: '12 Example Road', area: 'Example Area', city: 'Satara', state: 'Maharashtra', pincode: '415001' },
  coupon: null,
  quote,
  unpriced: false,
  url: 'https://wa.me/910000000000?text=fixture',
};

describe('OrderSent recap', () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => { act(() => root.unmount()); container.remove(); });

  it('labels the frozen total "Total", never "before delivery"', () => {
    act(() => root.render(<OrderSent sent={sent} onNewOrder={() => undefined} />));
    const recap = container.querySelector('.order-recap__total')?.textContent ?? '';
    expect(recap).toContain('Total');
    expect(recap).toContain('₹559');
    expect(recap).not.toContain('before delivery');
  });
});
