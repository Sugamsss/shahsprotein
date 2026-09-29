import { adminCopy } from '../../data/adminCopy';
import { productsData } from '../../data/products';
import { ORDER_CODE_ALPHABET } from '../../utils/orderCode';
import { firstName, formatDay, formatWeight } from '../format';
import type { KitchenEffects, Order, OrderChanges, OrderKitchen, OrderLine, TotalsByMethod, UpdatedOrder } from '../types';

// The order book's rules in one place: which lane an order is in, its next
// step, and what a change says and how it's undone. No React here.

const copy = adminCopy.orders;

/** Pack size of a free sample (admin only, always free, never priced). */
export const SAMPLE = 'sample';

/**
 * Cooking → Packing → Ready → Delivered (not paid in full: collect) → Done.
 * Done = delivered and (paid in full, or a free sample order), or cancelled.
 */
export type Lane = 'cooking' | 'packing' | 'ready' | 'collect' | 'done';
/** The working lanes, in board order. Done is its own page. */
export const LANES = ['cooking', 'packing', 'ready', 'collect'] as const;
export type WorkLane = (typeof LANES)[number];

export const laneOf = (o: Order): Lane => {
  if (o.status === 'cancelled') return 'done';
  if (o.status === 'delivered') return o.paid || o.free_sample ? 'done' : 'collect';
  return o.status;
};

/**
 * The one-tap next step for a lane. Cooking has none: an order leaves it by itself once its
 * food is logged; by hand it's "Move to Packing" (MOVE_TO_PACKING) in the ⋯ menu.
 */
export const NEXT: Record<Exclude<WorkLane, 'cooking'>, OrderChanges> = {
  packing: { status: 'ready' },
  ready: { status: 'delivered' },
  // Every Mark paid asks how they paid first (PaidSheet), then sends paid_method too.
  collect: { paid: true },
};

/** A Cooking order moved on by hand: its missing food is covered "by hand". */
export const MOVE_TO_PACKING: OrderChanges = { status: 'packing' };

export const nextOf = (o: Order) => {
  const lane = laneOf(o);
  return lane === 'done' || lane === 'cooking' ? null : { lane, changes: NEXT[lane], labels: copy.next[lane] };
};

/** "UPI", "Cash", "Bank transfer", "Other: paid by her brother", or null when there's no method (not paid, or an old order). */
export const paidByText = (p: Pick<Order, 'paid_method' | 'paid_note'> | Pick<OrderChanges, 'paid_method' | 'paid_note'>): string | null => {
  if (!p.paid_method) return null;
  return p.paid_method === 'other' ? adminCopy.paidBy.other(p.paid_note ?? '') : adminCopy.paidBy.names[p.paid_method];
};

/**
 * How every payment was made, each method once, oldest first: "UPI + Cash". Null when
 * there are no payments or none has a method (an old order). For the CSV's Paid by.
 */
export const paymentsByText = (o: Pick<Order, 'payments'>): string | null => {
  const names = new Set(o.payments.map((p) => paidByText({ paid_method: p.method, paid_note: p.note })));
  names.delete(null);
  return names.size ? [...names].join(adminCopy.paidBy.joiner) : null;
};

/**
 * Home's ₹ came in, by how it was paid: UPI, Cash, Bank, Other, then Not recorded,
 * leaving out zeros. The sums come from get_admin_totals(); nothing is added up here.
 */
export const moneyByMethod = (by: TotalsByMethod | undefined): { key: keyof TotalsByMethod; label: string; amount: number }[] =>
  !by ? [] : (['upi', 'cash', 'bank', 'other', 'not_recorded'] as const)
    .filter((key) => by[key] > 0)
    .map((key) => ({
      key,
      label: key === 'not_recorded' ? adminCopy.homePage.notRecorded : adminCopy.paidBy.methods[key],
      amount: by[key],
    }));

