import { describe, expect, it } from 'vitest';
import type { Coupon, Order, Prices } from '../types';
import { billShare, billShareText, buildBill } from './bill';
import { SAMPLE } from './model';

const dummyNow = new Date('2026-10-02T12:00:00+05:30');

const basePrices: Prices = {
  base: [
    { product_id: 'raggi-jaggi', size: '250 g', price: 240 },
    { product_id: 'raggi-jaggi', size: '500 g', price: 450 },
    { product_id: 'muesli', size: '250 g', price: 260 },
    { product_id: 'muesli', size: '500 g', price: 480 },
    { product_id: 'bites', size: '250 g', price: 300 },
    { product_id: 'bites', size: '500 g', price: 560 },
  ],
  coupons: [
    // EXAMPLE10 gives 10% off
    { coupon_id: 'c-ex10', product_id: 'raggi-jaggi', size: '500 g', price: 405 },
    { coupon_id: 'c-ex10', product_id: 'muesli', size: '250 g', price: 234 },
  ],
};

const couponsList: Coupon[] = [
  {
    id: 'c-ex10',
    code: 'EXAMPLE10',
    description: '10% off',
    active: true,
    expires_at: null,
    minimum_note: null,
    internal_note: null,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
  },
  {
    id: 'c-zero',
    code: 'NOCHANGE',
    description: 'Special',
    active: true,
    expires_at: null,
    minimum_note: null,
    internal_note: null,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
  },
];

const makeOrder = (overrides: Partial<Order> = {}): Parameters<typeof buildBill>[0]['order'] => ({
  code: 'SN-7KQ4M',
  name: 'Riya Patil',
  phone: '919876543210',
  pincode: '411038',
  lines: [
    { product_id: 'raggi-jaggi', size: '500 g', quantity: 2 },
    { product_id: 'muesli', size: '250 g', quantity: 1 },
  ],
  coupon: null,
  amount: 1160,
  free_sample: false,
  payment_state: 'paid',
  amount_paid: 1160,
  amount_due: 0,
  paid: true,
  status_changed_at: '2026-10-02T11:00:00+05:30',
  status: 'delivered',
  ...overrides,
});

