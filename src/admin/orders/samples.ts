import type { KitchenSettings, Order, OrderInput, OrderLine, PaidMethod, ShelfLife, ShelfLifeUnit } from '../types';
import { SAMPLE } from './model';

// Samples and shelf life in the forms (Add order / Edit, the product sheet) and the
// Free samples list. Pure, so the rules are tested apart from the screens.

/** Every line is a sample: a free sample order, which has no total, no coupon and nothing to pay. */
export const isSamplesOnly = (lines: Pick<OrderLine, 'size' | 'quantity'>[]): boolean => {
  const kept = lines.filter((l) => l.quantity > 0);
  return kept.length > 0 && kept.every((l) => l.size === SAMPLE);
};

/**
 * The money part of save_admin_order's order. A free sample order sends no total, no
 * coupon and no paid (the server refuses them), and an edit that became samples only
 * clears the total and coupon it had. Everything else goes as the form has it.
 */
export const moneyInput = ({ samplesOnly, editing, total, coupon, paid, paidMethod, paidNote }: {
  samplesOnly: boolean;
  editing: boolean;
  total: number | null;
  coupon: string;
  paid: boolean;
  paidMethod: PaidMethod | '';
  paidNote: string;
}): Pick<OrderInput, 'amount' | 'coupon' | 'paid' | 'paid_method' | 'paid_note'> => {
  if (samplesOnly) return editing ? { amount: null, coupon: null } : { amount: null };
  if (editing) return { amount: total, coupon: coupon || null };
  return {
    amount: total,
    ...(coupon && { coupon }),
    paid,
    ...(paid && paidMethod && { paid_method: paidMethod }),
    ...(paid && paidMethod === 'other' && { paid_note: paidNote.trim() }),
  };
};

/** The product sheet's sample and shelf-life boxes, as typed. */
export interface KeepDraft { sample: string; amount: string; unit: ShelfLifeUnit }

export const keepDraft = (sampleGrams: number, life: ShelfLife | null): KeepDraft => ({
  sample: String(sampleGrams),
  amount: life ? String(life.amount) : '',
  unit: life?.unit ?? 'months',
});

const whole = (raw: string): number | null => {
  const text = raw.trim();
  return /^\d{1,4}$/.test(text) ? Number(text) : null;
};

/**
 * What to send to set_admin_kitchen_product: only what changed (null when nothing did),
 * or which box isn't a whole number. The ranges (1 to 500 g, 1 to 365 days, 1 to 24
 * months) are the server's; its words show as they come.
 */
export const keepChanges = (
  before: { sample_grams: number; shelf_life: ShelfLife | null }, draft: KeepDraft,
): { settings: KitchenSettings | null } | { bad: 'sample' | 'shelf' } => {
  const sample = whole(draft.sample);
  if (sample === null) return { bad: 'sample' };
  // An empty box only fits a product that never had a shelf life.
  const empty = draft.amount.trim() === '';
  const amount = empty ? null : whole(draft.amount);
  if (empty ? !!before.shelf_life : amount === null) return { bad: 'shelf' };
  const life = amount === null ? null : { amount, unit: draft.unit };
  const settings: KitchenSettings = {
    ...(sample !== before.sample_grams && { sample_grams: sample }),
    ...((life?.amount !== before.shelf_life?.amount || life?.unit !== before.shelf_life?.unit) && { shelf_life: life }),
  };
  return { settings: Object.keys(settings).length ? settings : null };
};

/** A free samples row: the order's sample lines, and whether they rode along with a real order. */
export const sampleLines = (o: Pick<Order, 'lines'>): OrderLine[] => o.lines.filter((l) => l.size === SAMPLE);

/**
 * The Free samples list in groups: orders not delivered yet first (still newest first),
 * then delivered and cancelled ones under their day. `dayOf` names an order's day.
 */
export const sampleGroups = <T extends Pick<Order, 'status' | 'created_at'>>(
  orders: T[], dayOf: (iso: string) => string,
): { day: string | null; orders: T[] }[] => {
  const open = orders.filter((o) => o.status !== 'delivered' && o.status !== 'cancelled');
  const groups: { day: string | null; orders: T[] }[] = open.length ? [{ day: null, orders: open }] : [];
  orders.filter((o) => !open.includes(o)).forEach((o) => {
    const day = dayOf(o.created_at);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.orders.push(o);
    else groups.push({ day, orders: [o] });
  });
  return groups;
};
