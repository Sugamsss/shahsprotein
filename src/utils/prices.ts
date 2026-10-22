import { productsData } from '../data/products';
import type { CouponPrices, OrderLine } from '../types/order';
import type { Product } from '../types/product';

// MRPs live in products.ts; a coupon's own prices come from check_coupon() and
// stay in memory with the coupon. Whole rupees everywhere.

/** 1650 -> "₹1,650" (Indian grouping). */
export const formatRupees = (rupees: number): string => `₹${rupees.toLocaleString('en-IN')}`;

/** The key a coupon price is stored under, e.g. "muesli|250 g". */
export const couponPriceKey = (productId: string, size: string): string => `${productId}|${size}`;

/**
 * Reads check_coupon()'s `prices` list. Anything that isn't a whole price for a
 * product and size is skipped, and a missing list (an older database) is none,
 * so every pack falls back to its MRP.
 */
export const parseCouponPrices = (raw: unknown): CouponPrices => {
  const prices: CouponPrices = {};
  if (!Array.isArray(raw)) return prices;
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const { product_id: productId, size, price } = row as Record<string, unknown>;
    if (typeof productId !== 'string' || typeof size !== 'string') continue;
    if (typeof price !== 'number' || !Number.isInteger(price) || price < 1) continue;
    prices[couponPriceKey(productId, size)] = price;
  }
  return prices;
};

export interface PackPrice {
  /** What one pack costs: the coupon's price if it has one, else the MRP. */
  price: number;
  mrp: number;
}

/** One pack's price, or null when the size has no MRP. Same rule as the admin's total (quote.ts). */
export const packPrice = (product: Product, size: string, couponPrices?: CouponPrices | null): PackPrice | null => {
  const mrp = product.mrp[size];
  if (mrp == null) return null;
  const offer = couponPrices?.[couponPriceKey(product.id, size)];
  return { price: offer ?? mrp, mrp };
};

export interface OrderTotal {
  /** What the packs cost: coupon prices where the coupon has them, else MRP. Delivery isn't in it. */
  total: number;
  /** The same packs at MRP, so a coupon saving can show struck through. */
  mrpTotal: number;
}

/**
 * The order's total before delivery, or null when there's nothing to add up or a
 * pack has no MRP (no total rather than a wrong one). Pass only the lines that are
 * sent (in stock), so it matches the message.
 */
export const orderTotal = (
  lines: readonly OrderLine[],
  couponPrices?: CouponPrices | null,
  products: readonly Product[] = productsData,
): OrderTotal | null => {
  if (lines.length === 0) return null;
  let total = 0;
  let mrpTotal = 0;
  for (const line of lines) {
    const product = products.find((p) => p.id === line.productId);
    const price = product && packPrice(product, line.size, couponPrices);
    if (!price) return null;
    total += price.price * line.quantity;
    mrpTotal += price.mrp * line.quantity;
  }
  return { total, mrpTotal };
};
