import { adminCopy } from '../../data/adminCopy';
import { productsData } from '../../data/products';
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

/** The one-tap next step for a lane. Confirm goes through the Confirm sheet (or the popup). */
export const NEXT: Record<(typeof LANES)[number], OrderChanges> = {
  confirm: { status: 'confirmed' },
  send: { status: 'sent' },
  way: { status: 'delivered' },
  collect: { paid: true },
};

export const nextOf = (o: Order) => {
  const lane = laneOf(o);
  return lane === 'stale' || lane === 'done' ? null : { lane, changes: NEXT[lane], labels: copy.next[lane] };
};

/** What the toast says about a change. */
export const changeText = (o: Order, changes: OrderChanges): string => {
  const name = firstName(o.name) || o.code;
  const t = copy.toasts;
  if (changes.status) return t[changes.status](name);
  if (changes.paid !== undefined) return changes.paid ? t.paid(name) : t.unpaid(name);
  return t.kept(name);
};

/** The keys that put a one-tap change back. Fields typed in (phone, total, note) stay. */
export const reverseOf = (o: Order, changes: OrderChanges): OrderChanges => ({
  ...(changes.status !== undefined && { status: o.status }),
  ...(changes.paid !== undefined && { paid: o.paid }),
  ...(changes.kept !== undefined && { kept: false }),
});

/** The change as the list should show it before the server answers. */
export const applyLocal = (o: Order, c: OrderChanges): Order => ({
  ...o,
  ...c,
  ...(c.paid !== undefined && { paid: c.paid, paid_at: c.paid ? o.paid_at ?? new Date().toISOString() : null }),
  stale: c.status || c.kept ? false : o.stale,
  kept: c.kept ?? o.kept,
} as Order);

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
