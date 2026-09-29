import type { Coupon, CouponUse, OrderLine, Prices } from '../types';
import { SAMPLE } from './model';

// The worked-out "Total you quoted" (temp/prices-grid-plan.md, "How the total works").
// Admin only: nothing here ever reaches the site, the order popup or the message.

/** Where a typed code stands right now. Unknown covers a deleted coupon too. */
export type CouponState = 'live' | 'off' | 'expired' | 'unknown';

/** Same rule as the server: on, and not past its expiry. */
export const couponState = (code: string, coupons: Coupon[], now: Date): CouponState => {
  const wanted = code.trim().toUpperCase();
  const coupon = coupons.find((c) => c.code.toUpperCase() === wanted);
  if (!coupon) return 'unknown';
  if (!coupon.active) return 'off';
  if (coupon.expires_at != null && new Date(coupon.expires_at) <= now) return 'expired';
  return 'live';
};

export type Quote =
  | { total: number }
  /** The first line with no price, so the form can say which one. */
  | { missing: { product_id: string; size: string } };

/**
 * Packs × (the live coupon's price for that pack, else the base price).
 * Delivery isn't in it. A coupon that's off, expired or unknown counts as none.
 * A line with no price at all gives no total rather than a wrong one. Samples
 * are free: never priced, never part of the coupon math. Null when there's
 * nothing to pay for (nothing ordered, or only samples: a free sample order has no total).
 */
export const quote = (
  lines: OrderLine[], code: string | null, coupons: Coupon[], prices: Prices, now: Date,
): Quote | null => {
  const ordered = lines.filter((l) => l.quantity > 0 && l.size !== SAMPLE);
  if (!ordered.length) return null;
  const coupon = code ? coupons.find((c) => c.code.toUpperCase() === code.trim().toUpperCase()) : undefined;
  const couponId = coupon && couponState(coupon.code, coupons, now) === 'live' ? coupon.id : null;
  let total = 0;
  for (const { product_id, size, quantity } of ordered) {
    const same = (r: { product_id: string; size: string }) => r.product_id === product_id && r.size === size;
    const couponPrice = couponId ? prices.coupons.find((r) => r.coupon_id === couponId && same(r))?.price : undefined;
    const price = couponPrice ?? prices.base.find(same)?.price;
    if (price == null) return { missing: { product_id, size } };
    total += quantity * price;
  }
  return { total };
};

// Coupon kinds (20260928000002): Repeat is a standing offer, One-time is once per phone number.

/** The database has kinds: every coupon it lists carries one. False until the list loads, and on an older database. */
export const hasKinds = (coupons: Coupon[] | null): boolean => !!coupons?.some((c) => c.kind);

const find = (code: string, coupons: Coupon[]) => coupons.find((c) => c.code.toUpperCase() === code.trim().toUpperCase());

/**
 * What a new order for a returning number fills in: the coupon on their latest order that had a
 * Repeat coupon, if it's live now. An older Repeat coupon never stands in for one that's off or
 * ended. One-time coupons never fill in. `uses` newest first, as the server sends them.
 */
export const repeatCoupon = (uses: CouponUse[], coupons: Coupon[], now: Date): string | null => {
  for (const use of uses) {
    const coupon = find(use.coupon_code, coupons);
    if (coupon?.kind === 'repeat') return couponState(coupon.code, coupons, now) === 'live' ? coupon.code : null;
  }
  return null;
};

/**
 * The order where this number already used a One-time coupon (the latest), or null. Editing an
 * order counts only other orders made before it, so the first use is never the one warned about.
 */
export const usedBefore = (
  uses: CouponUse[], code: string, coupons: Coupon[], editing?: { id: string; created_at: string },
): CouponUse | null => {
  if (!code || find(code, coupons)?.kind !== 'one_time') return null;
  const wanted = code.trim().toUpperCase();
  return uses.find((u) => u.coupon_code.toUpperCase() === wanted
    && (!editing || (u.order_id !== editing.id && Date.parse(u.created_at) < Date.parse(editing.created_at)))) ?? null;
};
