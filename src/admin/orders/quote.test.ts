import { describe, expect, it } from 'vitest';
import type { Coupon, CouponKind, CouponUse, OrderLine, Prices } from '../types';
import { couponState, hasKinds, quote, repeatCoupon, usedBefore } from './quote';

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

  it('counts a sample as free: no price needed, and a coupon never prices it', () => {
    // No price row exists for a sample, and there's a coupon row that would match if samples were looked up.
    const withCouponRow = { ...PRICES, coupons: [...PRICES.coupons, { coupon_id: 'c-live', product_id: 'bites', size: 'sample', price: 50 }] };
    const lines = [...MUESLI_ORDER, line('bites', 'sample', 2)];
    expect(quote(lines, null, COUPONS, withCouponRow, NOW)).toEqual({ total: 2 * 200 + 380 });
    expect(quote(lines, 'EXAMPLE10', COUPONS, withCouponRow, NOW)).toEqual({ total: 2 * 170 + 380 });
  });

  it('gives no total for a samples-only order, which is free', () => {
    expect(quote([line('bites', 'sample', 1), line('muesli', 'sample', 1)], 'EXAMPLE10', COUPONS, PRICES, NOW)).toBeNull();
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

describe('coupon kinds', () => {
  const kind = (c: Coupon, k: CouponKind) => ({ ...c, kind: k });
  const REPEAT = kind(coupon('r-live', 'FAMILY-EX', true), 'repeat');
  const REPEAT_OFF = kind(coupon('r-off', 'FRIENDS-EX', false), 'repeat');
  const REPEAT_ENDED = kind(coupon('r-old', 'OLDFRIEND', true, '2026-09-01T00:00:00Z'), 'repeat');
  const ONCE = kind(coupon('o-live', 'WELCOME-EX', true), 'one_time');
  const KINDS = [REPEAT, REPEAT_OFF, REPEAT_ENDED, ONCE];
  // Newest first, as get_admin_coupon_uses sends them.
  const use = (order: string, code: string, created_at: string): CouponUse =>
    ({ order_id: `id-${order}`, order_code: order, coupon_code: code, created_at });

  it('knows kinds are on only when the list carries them', () => {
    expect(hasKinds(null)).toBe(false);
    expect(hasKinds(COUPONS)).toBe(false);
    expect(hasKinds(KINDS)).toBe(true);
  });

  it("fills in the latest Repeat coupon while it's live, skipping One-time ones and matching any case", () => {
    const uses = [use('SN-3', 'WELCOME-EX', '2026-09-20T00:00:00Z'), use('SN-2', 'family-ex', '2026-09-10T00:00:00Z')];
    expect(repeatCoupon(uses, KINDS, NOW)).toBe('FAMILY-EX');
  });

  it('fills in nothing when their latest Repeat coupon is off or ended, even with an older live one', () => {
    const older = use('SN-1', 'FAMILY-EX', '2026-08-01T00:00:00Z');
    expect(repeatCoupon([use('SN-2', 'FRIENDS-EX', '2026-09-10T00:00:00Z'), older], KINDS, NOW)).toBeNull();
    expect(repeatCoupon([use('SN-2', 'OLDFRIEND', '2026-09-10T00:00:00Z'), older], KINDS, NOW)).toBeNull();
  });

  it('never fills in a One-time coupon, an unknown code, or a coupon without a kind', () => {
    expect(repeatCoupon([use('SN-1', 'WELCOME-EX', '2026-09-10T00:00:00Z')], KINDS, NOW)).toBeNull();
    expect(repeatCoupon([use('SN-1', 'GONE-CODE', '2026-09-10T00:00:00Z')], KINDS, NOW)).toBeNull();
    expect(repeatCoupon([use('SN-1', 'EXAMPLE10', '2026-09-10T00:00:00Z')], COUPONS, NOW)).toBeNull();
  });

  it('warns about a One-time coupon this number used before, naming the latest order', () => {
    const uses = [use('SN-3', 'WELCOME-EX', '2026-09-20T00:00:00Z'), use('SN-1', 'WELCOME-EX', '2026-09-01T00:00:00Z')];
    expect(usedBefore(uses, 'welcome-ex', KINDS)?.order_code).toBe('SN-3');
    // Repeat coupons are meant to be used again.
    expect(usedBefore([use('SN-2', 'FAMILY-EX', '2026-09-10T00:00:00Z')], 'FAMILY-EX', KINDS)).toBeNull();
    expect(usedBefore(uses, '', KINDS)).toBeNull();
  });

  it('in Edit, counts only other orders made before this one', () => {
    const uses = [use('SN-3', 'WELCOME-EX', '2026-09-20T00:00:00Z'), use('SN-1', 'WELCOME-EX', '2026-09-01T00:00:00Z')];
    // The first use: the later order is the repeat, not this one.
    expect(usedBefore(uses, 'WELCOME-EX', KINDS, { id: 'id-SN-1', created_at: '2026-09-01T00:00:00Z' })).toBeNull();
    // The second use: warned, about the first.
    expect(usedBefore(uses, 'WELCOME-EX', KINDS, { id: 'id-SN-3', created_at: '2026-09-20T00:00:00Z' })?.order_code).toBe('SN-1');
  });
});
