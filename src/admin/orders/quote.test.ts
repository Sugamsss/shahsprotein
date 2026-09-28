import { describe, expect, it } from 'vitest';
import type { Coupon, OrderLine, Prices } from '../types';
import { couponState, quote } from './quote';

// Made-up prices and codes only: the repo is public.

const NOW = new Date('2026-09-28T12:00:00Z');
const coupon = (id: string, code: string, active: boolean, expires_at: string | null = null) =>
  ({ id, code, active, expires_at }) as Coupon;
const COUPONS = [
  coupon('c-live', 'EXAMPLE10', true, '2026-10-31T00:00:00Z'),
  coupon('c-off', 'OFFCODE', false),
  coupon('c-old', 'OLDCODE', true, '2026-09-01T00:00:00Z'),
  coupon('c-now', 'ENDSNOW', true, NOW.toISOString()),
  coupon('c-other', 'OTHER5', true),
];
const PRICES: Prices = {
  base: [
    { product_id: 'muesli', size: '250 g', price: 200 },
    { product_id: 'muesli', size: '500 g', price: 380 },
    { product_id: 'raggi-jaggi', size: '250 g', price: 150 },
  ],
  coupons: [
    // Another coupon's row comes first, so a price picked without matching the coupon shows.
    { coupon_id: 'c-other', product_id: 'muesli', size: '250 g', price: 100 },
    ...['c-live', 'c-off', 'c-old', 'c-now'].map((coupon_id) => ({ coupon_id, product_id: 'muesli', size: '250 g', price: 170 })),
    // A pack with no base price that the live coupon does price.
    { coupon_id: 'c-live', product_id: 'bites', size: '250 g', price: 120 },
  ],
};
const line = (product_id: string, size: string, quantity: number): OrderLine => ({ product_id, size, quantity });
const MUESLI_ORDER = [line('muesli', '250 g', 2), line('muesli', '500 g', 1)];

describe('quote', () => {
  it('adds packs × base price when there is no coupon', () => {
    expect(quote([...MUESLI_ORDER, line('raggi-jaggi', '250 g', 3)], null, COUPONS, PRICES, NOW)).toEqual({ total: 2 * 200 + 380 + 3 * 150 });
  });

  it("uses a live coupon's price for the packs it prices, and the base price for the rest", () => {
    expect(quote(MUESLI_ORDER, 'EXAMPLE10', COUPONS, PRICES, NOW)).toEqual({ total: 2 * 170 + 380 });
  });

  it.each([
    ['off', 'OFFCODE'],
    ['expired', 'OLDCODE'],
    ['expiring this very moment', 'ENDSNOW'],
    ['unknown or deleted', 'GONE99'],
  ])('a coupon that is %s counts as none', (_, code) => {
    expect(quote(MUESLI_ORDER, code, COUPONS, PRICES, NOW)).toEqual({ total: 2 * 200 + 380 });
  });

  it('names the first pack with no price instead of giving a wrong total', () => {
    const lines = [line('muesli', '250 g', 1), line('bites', '250 g', 1), line('raggi-jaggi', '500 g', 1)];
    expect(quote(lines, null, COUPONS, PRICES, NOW)).toEqual({ missing: { product_id: 'bites', size: '250 g' } });
    expect(quote(lines, 'OFFCODE', COUPONS, PRICES, NOW)).toEqual({ missing: { product_id: 'bites', size: '250 g' } });
  });

  it('a live coupon price covers a pack that has no base price', () => {
    expect(quote([line('bites', '250 g', 2)], 'EXAMPLE10', COUPONS, PRICES, NOW)).toEqual({ total: 240 });
  });

  it('works nothing out when nothing is ordered', () => {
    expect(quote([], 'EXAMPLE10', COUPONS, PRICES, NOW)).toBeNull();
    expect(quote([line('muesli', '250 g', 0)], null, COUPONS, PRICES, NOW)).toBeNull();
  });
});

describe('couponState', () => {
  it.each([
    ['EXAMPLE10', 'live'],
    ['example10', 'live'],
    ['OTHER5', 'live'],
    ['OFFCODE', 'off'],
    ['OLDCODE', 'expired'],
    ['ENDSNOW', 'expired'],
    ['GONE99', 'unknown'],
  ])('%s is %s', (code, state) => {
    expect(couponState(code, COUPONS, NOW)).toBe(state);
  });
});
