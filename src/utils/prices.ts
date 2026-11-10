import { productsData } from '../data/products';
import type { CouponPrices, OrderLine } from '../types/order';
import type { Product } from '../types/product';

export const formatRupees = (rupees: number): string => `₹${rupees.toLocaleString('en-IN')}`;
export const couponPriceKey = (productId: string, size: string): string => `${productId}|${size}`;
let liveMrps: Readonly<CouponPrices> | null = null;
let liveOfferPrices: Readonly<CouponPrices> | null = null;
export const getLiveMrps = (): Readonly<CouponPrices> | null => liveMrps;
export const setLiveMrps = (mrps: Readonly<CouponPrices> | null): void => { liveMrps = mrps; };
export const setLiveOfferPrices = (prices: Readonly<CouponPrices> | null): void => { liveOfferPrices = prices; };
export const currentOfferPrices = (): Readonly<CouponPrices> | null => liveOfferPrices;
export const mrpOf = (product: Product, size: string): number | undefined => liveMrps ? liveMrps[couponPriceKey(product.id, size)] : product.mrp[size];
export const parseCouponPrices = (raw: unknown): CouponPrices => {
  const prices: CouponPrices = {};
  if (!Array.isArray(raw)) return prices;
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const { product_id: productId, size, price } = row as Record<string, unknown>;
    if (typeof productId === 'string' && typeof size === 'string' && typeof price === 'number' && Number.isInteger(price) && price > 0) prices[couponPriceKey(productId, size)] = price;
  }
  return prices;
};
export interface PackPrice { price: number; mrp: number }
export const packPrice = (product: Product, size: string, couponPrices?: CouponPrices | null): PackPrice | null => {
  const mrp = mrpOf(product, size); if (mrp == null) return null;
  const key = couponPriceKey(product.id, size);
  // One candidate at a time: the checked coupon's own list, else the guest list, else MRP.
  const coupon = couponPrices?.[key];
  const price = coupon ?? liveOfferPrices?.[key] ?? mrp;
  return { price, mrp };
};
export interface OrderTotal { total: number; mrpTotal: number }
export const orderTotal = (lines: readonly OrderLine[], couponPrices?: CouponPrices | null, products: readonly Product[] = productsData): OrderTotal | null => {
  if (lines.length === 0) return null;
  let total = 0; let mrpTotal = 0;
  for (const line of lines) { const product = products.find((p) => p.id === line.productId); const price = product && packPrice(product, line.size, couponPrices); if (!price) return null; total += price.price * line.quantity; mrpTotal += price.mrp * line.quantity; }
  return { total, mrpTotal };
};
