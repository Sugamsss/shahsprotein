import { productsData } from '../../data/products';
import { firstName, istDateValue } from '../format';
import type { Kitchen, KitchenBatch, KitchenEffects, KitchenProduct } from '../types';

// The kitchen's rules for the screens: what to cook, spare and its dates, the wheels'
// steps, and what a batch did (or would do) in plain parts. No React and no words
// here (the copy builds sentences from these parts), so it's all testable.

// ---- Products and what to cook ---------------------------------------------------

const rank = (productId: string) => {
  const i = productsData.findIndex((p) => p.id === productId);
  return i < 0 ? 99 : i;
};

/** Kitchen products in the site's order (the RPC sorts by id). */
export const inSiteOrder = <T extends { product_id: string }>(list: T[]): T[] =>
  [...list].sort((a, b) => rank(a.product_id) - rank(b.product_id));

/** What to cook, product by product in the site's order: the headline and the sheet's pre-fill. */
export const toCook = (kitchen: Kitchen): { product_id: string; grams: number }[] =>
  inSiteOrder(kitchen.products).filter((p) => p.to_cook > 0).map((p) => ({ product_id: p.product_id, grams: p.to_cook }));

export interface LogRow { product_id: string; need: number; grams: number }

/** What Log cooking opens with: every product to cook, at exactly its need. */
export const prefill = (kitchen: Kitchen): LogRow[] =>
  toCook(kitchen).map((c) => ({ product_id: c.product_id, need: c.grams, grams: Math.min(c.grams, WHEEL_MAX) }));

/** Distinct orders waiting on the kitchen. */
export const ordersWaiting = (kitchen: Kitchen): number =>
  new Set(kitchen.products.flatMap((p) => p.queue.map((q) => q.order_id))).size;

/** Who a product card names: priority orders, and orders waiting on nothing else. */
export const cardNotes = (p: KitchenProduct): { priority: string[]; onlyThis: string[] } => ({
  priority: p.queue.filter((q) => q.priority).map((q) => nameOf(q)),
  onlyThis: p.queue.filter((q) => !q.priority && q.covered.length > 0 && q.also_waiting.length === 0).map((q) => nameOf(q)),
});

/** A first name for a sentence, else the order's code. */
export const nameOf = (o: { name: string | null; code: string }): string => firstName(o.name) || o.code;

// ---- Days (India calendar days as "2026-09-29") ----------------------------------

/** The day `n` days after `day` (negative: before). */
export const shiftDay = (day: string, n: number): string => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** How far back a batch may be made (the database refuses more). */
export const MADE_ON_DAYS_BACK = 60;

export type MadeOnChoice = 'today' | 'yesterday' | 'pick';
export const madeOnChoice = (day: string, today: string): MadeOnChoice =>
  (day === today ? 'today' : day === shiftDay(today, -1) ? 'yesterday' : 'pick');

// ---- Spare and shelf life ---------------------------------------------------------

export type SpareBatch = KitchenProduct['spare_batches'][number];

/** "Use by" is the last good day: the day before expires_on (the first day past). */
export const useByOf = (b: Pick<SpareBatch, 'expires_on'>): string | null => (b.expires_on ? shiftDay(b.expires_on, -1) : null);

/** How to say how long spare keeps: days while it's a month or less, else the use-by day. */
export type Keeps =
  | { kind: 'past' }
  | { kind: 'today' }
  | { kind: 'days'; days: number }
  | { kind: 'until'; day: string }
  | { kind: 'none' };

export const keepsOf = (b: Pick<SpareBatch, 'state' | 'days_left' | 'expires_on'>): Keeps => {
  if (b.state === 'past') return { kind: 'past' };
  if (b.days_left === null || !b.expires_on) return { kind: 'none' };
  if (b.days_left <= 1) return { kind: 'today' };
  if (b.days_left <= 30) return { kind: 'days', days: b.days_left };
  return { kind: 'until', day: useByOf(b)! };
};

const urgency = (b: SpareBatch) => (b.state === 'past' ? -1 : b.days_left ?? Infinity);

/**
 * The spare that needs a look, one per product (the most urgent of its near or past
 * batches), most urgent first: the warning line under Pranjali's headline.
 */