/** What the toast says about a change. */
export const changeText = (o: Order, changes: OrderChanges): string => {
  const name = firstName(o.name) || o.code;
  const t = copy.toasts;
  if (changes.status) return t[changes.status](name);
  if (changes.priority !== undefined) return changes.priority ? t.priority(name) : t.notPriority(name);
  return changes.paid ? t.paid(name, paidByText(changes)) : t.unpaid(name);
};

/**
 * What the kitchen did besides this order's move, for the toast's second sentence:
 * its food back as spare ("500 g Date Bites back as spare."), and other orders that moved
 * ("Meera's order moved to Packing."). Empty when nothing else changed.
 */
export const effectsText = (order: Order, effects: KitchenEffects | null): string => {
  if (!effects) return '';
  const k = adminCopy.kitchenEffects;
  const own = effects.orders.find((e) => e.id === order.id);
  const back = (own?.grams ?? []).filter((g) => g.change < 0)
    .map((g) => `${formatWeight(-g.change)} ${productName(g.product_id)}`);
  const moved = effects.orders.filter((e) => e.id !== order.id && e.from !== e.to && e.to !== 'cancelled')
    .map((e) => k.moved(firstName(e.name) || e.code, e.to));
  return [back.length ? k.backAsSpare(back) : '', ...moved].filter(Boolean).join(' ');
};

/**
 * How a change is undone: a move that changed the kitchen (kitchen_effects with an
 * action_id) goes back through undo_admin_kitchen, which puts every row back exactly;
 * anything else sends the reverse keys.
 */
export type UndoPlan = { kitchen: string } | { changes: OrderChanges };
export const undoPlanOf = (before: Order, changes: OrderChanges, saved: UpdatedOrder | null): UndoPlan => {
  const actionId = saved?.kitchen_effects?.action_id;
  return actionId ? { kitchen: actionId } : { changes: reverseOf(before, changes) };
};

/**
 * The keys that put a one-tap change back. Fields typed in (phone, total, note) stay.
 * Paid comes back with its method and note; an old paid order had none, so it
 * gets plain `paid: true`, which leaves it with no method.
 */
export const reverseOf = (o: Order, changes: OrderChanges): OrderChanges => ({
  ...(changes.status !== undefined && { status: o.status }),
  ...(changes.priority !== undefined && { priority: o.priority }),
  ...(changes.paid !== undefined && { paid: o.paid }),
  ...(changes.paid !== undefined && o.paid && o.paid_method && {
    paid_method: o.paid_method,
    ...(o.paid_method === 'other' && o.paid_note && { paid_note: o.paid_note }),
  }),
});

/** The change as the list should show it before the server answers. The kitchen part (what's covered) is the server's. */
export const applyLocal = (o: Order, c: OrderChanges): Order => ({
  ...o,
  ...c,
  // Paid keeps its day and, without a new method, its method; not paid clears all three.
  ...(c.paid !== undefined && {
    paid: c.paid,
    paid_at: c.paid ? o.paid_at ?? new Date().toISOString() : null,
    paid_method: c.paid ? c.paid_method ?? o.paid_method : null,
    paid_note: c.paid ? (c.paid_method ? c.paid_note ?? null : o.paid_note) : null,
  }),
} as Order);

/** An answer from update_admin_order as the list keeps it: the order, without the effects. */
export const orderOnly = ({ kitchen_effects: _, ...order }: UpdatedOrder): Order => order;

// The code in a WhatsApp message, e.g. "…Order code: SN-7KQ4M". A hand-added
// clash carries -2, -3 and so on. Same alphabet as the site's codes.
const CODE_IN_TEXT = new RegExp(`(?:^|[^A-Z0-9])(SN-[${ORDER_CODE_ALPHABET}]{5}(?:-[1-9][0-9]{0,2})?)(?![A-Z0-9-])`, 'i');

/**
 * What "Find an order" searches for: the order code when the text has one (a
 * pasted message), else the text as typed (a name, phone digits, part of a code).
 */
