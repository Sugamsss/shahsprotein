import { useCallback, useRef } from 'react';
import { adminCopy } from '../../data/adminCopy';
import { useOverview } from '../AdminLayout';
import { addPayment, deletePayment, payRest, restorePayments, updateOrder } from '../api';
import { firstName, formatMoney } from '../format';
import type { Order, Payment, PaidMethod } from '../types';
import { useUndoable } from '../useUndoable';
import { addedPayment, localPayment, methodText, recount, restOf } from './payments';

const toasts = adminCopy.payments.toasts;

/** How they paid, as the method pickers give it. */
export interface HowPaid { method: PaidMethod; note?: string }

/**
 * Every money change on an order, on the shared useUndoable: show it at once,
 * save it, offer Undo, and go back if the save fails. Each Undo is exact:
 *   Mark paid / Part payment  → removes the payment it added
 *   Remove one payment        → puts that payment back (same id and date)
 *   Mark not paid             → puts every payment back
 * Never send `paid: true/false` through useOrderChange for these: `paid: false`
 * removes every payment, so it can't undo a single Mark paid.
 */
export const usePayments = (show: (order: Order) => void) => {
  const run = useUndoable();
  const { reload: reloadBadge } = useOverview();
  const showRef = useRef(show);
  showRef.current = show;

  const go = useCallback((before: Order, local: Order, save: () => Promise<Order>, text: string,
    undo: (saved: Order) => void, quiet = false): Promise<void> => {
    let saved = local;
    return run({
      apply: () => {
        showRef.current(local);
        return () => showRef.current(before);
      },
      save: async () => {
        saved = await save();
        showRef.current(saved);
        void reloadBadge();
      },
      text,
      undo: () => undo(saved),
      quiet,
    });
  }, [run, reloadBadge]);

  const nameOf = (o: Order) => firstName(o.name) || o.code;

  /** Takes a payment back out, quietly: the Undo of an add. */
  const unadd = useCallback((before: Order, saved: Order) => {
    const added = addedPayment(before, saved);
    if (!added) return;
    void go(saved, recount(saved, saved.payments.filter((p) => p.id !== added.id)),
      () => deletePayment(added.id), '', () => undefined, true);
  }, [go]);

  /** Puts payments back, quietly: the Undo of a remove. */
  const putBack = useCallback((current: Order, payments: Payment[]) => {
    void go(current, recount(current, [...current.payments, ...payments]),
      () => restorePayments(current.id, payments), '', () => undefined, true);
  }, [go]);

  /** "Mark paid": one payment for whatever is left. */
  const payTheRest = useCallback((o: Order, how: HowPaid) => {
    const local = recount(o, [...o.payments, localPayment(restOf(o), how.method, how.note)]);
    const text = toasts.paidInFull(nameOf(o), methodText({ method: how.method, note: how.note ?? null }));
    return go(o, local, () => payRest(o.id, how), text, (saved) => unadd(o, saved));
  }, [go, unadd]);

  /** "Part payment": a typed amount. The order needs a total. */
  const addPart = useCallback((o: Order, amount: number, how: HowPaid) => {
    const local = recount(o, [...o.payments, localPayment(amount, how.method, how.note)]);
    const text = local.paid
      ? toasts.paidInFull(nameOf(o), methodText({ method: how.method, note: how.note ?? null }))
      : toasts.part(formatMoney(amount), nameOf(o), methodText({ method: how.method, note: how.note ?? null }),
        local.amount_due ? formatMoney(local.amount_due) : null);
    return go(o, local, () => addPayment(o.id, { amount, ...how }), text, (saved) => unadd(o, saved));
  }, [go, unadd]);

  /** The × on one payment. */
  const remove = useCallback((o: Order, p: Payment) => {
    const local = recount(o, o.payments.filter((q) => q.id !== p.id));
    const text = toasts.removed(p.amount != null ? formatMoney(p.amount) : null, methodText(p));
    return go(o, local, () => deletePayment(p.id), text, (saved) => putBack(saved, [p]));
  }, [go, putBack]);

  /** "Mark not paid" (the ⋯ menu, and P on a paid order): every payment goes, one Undo. */
  const markNotPaid = useCallback((o: Order) => {
    const text = toasts.notPaid(nameOf(o), o.payments.length);
    return go(o, recount(o, []), () => updateOrder(o.id, { paid: false }), text, (saved) => putBack(saved, o.payments));
  }, [go, putBack]);

  return { payTheRest, addPart, remove, markNotPaid };
};

export type PaymentActions = ReturnType<typeof usePayments>;
