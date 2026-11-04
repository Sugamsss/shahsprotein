import type { BatchRecord, Kitchen, Order, OrderBatch, SpareState } from '../types';
import { useByOf } from './model';

// Batch numbers, Mfg and Exp (migration 20261104000000). The database gives every batch its
// number when it's logged (R041126: the product's letter and the made-on day, -2 for a second
// batch that day) and fixes its Exp then, from the product's shelf life. These are the pure
// parts: how the dates read, and which batches an order's product could come from instead.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "4 Nov 2026" from an India day ("2026-11-04"): how a date reads on a pack. */
export const labelDate = (day: string): string => {
  const [y, m, d] = day.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};

/**
 * Exp as a person reads it: the last good day, the day before the batch is past (the same day
 * the kitchen calls "good till"). Null when the product never expires.
 */
export const expDay = (b: { expires_on?: string | null }): string | null => useByOf({ expires_on: b.expires_on ?? null });

/** Mfg and Exp, ready to show. exp is null when the product never expires. */
export const batchDates = (b: { made_on: string; expires_on?: string | null }): { mfg: string; exp: string | null } => {
  const exp = expDay(b);
  return { mfg: labelDate(b.made_on), exp: exp ? labelDate(exp) : null };
};

/** True once the database sends batch numbers (the migration is live). */
export const hasBatchNumbers = (o: Order): boolean =>
  (o.kitchen ?? []).some((k) => k.batches.some((b) => typeof b.code === 'string'));

/** The batches one product of an order came from, oldest first, only those with a number. */
export const orderBatches = (o: Order, productId: string): (OrderBatch & { code: string; batch_id: string })[] =>
  (o.kitchen?.find((k) => k.product_id === productId)?.batches ?? [])
    .filter((b): b is OrderBatch & { code: string; batch_id: string } => typeof b.code === 'string' && typeof b.batch_id === 'string');

/**
 * Whether a product's batch can be changed on this order: it isn't cancelled, and the product
 * is ready (not Cooking and still short of it). The server says the same.
 */
export const canChangeBatch = (o: Order, productId: string): boolean => {
  if (o.status === 'cancelled') return false;
  const k = o.kitchen?.find((x) => x.product_id === productId);
  return !!k && k.need > 0 && !k.waiting && k.covered >= k.need;
};

export interface BatchChoice {
  batch_id: string;
  code: string;
  made_on: string;
  expires_on: string | null;
  state: SpareState;
  /** Spare on the shelf now. */
  spare: number;
  /** This order already has all of the product from it. */
  current: boolean;
  /** It has enough spare (with what this order already has from it) to take the whole product. */
  enough: boolean;
  /** Past food never goes out (a delivered order can still be put right). */
  past: boolean;
  /** The first (oldest) batch: what the kitchen picks by itself. */
  oldest: boolean;
}

/**
 * The batches one product of an order could come from, oldest first: every batch on the shelf
 * with spare, plus the ones the order already has food from. Nothing to choose (one batch
 * only, and it's already this one) gives a single current row.
 */
export const batchChoices = (kitchen: Kitchen, o: Order, productId: string): BatchChoice[] => {
  const k = o.kitchen?.find((x) => x.product_id === productId);
  const covered = k?.covered ?? 0;
  const held = new Map(orderBatches(o, productId).map((b) => [b.batch_id, b] as const));
  const shelf = kitchen.products.find((p) => p.product_id === productId)?.spare_batches ?? [];
  const rows = new Map<string, Omit<BatchChoice, 'current' | 'enough' | 'oldest' | 'past'>>();
  for (const b of shelf) {
    if (!b.code) continue;
    rows.set(b.batch_id, { batch_id: b.batch_id, code: b.code, made_on: b.made_on, expires_on: b.expires_on, state: b.state, spare: b.grams });
  }
  for (const b of held.values()) {
    if (rows.has(b.batch_id)) continue;
    const exp = b.expires_on ?? null;
    const state: SpareState = exp && kitchen.today >= exp ? 'past' : 'fresh';
    rows.set(b.batch_id, { batch_id: b.batch_id, code: b.code, made_on: b.made_on, expires_on: exp, state, spare: 0 });
  }
  const sorted = [...rows.values()].sort((a, b) => a.made_on.localeCompare(b.made_on) || a.code.localeCompare(b.code));
  return sorted.map((r, i) => {
    const mine = held.get(r.batch_id)?.grams ?? 0;
    const past = r.state === 'past' && o.status !== 'delivered';
    return {
      ...r,
      current: covered > 0 && mine >= covered,
      enough: r.spare + mine >= covered,
      past,
      oldest: i === 0,
    };
  });
};

/** What's still on the shelf of a listed batch, as a short state: for the Batches page's line. */
export type BatchShelf = 'none' | SpareState;
export const shelfOf = (b: Pick<BatchRecord, 'spare' | 'state'>): BatchShelf => (b.spare > 0 ? b.state : 'none');