export const spareWarnings = (kitchen: Kitchen): { product_id: string; batch: SpareBatch }[] =>
  kitchen.products
    .flatMap((p) => {
      const worst = p.spare_batches.filter((b) => b.state !== 'fresh').sort((a, b) => urgency(a) - urgency(b))[0];
      return worst ? [{ product_id: p.product_id, batch: worst }] : [];
    })
    .sort((a, b) => urgency(a.batch) - urgency(b.batch) || rank(a.product_id) - rank(b.product_id));

// ---- The wheels ---------------------------------------------------------------------

export const GRAM_STEP = 50;
/** The kg wheel's top: 25 kg 950 g is the most one row can log. */
export const KG_MAX = 25;
/** The most the wheels show, 25 kg 950 g: a bigger need pre-fills this, so the pill and the wheel agree. */
export const WHEEL_MAX = KG_MAX * 1000 + 1000 - 50;
/** Bigger than this in one batch asks first ("30 kg of Muesli? That's a lot, just checking"). */
export const BIG_BATCH = 10_000;

/** 0 to `max` in steps. */
export const steps = (from: number, to: number, step: number): number[] =>
  Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);

/** A value that isn't on a step (a need of 2,040 g with a sample) joins the list in its place, so the wheel can show it. */
export const withValue = (options: number[], value: number): number[] =>
  (options.includes(value) ? options : [...options, value].sort((a, b) => a - b));

/** 2,250 → { kg: 2, g: 250 }. */
export const splitGrams = (grams: number): { kg: number; g: number } => ({ kg: Math.floor(grams / 1000), g: grams % 1000 });

/** The kg wheel's rows, and the grams wheel's rows for this value (0 to 950 in 50s, plus an odd remainder). */
export const kgOptions = (): number[] => steps(0, KG_MAX, 1);
export const gOptions = (grams: number): number[] => withValue(steps(0, 1000 - GRAM_STEP, GRAM_STEP), grams % 1000);

/**
 * "Part of it" of a batch's spare: 50 g steps up to just under all of it (all of it is
 * its own choice). Empty when there's too little to split.
 */
export const partOptions = (spare: number): number[] => (spare > GRAM_STEP ? steps(GRAM_STEP, spare - 1, GRAM_STEP) : []);

/** Where "Part of it" starts: about half, on a step. */
export const partStart = (spare: number): number => {
  const options = partOptions(spare);
  if (!options.length) return spare;
  const half = Math.round(spare / 2 / GRAM_STEP) * GRAM_STEP;
  return options.includes(half) ? half : options[options.length - 1];
};

// ---- What a kitchen call did --------------------------------------------------------

type EffectOrder = KitchenEffects['orders'][number];

/** One thing a batch does, ready for the copy to say. Weights are grams, names first names. */
export type Outcome =
  /** Orders that leave Cooking. `all`: every order that was waiting. */
  | { kind: 'toPacking'; names: string[]; all: boolean }
  /**
   * One order got some of its food and still waits on the rest. `got`: products now fully
   * covered; `part`: products it got some grams of but is still short on (grams it got).
   */
  | { kind: 'partly'; name: string; got: string[]; part: { product_id: string; grams: number }[]; waits: { product_id: string; grams: number }[] }
  /** Orders this doesn't reach, and what's still to cook overall. */
  | { kind: 'stillWait'; names: string[]; toCook: { product_id: string; grams: number }[] }
  /** A Cooking order that loses food it had (a batch made smaller, or a priority order took it). */
  | { kind: 'waitsAgain'; name: string; lost: { product_id: string; grams: number }[] }
  /** Orders that lose food and go back to Cooking (a batch made smaller or deleted). */
  | { kind: 'backToCooking'; names: string[] }
  /** Food going onto the shelf, with its use-by day. */
  | { kind: 'spare'; product_id: string; grams: number; useBy: string | null }
  /** A batch's spare shrinks or goes (a fix or a delete). */
  | { kind: 'spareLess'; product_id: string; before: number; after: number }
  /** Nothing goes spare (said quietly, after the orders). */
  | { kind: 'noSpare' }
  /** A fix that moves no order. */
  | { kind: 'ordersSame' };

const orderName = (o: EffectOrder) => nameOf(o);
const gained = (o: EffectOrder) => o.grams.filter((g) => g.change > 0).map((g) => g.product_id);

/** What an order still waits on after the change, from the kitchen's queues. */
const waitsOf = (after: Kitchen, orderId: string) =>
  inSiteOrder(after.products).flatMap((p) => {
    const q = p.queue.find((x) => x.order_id === orderId);
    return q ? [{ product_id: p.product_id, grams: q.short }] : [];
  });