export const searchFor = (text: string): string => {
  const code = CODE_IN_TEXT.exec(text)?.[1];
  return code ? code.toUpperCase() : text;
};

/**
 * A search that names one order: a whole code, or a whole phone number. With
 * one hit, the board opens it. A name opens nothing, so typing never jumps away.
 */
export const namesOneOrder = (q: string): boolean => {
  const t = q.trim();
  return CODE_IN_TEXT.exec(t)?.[1].length === t.length || (/^[\d\s+()-]+$/.test(t) && normalisePhone(t) !== null);
};

/** Digits as the server stores them, or null if it can't be a phone (same rule as the contract). */
export const normalisePhone = (raw: string): string | null => {
  let d = raw.replace(/\D/g, '').replace(/^00/, '');
  if (d.length === 10) d = `91${d}`;
  else if (d.length === 11 && d.startsWith('0')) d = `91${d.slice(1)}`;
  return /^[1-9]\d{10,14}$/.test(d) ? d : null;
};

/**
 * A picked contact's numbers, as the server stores them: each one once, in the
 * phone's order, without the ones that can't be a phone. Contacts sometimes keep
 * the trunk 0 after +91 ("+91 (0) 98765 43210"), which would otherwise read as 12 digits.
 */
export const contactNumbers = (tels: readonly string[]): string[] => [...new Set(
  tels.map((t) => normalisePhone(t.replace(/^\s*(?:\+|00)\s*91[\s-]*\(?0\)?/, '+91')))
    .filter((d): d is string => d !== null),
)];

/** How Add order shows a number: an Indian mobile as its 10 digits, anything else as + and its digits. Null if it can't be a phone. */
export const plainPhone = (raw: string): string | null => {
  const d = normalisePhone(raw);
  return d && (/^91\d{10}$/.test(d) ? d.slice(2) : `+${d}`);
};

/** The one number in some text ("Call me on +91 98765-43210"), as the server stores it. Null if there's none, or two different ones. */
export const phoneInText = (text: string): string | null => {
  const found = contactNumbers(text.match(/\+?\d[\d\s().-]{7,}\d/g) ?? []);
  return found.length === 1 ? found[0] : null;
};

/**
 * After an edit to Phone: the plain number when the edit looks pasted and holds one
 * number, else null (leave the text alone). Pasted means a paste or drop, a keyboard's
 * clipboard chip or suggestion (insertReplacementText), or several characters at once;
 * key-by-key typing is left for blur, so the cursor is never fought.
 */
export const cleanPastedPhone = (before: string, after: string, inputType?: string): string | null => {
  const pasted = inputType === 'insertFromPaste' || inputType === 'insertFromDrop' || inputType === 'insertReplacementText'
    || after.length - before.length > 1;
  const found = pasted ? phoneInText(after) : null;
  return found && plainPhone(found);
};

const product = (id: string) => productsData.find((p) => p.id === id);
export const productName = (id: string) => product(id)?.name ?? id;
export const thumbOf = (id: string, dark: boolean) => {
  const p = product(id);
  return (dark ? p?.orderThumbDark : p?.orderThumb) ?? '';
};

/** Lines in the site's order: product, then pack size, a sample last. */
export const sortLines = (lines: OrderLine[]): OrderLine[] => {
  const rank = (l: OrderLine) => {
    const i = productsData.findIndex((p) => p.id === l.product_id);
    const sizes = productsData[i]?.weightOptions ?? [];
    return (i < 0 ? 99 : i) * 100 + (l.size === SAMPLE ? 99 : Math.max(0, sizes.indexOf(l.size)));
  };
  return [...lines].sort((a, b) => rank(a) - rank(b));
};

/** A line's size as it reads after the product name: "250 g", or "sample" ("Date Bites sample"). */
export const sizeText = (size: string): string => (size === SAMPLE ? adminCopy.samples.word : size);

/** "Raggi Jaggi 250 g × 1, Date Bites sample × 1" */
export const itemsText = (o: Order) =>
  sortLines(o.lines).map((l) => `${productName(l.product_id)} ${sizeText(l.size)} × ${l.quantity}`).join(', ');

