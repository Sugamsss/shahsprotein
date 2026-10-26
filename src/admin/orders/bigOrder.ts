import { productsData } from '../../data/products';
import type { OrderLine } from '../types';
import { SAMPLE, sortLines } from './model';
import { rateKey, type Rates } from './quote';

// Big orders and Advanced edit in Add order (admin only). The rules here are pure and
// tested; the screens are BigOrder.tsx and AdvancedEditSheet.tsx.

/** Packs on one line, typed by hand. save_admin_order allows the same (20261026000000). */
export const MAX_QUANTITY = 9999;
/** One pack's weight in Advanced edit: 1 g to 10 kg, as the server checks. */
export const MAX_PACK_GRAMS = 10000;
/** A price typed on the order: whole rupees, as the price list takes. */
export const MAX_PRICE = 99999;
/** From this many packs an order is a big one, and saving it gets the party. */
export const BIG_ORDER_PACKS = 100;

/** '250 g' is 250 and '1 kg' is 1000, as order_size_grams() reads them; null for a sample. */
export const sizeGrams = (size: string): number | null => {
  const m = /^([0-9]{1,5}) ?(g|kg)$/.exec(size);
  return m ? Number(m[1]) * (m[2] === 'kg' ? 1000 : 1) : null;
};

/** The size a weight saves as: the product's own spelling when it comes in that size, else '1 kg' or '750 g'. */
export const sizeFor = (productId: string, grams: number): string => {
  const own = productsData.find((p) => p.id === productId)?.weightOptions.find((s) => sizeGrams(s) === grams);
  if (own) return own;
  return grams % 1000 === 0 ? `${grams / 1000} kg` : `${grams} g`;
};

/** A weight the product isn't sold in on the site, set with Advanced edit. */
export const isCustomSize = (productId: string, size: string): boolean =>
  size !== SAMPLE && !productsData.find((p) => p.id === productId)?.weightOptions.includes(size);

/** Grams of food in the packs. Samples are left out: they weigh what the kitchen says. */
export const packGrams = (lines: OrderLine[]): number =>
  lines.reduce((sum, l) => sum + (sizeGrams(l.size) ?? 0) * l.quantity, 0);

/** How excited the Big order card gets: 0 under 100 packs, then 100, 500 and 1,000 or more. */
export const hypeLevel = (packs: number): 0 | 1 | 2 | 3 =>
  (packs >= 1000 ? 3 : packs >= 500 ? 2 : packs >= BIG_ORDER_PACKS ? 1 : 0);

/** Typed digits as a whole number, or null when there are none. Anything else typed is ignored. */
export const typedNumber = (text: string): number | null => {
  const digits = text.replace(/\D/g, '');
  return digits ? Number(digits) : null;
};

// ---- Advanced edit ------------------------------------------------------------------------

/** One line as the sheet edits it: text while typing, checked only on Done. */
export interface Draft {
  id: number;
  productId: string;
  /** One of the product's sizes, or 'other' for a weight typed in grams. */
  size: string;
  grams: string;
  qty: string;
  price: string;
}

export type DraftError = 'weight' | 'quantity' | 'price';

/** The order's packs as drafts, in the site's order. Samples stay out: the sheet is for packs. */
export const toDrafts = (qty: Record<string, number>, rates: Rates): Draft[] => {
  const lines = Object.entries(qty)
    .map(([key, quantity]) => {
      const [product_id, size] = key.split('|');
      return { product_id, size, quantity };
    })
    .filter((l) => l.quantity > 0 && l.size !== SAMPLE);
  return sortLines(lines).map((l, i) => {
    const custom = isCustomSize(l.product_id, l.size);
    const rate = rates[rateKey(l.product_id, l.size)];
    return {
      id: i + 1,
      productId: l.product_id,
      size: custom ? 'other' : l.size,
      grams: custom ? String(sizeGrams(l.size) ?? '') : '',
      qty: String(l.quantity),
      price: rate != null ? String(rate) : '',
    };
  });
};

/**
 * The drafts back as the order's packs and typed prices. Two drafts that end up the same
 * product and weight become one line (packs added, capped). Any draft that doesn't check
 * out is named in `errors` by id, and nothing should be applied until there are none.
 */
export const fromDrafts = (drafts: Draft[]): { qty: Record<string, number>; rates: Rates; errors: Record<number, DraftError> } => {
  const qty: Record<string, number> = {};
  const rates: Rates = {};
  const errors: Record<number, DraftError> = {};
  for (const d of drafts) {
    const grams = d.size === 'other' ? typedNumber(d.grams) : sizeGrams(d.size);
    const packs = typedNumber(d.qty);
    const price = typedNumber(d.price);
    if (!grams || grams > MAX_PACK_GRAMS) errors[d.id] = 'weight';
    else if (!packs || packs > MAX_QUANTITY) errors[d.id] = 'quantity';
    else if (price != null && (price < 1 || price > MAX_PRICE)) errors[d.id] = 'price';
    if (errors[d.id] || !grams || !packs) continue;
    const key = rateKey(d.productId, sizeFor(d.productId, grams));
    qty[key] = Math.min(MAX_QUANTITY, (qty[key] ?? 0) + packs);
    if (price != null) rates[key] = price;
  }
  return { qty, rates, errors };
};