describe('buildBill', () => {
  it('Sample A: coupon saving, no gap, paid, pincode, no Satara row', () => {
    const order = makeOrder({
      code: 'SN-7KQ4M',
      name: 'Riya Patil',
      phone: '919876543210',
      pincode: '411038',
      lines: [
        { product_id: 'raggi-jaggi', size: '500 g', quantity: 2 },
        { product_id: 'muesli', size: '250 g', quantity: 1 },
      ],
      coupon: { code: 'EXAMPLE10', valid: true, known: true, description: '10% off' },
      amount: 1044,
      paid: true,
      payment_state: 'paid',
      amount_paid: 1044,
      amount_due: 0,
    });

    const bill = buildBill({
      order,
      prices: basePrices,
      coupons: couponsList,
      now: dummyNow,
    });

    expect(bill).not.toBeNull();
    expect(bill?.code).toBe('SN-7KQ4M');
    expect(bill?.name).toBe('Riya Patil');
    expect(bill?.phone).toBe('+91 98765 43210');
    expect(bill?.deliverTo).toBe('411038');
    expect(bill?.date).toBe('2 October 2026');
    expect(bill?.total).toBe(1044);
    expect(bill?.payment).toEqual({ kind: 'paid' });

    // Lines in order: Raggi Jaggi 500g, Muesli 250g
    expect(bill?.lines).toHaveLength(2);
    expect(bill?.lines[0]).toEqual({
      name: 'Raggi Jaggi',
      detail: '500 g',
      amount: 810,
      sample: false,
      quantity: 2,
      rate: 405,
    });
    expect(bill?.lines[1]).toEqual({
      name: 'Muesli',
      detail: '250 g',
      amount: 234,
      sample: false,
      quantity: 1,
      rate: 234,
    });

    // Coupon saving reconciles the item sum to the recorded total.
    expect(bill?.sums).toEqual([
      { kind: 'items', amount: 1160 },
      { kind: 'coupon', code: 'EXAMPLE10', saving: 116 },
    ]);
  });

  it('Sample B: free sample order, ₹0, Satara free, no coupon, no items row', () => {
    const order = makeOrder({
      code: 'SN-3HPD9',
      name: 'Meera Joshi',
      phone: '919876543210',
      pincode: null,
      free_sample: true,
      lines: [
        { product_id: 'raggi-jaggi', size: SAMPLE, quantity: 1 },
        { product_id: 'bites', size: SAMPLE, quantity: 1 },
      ],
      amount: null,
      paid: false,
      payment_state: 'not_paid',
      amount_paid: 0,
      amount_due: null,
    });

    const bill = buildBill({
      order,
      prices: basePrices,
      coupons: couponsList,
      now: dummyNow,
    });

    expect(bill).not.toBeNull();
    expect(bill?.code).toBe('SN-3HPD9');
    expect(bill?.deliverTo).toBe('Satara');
    expect(bill?.total).toBe(0);
    expect(bill?.payment).toEqual({ kind: 'freeSample' });
    expect(bill?.lines).toHaveLength(2);
    expect(bill?.lines[0]).toEqual({
      name: 'Raggi Jaggi',
      quantity: 1,
      detail: 'Sample · free',
      amount: 0,
      sample: true,
      rate: null,
    });
    expect(bill?.lines[1]).toEqual({
      name: 'Date Bites',
      detail: 'Sample · free',
      amount: 0,
      sample: true,
      quantity: 1,
      rate: null,
    });

    // No items row, no coupon row, only deliverySatara
    expect(bill?.sums).toEqual([{ kind: 'deliverySatara' }]);
  });

  it('Sample C: amount above worked → delivery and other, sample line ₹0, part paid', () => {
    const order = makeOrder({
      code: 'SN-9WT2B',
      name: 'Neha Deshmukh',
      phone: '919876543210',
      pincode: '400076',
      lines: [
        { product_id: 'muesli', size: '500 g', quantity: 1 },
        { product_id: 'bites', size: '250 g', quantity: 2 },
        { product_id: 'raggi-jaggi', size: SAMPLE, quantity: 1 },
      ],
      coupon: null,
      amount: 1180,
      paid: false,
      payment_state: 'part_paid',
      amount_paid: 500,
      amount_due: 680,
    });

    const bill = buildBill({
      order,
      prices: basePrices,
      coupons: couponsList,
      now: dummyNow,
    });

    expect(bill).not.toBeNull();
    expect(bill?.total).toBe(1180);
    expect(bill?.payment).toEqual({ kind: 'part', paid: 500, due: 680 });
    // sortLines puts products in product order: Raggi Jaggi (index 0), Muesli (index 1), Date Bites (index 2)
    expect(bill?.lines).toHaveLength(3);
    expect(bill?.lines[0]).toEqual({
      name: 'Raggi Jaggi',
      detail: 'Sample · free',
      amount: 0,
      sample: true,
      quantity: 1,
      rate: null,
    });
    expect(bill?.lines[1].name).toBe('Muesli');
    expect(bill?.lines[2].name).toBe('Date Bites');

    // items: 480 + 600 = 1080. Gap = 1180 - 1080 = +100 → deliveryOther
    expect(bill?.sums).toEqual([
      { kind: 'items', amount: 1080 },
      { kind: 'deliveryOther', amount: 100 },
    ]);
  });

  it('Amount below worked → adjusted, not a coupon', () => {
    const order = makeOrder({
      lines: [
        { product_id: 'raggi-jaggi', size: '500 g', quantity: 2 }, // 900
      ],
      amount: 850, // 50 below
      coupon: null,
      pincode: '411038',
    });

    const bill = buildBill({
      order,
      prices: basePrices,
      coupons: couponsList,
      now: dummyNow,
    });

    expect(bill?.total).toBe(850);
    expect(bill?.sums).toEqual([
      { kind: 'items', amount: 900 },
      { kind: 'adjusted', amount: 50 },
    ]);
  });

  it('Coupon that does not change price → Applied, saving null, Items shows because coupon exists', () => {
    const order = makeOrder({
      lines: [{ product_id: 'raggi-jaggi', size: '500 g', quantity: 2 }],
      coupon: { code: 'NOCHANGE', valid: true, known: true, description: '' },
      amount: 900,
      pincode: '411038',
    });

    const bill = buildBill({
      order,
      prices: basePrices,
      coupons: couponsList,
      now: dummyNow,
    });

    expect(bill?.sums).toEqual([
      { kind: 'items', amount: 900 },
      { kind: 'coupon', code: 'NOCHANGE', saving: null },
    ]);
  });

  it('Total simply equals items with pincode → no other sum rows, sums is empty', () => {
    const order = makeOrder({
      lines: [{ product_id: 'raggi-jaggi', size: '500 g', quantity: 2 }],
      coupon: null,
      amount: 900,
      pincode: '411038',
    });

    const bill = buildBill({
      order,
      prices: basePrices,
      coupons: couponsList,
      now: dummyNow,
    });

    expect(bill?.total).toBe(900);
    expect(bill?.sums).toEqual([]);
  });

  it('Missing price and no amount → null', () => {
    const order = makeOrder({
      lines: [{ product_id: 'unknown-item', size: '500 g', quantity: 1 }],
      amount: null,
    });

    const bill = buildBill({
      order,
      prices: basePrices,
      coupons: couponsList,
      now: dummyNow,
    });

    expect(bill).toBeNull();
  });

  it('uses a coupon pack price even when its base price has not been set', () => {
    const bill = buildBill({
      order: makeOrder({ amount: 1044, coupon: { code: 'EXAMPLE10', valid: true, known: true, description: '' } }),
      prices: { ...basePrices, base: [] },
      coupons: couponsList,
      now: dummyNow,
    });
    expect(bill?.total).toBe(1044);
    expect(bill?.lines.map((line) => line.rate)).toEqual([405, 234]);
    // No base price exists to prove a saving against.
    expect(bill?.sums).toEqual([{ kind: 'coupon', code: 'EXAMPLE10', saving: null }]);
  });

  it('requires a recorded total even when every pack has a current price', () => {
    expect(buildBill({ order: makeOrder({ amount: null }), prices: basePrices, coupons: couponsList, now: dummyNow })).toBeNull();
  });

  it('does not invent base rates or a gap while the coupon list is unavailable', () => {
    const bill = buildBill({ order: makeOrder({ amount: 1044, coupon: { code: 'EXAMPLE10', valid: true, known: true, description: '' } }), prices: basePrices, coupons: null, now: dummyNow });
    expect(bill?.total).toBe(1044);
    expect(bill?.lines.map((line) => ({ rate: line.rate, amount: line.amount }))).toEqual([{ rate: null, amount: null }, { rate: null, amount: null }]);
    expect(bill?.sums).toEqual([{ kind: 'coupon', code: 'EXAMPLE10', saving: null }]);
  });

  it('Missing price but amount set → a bill, no invented unit price, no gap row', () => {
    const order = makeOrder({
      lines: [{ product_id: 'unknown-item', size: '500 g', quantity: 2 }],
      amount: 800,
      pincode: '411038',
    });

    const bill = buildBill({
      order,
      prices: basePrices,
      coupons: couponsList,
      now: dummyNow,
    });

    expect(bill).not.toBeNull();
    expect(bill?.total).toBe(800);
    expect(bill?.lines[0]).toEqual({
      name: 'unknown-item',
      detail: '500 g · 2',
      amount: null,
      sample: false,
      quantity: 2,
      rate: null,
    });
    // No items row and no gap row
    expect(bill?.sums).toEqual([]);
  });

  it('Pincode set → no deliverySatara; Null pincode → deliverySatara', () => {
    const withPincode = makeOrder({ pincode: '411038', amount: 900 });
    const withoutPincode = makeOrder({ pincode: null, amount: 900 });

    const bill1 = buildBill({ order: withPincode, prices: basePrices, coupons: couponsList, now: dummyNow });
    const bill2 = buildBill({ order: withoutPincode, prices: basePrices, coupons: couponsList, now: dummyNow });

    expect(bill1?.deliverTo).toBe('411038');
    expect(bill1?.sums.some((s) => s.kind === 'deliverySatara')).toBe(false);

    expect(bill2?.deliverTo).toBe('Satara');
    expect(bill2?.sums.some((s) => s.kind === 'deliverySatara')).toBe(true);
  });
});