/** "3 packs", "1 pack · 1 sample", "2 samples". */
export const packsText = (o: Pick<Order, 'packs' | 'samples'>): string =>
  [o.packs || !o.samples ? adminCopy.order.packs(o.packs) : '', o.samples ? adminCopy.samples.count(o.samples) : '']
    .filter(Boolean).join(' · ');

/**
 * Where a product of an order stands in the kitchen: waiting (Cooking and short of it),
 * or ready, with the days its food was made where it came from logged batches
 * (none when it was all covered by hand). Null when the order has no such product.
 */
export const lineState = (o: Order, productId: string): { ready: false } | { ready: true; madeOn: string[] } | null => {
  const k = o.kitchen?.find((x: OrderKitchen) => x.product_id === productId);
  if (!k) return null;
  if (k.waiting) return { ready: false };
  return { ready: true, madeOn: [...new Set(k.batches.map((b) => b.made_on))] };
};

/**
 * Every product of an order, in the site's order, with where it stands: the order view's
 * "Still to cook" / "Ready, made …", a card's marks, a compact Cooking row.
 */
export const productStates = (o: Order): { product_id: string; ready: boolean; madeOn: string[] }[] =>
  [...new Set(sortLines(o.lines).map((l) => l.product_id))].flatMap((id) => {
    const state = lineState(o, id);
    return state ? [{ product_id: id, ready: state.ready, madeOn: state.ready ? state.madeOn : [] }] : [];
  });

/** A Cooking order where some products are ready and some aren't: its card marks each line. */
export const isPartlyCooked = (o: Order): boolean =>
  o.status === 'cooking' && (o.kitchen ?? []).some((k) => k.waiting) && (o.kitchen ?? []).some((k) => !k.waiting);

/** "Wed 23 Sep" from an India day ("2026-09-23"). */
export const madeOnDay = (day: string): string => formatDay(`${day}T12:00:00+05:30`);

/** A product id from the URL, or null when it isn't one of ours (then there's no filter). */
export const productFilter = (raw: string | null): string | null =>
  (raw && productsData.some((p) => p.id === raw) ? raw : null);

/** "250 g" → 250, "1 kg" → 1000. Anything else sorts last. */
export const gramsOf = (size: string): number => {
  const m = /^\s*([\d.]+)\s*(kg|g)\s*$/i.exec(size);
  return m ? Number(m[1]) * (m[2].toLowerCase() === 'kg' ? 1000 : 1) : Number.MAX_SAFE_INTEGER;
};

/** What to pack of one product across these orders: total packs, and packs per size by weight. */
export const packsOf = (orders: Order[], productId: string): { packs: number; sizes: [string, number][] } => {
  const by = new Map<string, number>();
  orders.forEach((o) => o.lines.forEach((l) => {
    if (l.product_id === productId && l.quantity > 0) by.set(l.size, (by.get(l.size) ?? 0) + l.quantity);
  }));
  const sizes = [...by].sort(([a], [b]) => gramsOf(a) - gramsOf(b));
  return { packs: sizes.reduce((sum, [, n]) => sum + n, 0), sizes };
};

/** Lines in the site's order, with `first`'s lines (the filtered product) moved to the top. */
export const linesFirst = (lines: OrderLine[], first?: string | null): OrderLine[] => {
  const sorted = sortLines(lines);
  return first ? [...sorted.filter((l) => l.product_id === first), ...sorted.filter((l) => l.product_id !== first)] : sorted;
};

/** The card's pouch pile, at most two: the last one sits on top, so the filtered product goes last. */
export const pileOf = (lines: OrderLine[], top?: string | null): string[] => {
  const ids = [...new Set(sortLines(lines).map((l) => l.product_id))];
  if (!top || !ids.includes(top)) return ids.slice(0, 2);
  return [...ids.filter((id) => id !== top).slice(0, 1), top];
};
