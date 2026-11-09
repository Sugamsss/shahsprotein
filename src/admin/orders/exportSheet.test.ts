import { describe, expect, it } from 'vitest';
import { adminCopy } from '../../data/adminCopy';
import type { OrderQuoteSnapshot } from '../../types/offer';
import type { Order } from '../types';
import { orderExportRow } from './ExportSheet';

const quote: OrderQuoteSnapshot = {
  quote_id: 'q-1', expires_at: '2026-10-22T10:15:00Z', version: 'v1', offer_kind: 'guest', coupon_code: null,
  free_delivery_rule: { min_grams: 500, min_packs: null, up_to_250: 50, above_250: 70, cap: 70 },
  lines: [{ product_id: 'muesli', size: '250 g', quantity: 1, grams: 250, mrp: 399, unit_price: 359, line_total: 359 }],
  catalogue: [{ product_id: 'muesli', size: '250 g', mrp: 399, unit_price: 359 }],
  mrp_total: 399, items_total: 359, savings: 40, grams: 250, packs: 1,
  delivery_base: 50, delivery_waived: false, delivery_fee: 50, total: 409, currency: 'INR',
};

const order = (overrides: Partial<Order> = {}) => ({
  code: 'SN-7KQ4M', created_at: '2026-10-22T10:00:00Z', name: 'Riya Patil', phone: '919876543210', pincode: '411038',
  lines: [{ product_id: 'muesli', size: '250 g', quantity: 1 }], packs: 1, samples: 0, coupon: null,
  source: 'site', status: 'delivered', payment_state: 'paid', paid_at: '2026-10-22T11:00:00Z', payments: [],
  amount: 409, amount_paid: 409, amount_due: 0, note: null, free_sample: false, quote: null,
  ...overrides,
} as unknown as Order);

describe('orderExportRow', () => {
  it('ends the header and every row with Offer, Delivery and Savings', () => {
    const columns = adminCopy.exportOrders.columns;
    expect(columns.slice(-3)).toEqual(['Offer', 'Delivery', 'Savings']);
    const row = orderExportRow(order({ quote }));
    expect(row).toHaveLength(columns.length);
    expect(row.slice(-3)).toEqual(['Guest offer', 50, 40]);
  });

  it('leaves the three blank for an order without a saved quote', () => {
    const row = orderExportRow(order());
    expect(row).toHaveLength(adminCopy.exportOrders.columns.length);
    expect(row.slice(-3)).toEqual(['', '', '']);
  });

  it('prints free delivery when the quote waived it', () => {
    const row = orderExportRow(order({ quote: { ...quote, delivery_waived: true, delivery_fee: 0 } }));
    expect(row.slice(-3)).toEqual(['Guest offer', 'Free', 40]);
  });
});
