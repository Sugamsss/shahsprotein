import type { OrderLine } from '../types/order';
import type { DeliveryRule } from '../types/offer';

export type { DeliveryRule };
export interface PaidPackMetrics { grams: number; packs: number }

const knownGrams: Record<string, Record<string, number>> = {
  muesli: { '250 g': 250, '500 g': 500 },
  'raggi-jaggi': { '250 g': 250, '500 g': 500 },
  bites: { '250 g': 250 },
};

/** Count only sendable, known retail packs. Unknown sizes and invalid quantities fail closed. */
export const paidPackMetrics = (lines: readonly OrderLine[], isOut: (line: OrderLine) => boolean = () => false): PaidPackMetrics => {
  return lines.reduce<PaidPackMetrics>((metrics, line) => {
    if (isOut(line)) return metrics;
    const grams = knownGrams[line.productId]?.[line.size];
    if (!grams || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 10) {
      throw new Error('Unknown pack or quantity');
    }
    return { grams: metrics.grams + grams * line.quantity, packs: metrics.packs + line.quantity };
  }, { grams: 0, packs: 0 });
};

export const deliveryFee = (metrics: PaidPackMetrics, rule: DeliveryRule): { base: number; waived: boolean; fee: number } => {
  if (!metrics.packs) return { base: 0, waived: false, fee: 0 };
  const base = Math.min(metrics.grams <= 250 ? rule.up_to_250 : rule.above_250, rule.cap);
  const waived = rule.min_packs != null ? metrics.packs >= rule.min_packs : metrics.grams >= (rule.min_grams ?? Infinity);
  return { base, waived, fee: waived ? 0 : base };
};

export const deliveryNudge = (metrics: PaidPackMetrics, rule: DeliveryRule, copy?: { weight: (grams: number) => string; packs: string }): string | null => {
  if (!metrics.packs) return null;
  if (rule.min_packs != null) return metrics.packs < rule.min_packs ? 'Add one more pack and delivery’s on us.' : null;
  const threshold = rule.min_grams ?? Infinity;
  if (metrics.grams >= threshold) return null;
  const remaining = Math.ceil((threshold - metrics.grams) / 50) * 50;
  return copy?.weight(remaining) ?? `Add ${remaining} g more and delivery’s on us.`;
};

export const sliceADeliveryRule = {
  guest: { min_grams: 500, min_packs: null, up_to_250: 50, above_250: 70, cap: 70 },
  first: { min_grams: 500, min_packs: null, up_to_250: 50, above_250: 70, cap: 70 },
  second: { min_grams: null, min_packs: 2, up_to_250: 50, above_250: 70, cap: 70 },
  third_plus: { min_grams: 500, min_packs: null, up_to_250: 50, above_250: 70, cap: 70 },
} satisfies Record<string, DeliveryRule>;

/** What the customer saves against MRP on the items, never below zero. */
export const quoteSavings = (quote: { mrp_total: number; items_total: number }): number =>
  Math.max(0, quote.mrp_total - quote.items_total);
