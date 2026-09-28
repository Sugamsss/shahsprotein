import type { Coupon, OrderLine, Prices } from '../types';

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
 * A line with no price at all gives no total rather than a wrong one. Null when
 * there's nothing ordered.
 */
export const quote = (
  lines: OrderLine[], code: string | null, coupons: Coupon[], prices: Prices, now: Date,
): Quote | null => {
  const ordered = lines.filter((l) => l.quantity > 0);
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