/**
 * A log, a fix or a delete as outcomes, in the order the sheet says them: orders that
 * leave Cooking, orders partly covered, orders going back, who still waits (a log
 * only), then the shelf. `before` is the kitchen the sheet opened on.
 */
export const outcomesOf = (effects: KitchenEffects, before: Kitchen, mode: 'log' | 'fix'): Outcome[] => {
  const after = effects.kitchen;
  const out: Outcome[] = [];
  const toPacking = effects.orders.filter((o) => o.from === 'cooking' && o.to !== 'cooking');
  if (toPacking.length) {
    const waiting = new Set(before.products.flatMap((p) => p.queue.map((q) => q.order_id)));
    const all = waiting.size > 0 && [...waiting].every((id) => toPacking.some((o) => o.id === id));
    out.push({ kind: 'toPacking', names: toPacking.map(orderName), all });
  }
  for (const o of effects.orders) {
    if (o.from === 'cooking' && o.to === 'cooking' && gained(o).length) {
      const waits = waitsOf(after, o.id);
      const short = (id: string) => waits.some((w) => w.product_id === id);
      const up = o.grams.filter((g) => g.change > 0).sort((a, b) => rank(a.product_id) - rank(b.product_id));
      out.push({
        kind: 'partly',
        name: orderName(o),
        got: up.filter((g) => !short(g.product_id)).map((g) => g.product_id),
        part: up.filter((g) => short(g.product_id)).map((g) => ({ product_id: g.product_id, grams: g.change })),
        waits,
      });
    }
  }
  for (const o of effects.orders) {
    const lost = o.grams.filter((g) => g.change < 0).sort((a, b) => rank(a.product_id) - rank(b.product_id));
    if (o.from === 'cooking' && o.to === 'cooking' && lost.length) {
      out.push({ kind: 'waitsAgain', name: orderName(o), lost: lost.map((g) => ({ product_id: g.product_id, grams: -g.change })) });
    }
  }
  const back = effects.orders.filter((o) => o.to === 'cooking' && o.from !== 'cooking');
  if (back.length) out.push({ kind: 'backToCooking', names: back.map(orderName) });

  if (mode === 'log') {
    const touched = new Set(effects.orders.map((o) => o.id));
    const seen = new Set<string>();
    const names: string[] = [];
    // Fill order (priority first, then oldest), product by product.
    for (const p of inSiteOrder(after.products)) {
      for (const q of p.queue) {
        if (touched.has(q.order_id) || seen.has(q.order_id)) continue;
        seen.add(q.order_id);
        names.push(nameOf(q));
      }
    }
    if (names.length) out.push({ kind: 'stillWait', names, toCook: toCook(after) });
  } else if (!out.length) {
    out.push({ kind: 'ordersSame' });
  }

  let spare = false;
  for (const b of inSiteOrder(effects.batches)) {
    const was = before.batches.find((x) => x.id === b.id);
    const now = b.deleted ? 0 : b.spare;
    if (mode === 'fix' && was && now < was.spare) {
      out.push({ kind: 'spareLess', product_id: b.product_id, before: was.spare, after: now });
      spare = spare || now > 0;
    } else if (now > 0 && (mode === 'log' || !was || now !== was.spare || was.made_on !== b.made_on)) {
      const onShelf = after.products.find((p) => p.product_id === b.product_id)?.spare_batches.find((s) => s.batch_id === b.id);
      out.push({ kind: 'spare', product_id: b.product_id, grams: now, useBy: onShelf ? useByOf(onShelf) : null });
      spare = true;
    } else if (now > 0) {
      spare = true;
    }
  }
  if (mode === 'log' && !spare && effects.batches.length) out.push({ kind: 'noSpare' });
  return out;
};

/** Orders a change sends to Packing (the toast's "5 orders to Packing"). */
export const packedCount = (effects: KitchenEffects): number =>
  effects.orders.filter((o) => o.from === 'cooking' && o.to !== 'cooking').length;

/** The batches logged in the last 7 days, newest first: "Logged this week". */
export const loggedThisWeek = (kitchen: Kitchen): KitchenBatch[] => {
  const from = shiftDay(kitchen.today, -6);
  return kitchen.batches.filter((b) => istDateValue(b.created_at) >= from || b.made_on >= from);
};
