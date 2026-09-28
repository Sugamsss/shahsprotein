import { adminCopy } from '../../data/adminCopy';
import type { Order, Payment, PaidMethod } from '../types';
import { paidByText } from './model';

// Part payments, the rules the screens share. No React here. The server owns the
// numbers (migration 20260928000000); `recount` repeats its rule only so a change
// can show at once, and the saved answer replaces it a moment later.

const copy = adminCopy.payments;

/** The payment's method as words: "UPI", "Other: a friend", or "Not recorded" for old ones. */
export const methodText = (p: Pick<Payment, 'method' | 'note'>): string =>
  paidByText({ paid_method: p.method, paid_note: p.note }) ?? copy.noMethod;

const byDate = (a: Payment, b: Payment) =>
  a.paid_at.localeCompare(b.paid_at) || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);

/**
 * The order with these payments, worked out the server's way: paid in full once
 * the payments, oldest first, cover the total (or there's no total), and paid_at,
 * the method and the note are those of the payment that got there.
 */
export const recount = (o: Order, list: Payment[]): Order => {
  const payments = [...list].sort(byDate);
  let running = 0;
  const cover = payments.find((p) => {
    running += p.amount ?? 0;
    return o.amount == null || p.amount == null || running >= o.amount;
  });
  const paid = payments.reduce((sum, p) => sum + (p.amount ?? 0), 0);
  return {
    ...o,
    payments,
    paid: !!cover,
    paid_at: cover?.paid_at ?? null,
    paid_method: cover?.method ?? null,
    paid_note: cover?.note ?? null,
    payment_state: cover ? 'paid' : payments.length ? 'part_paid' : 'not_paid',
    amount_paid: paid,
    amount_due: o.amount == null ? null : Math.max(o.amount - paid, 0),
    amount_extra: o.amount == null ? null : Math.max(paid - o.amount, 0),
  };
};

/** A payment made here, before the server has given it an id. */
export const localPayment = (amount: number | null, method: PaidMethod, note?: string): Payment => {
  const now = new Date().toISOString();
  return { id: `local-${now}`, amount, method, note: method === 'other' ? note ?? null : null, paid_at: now, created_at: now, by_name: null };
};

/** False for a payment shown before the server answered: it can't be removed yet. */
export const isSaved = (p: Payment): boolean => !p.id.startsWith('local-');

/** What "Mark paid" records: whatever is left, or no amount when there's no total. */
export const restOf = (o: Order): number | null => (o.amount == null ? null : o.amount_due ?? o.amount);

/** The payment in `after` that `before` didn't have: the one a save just added. */
export const addedPayment = (before: Order, after: Order): Payment | undefined =>
  after.payments.find((p) => !before.payments.some((q) => q.id === p.id));

/** How full the bar is, 0 to 1. With no total, paid is full and anything else empty. */
export const paidShare = (o: Order): number => {
  if (o.amount == null || o.amount === 0) return o.paid ? 1 : 0;
  return Math.min(o.amount_paid / o.amount, 1);
};

/**
 * The popup's ¾ / ½ / ¼ picks: fractions of the total, rounded to the rupee,
 * and only the ones below what's still due. None without a total.
 */
export const quickPicks = (o: Order): { label: string; amount: number }[] => {
  if (o.amount == null || o.amount_due == null) return [];
  const due = o.amount_due;
  const total = o.amount;
  return ([['¾', 3 / 4], ['½', 1 / 2], ['¼', 1 / 4]] as const)
    .map(([label, share]) => ({ label, amount: Math.round(total * share) }))
    .filter((p) => p.amount >= 1 && p.amount < due);
};

/** A typed amount: whole rupees, commas and ₹ allowed. null when it isn't one. */
export const parseAmount = (text: string): number | null => {
  const t = text.replace(/[₹,\s]/g, '');
  return /^\d{1,7}$/.test(t) && Number(t) >= 1 && Number(t) <= 1_000_000 ? Number(t) : null;
};