describe('billShare', () => {
  it('handles all four combinations', () => {
    expect(billShare(true, true)).toEqual({ kind: 'send' });
    expect(billShare(true, false)).toEqual({ kind: 'share' });
    expect(billShare(false, true)).toEqual({ kind: 'downloadChat' });
    expect(billShare(false, false)).toEqual({ kind: 'downloadOnly' });
  });
});

describe('billShareText', () => {
  it('formats with name and total', () => {
    expect(billShareText({ name: 'Riya Patil', code: 'SN-7KQ4M', total: '₹1,044' }))
      .toBe("Hi Riya, here's your bill from Shah's Nutrition for order SN-7KQ4M (₹1,044).");
  });

  it('formats without name', () => {
    expect(billShareText({ name: null, code: 'SN-7KQ4M', total: '₹1,044' }))
      .toBe("Hi, here's your bill from Shah's Nutrition for order SN-7KQ4M (₹1,044).");
  });

  it('formats with name and without total (free sample)', () => {
    expect(billShareText({ name: 'Meera Joshi', code: 'SN-3HPD9', total: null }))
      .toBe("Hi Meera, here's your bill from Shah's Nutrition for order SN-3HPD9.");
  });

  it('formats without name and without total', () => {
    expect(billShareText({ name: null, code: 'SN-3HPD9', total: null }))
      .toBe("Hi, here's your bill from Shah's Nutrition for order SN-3HPD9.");
  });
});
