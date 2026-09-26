import { adminCopy } from '../../data/adminCopy';
import { productsData } from '../../data/products';
import { ORDER_CODE_ALPHABET } from '../../utils/orderCode';
import { firstName } from '../format';
import type { Order, OrderChanges, OrderLine } from '../types';

// The order book's rules in one place: which lane an order is in, its next
// step, and what a change says and how it's undone. No React here.

const copy = adminCopy.orders;

export type Lane = 'confirm' | 'send' | 'way' | 'collect' | 'stale' | 'done';
/** The four working lanes, in board order. Stale sits under To confirm; Done is its own page. */
export const LANES = ['confirm', 'send', 'way', 'collect'] as const;

export const laneOf = (o: Order): Lane => {
  if (o.status === 'cancelled' || (o.status === 'delivered' && o.paid)) return 'done';
  if (o.status === 'delivered') return 'collect';
  if (o.status === 'sent') return 'way';
  if (o.status === 'confirmed') return 'send';
  return o.stale ? 'stale' : 'confirm';
};

/**
 * The one-tap next step for a lane. Confirm goes through the Confirm sheet (or the popup).
 * A stale order confirms the same way, once their message finally arrives.
 */
export const NEXT: Record<Exclude<Lane, 'done'>, OrderChanges> = {
  confirm: { status: 'confirmed' },
  stale: { status: 'confirmed' },
  send: { status: 'sent' },
  way: { status: 'delivered' },
  // Every Mark paid asks how they paid first (PaidSheet), then sends paid_method too.
  collect: { paid: true },
};

export const nextOf = (o: Order) => {
  const lane = laneOf(o);
  return lane === 'done' ? null : { lane, changes: NEXT[lane], labels: copy.next[lane] };
};

/** "UPI", "Cash", "Bank transfer", "Other: paid by her brother", or null when there's no method (not paid, or an old order). */
export const paidByText = (p: Pick<Order, 'paid_method' | 'paid_note'> | Pick<OrderChanges, 'paid_method' | 'paid_note'>): string | null => {
  if (!p.paid_method) return null;
  return p.paid_method === 'other' ? adminCopy.paidBy.other(p.paid_note ?? '') : adminCopy.paidBy.names[p.paid_method];
};

/** What the toast says about a change. */
export const changeText = (o: Order, changes: OrderChanges): string => {
  const name = firstName(o.name) || o.code;
  const t = copy.toasts;
  if (changes.status) return t[changes.status](name);
  if (changes.paid !== undefined) return changes.paid ? t.paid(name, paidByText(changes)) : t.unpaid(name);
  return t.kept(name);
};

/**
 * The keys that put a one-tap change back. Fields typed in (phone, total, note) stay.
 * Paid comes back with its method and note; an old paid order had none, so it
 * gets plain `paid: true`, which leaves it with no method.
 */
export const reverseOf = (o: Order, changes: OrderChanges): OrderChanges => ({
  ...(changes.status !== undefined && { status: o.status }),
  ...(changes.paid !== undefined && { paid: o.paid }),
  ...(changes.paid !== undefined && o.paid && o.paid_method && {
    paid_method: o.paid_method,
    ...(o.paid_method === 'other' && o.paid_note && { paid_note: o.paid_note }),
  }),
  ...(changes.kept !== undefined && { kept: false }),
});

/**
 * The change as the list should show it before the server answers. The server
 * owns `stale`; locally it only ever clears it, because a status change or
 * Still waiting restarts the server's clock. Undoing Still waiting leaves it
 * to the server's answer.
 */
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
  stale: c.status || c.kept ? false : o.stale,
  kept: c.kept ?? o.kept,
} as Order);

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

const product = (id: string) => productsData.find((p) => p.id === id);
export const productName = (id: string) => product(id)?.name ?? id;
export const thumbOf = (id: string, dark: boolean) => {
  const p = product(id);
  return (dark ? p?.orderThumbDark : p?.orderThumb) ?? '';
};

/** Lines in the site's order: product, then pack size. */
export const sortLines = (lines: OrderLine[]): OrderLine[] => {
  const rank = (l: OrderLine) => {
    const i = productsData.findIndex((p) => p.id === l.product_id);
    const sizes = productsData[i]?.weightOptions ?? [];
    return (i < 0 ? 99 : i) * 100 + Math.max(0, sizes.indexOf(l.size));
  };
  return [...lines].sort((a, b) => rank(a) - rank(b));
};

/** "Raggi Jaggi 250 g × 1, Muesli 500 g × 2" */
export const itemsText = (o: Order) =>
  sortLines(o.lines).map((l) => `${productName(l.product_id)} ${l.size} × ${l.quantity}`).join(', ');

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
