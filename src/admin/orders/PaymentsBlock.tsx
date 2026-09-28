import React, { useEffect, useRef, useState } from 'react';
import { Check, Plus, X } from 'lucide-react';
import { adminCopy } from '../../data/adminCopy';
import { formatDay, formatMoney } from '../format';
import type { Order, Payment } from '../types';
import { laneOf, paidByText } from './model';
import { isSaved, methodText, paidShare } from './payments';
import { PartPaymentSheet } from './PartPaymentSheet';
import type { PaymentActions } from './usePayments';

// The order's money (design B): what's in and what's due, a bar, each payment
// as a receipt row, and the ways to add one. Styles: orders.css (.adm-money).

const copy = adminCopy.payments;

/** The top line: the state on the left, the sum on the right. */
const summaryOf = (o: Order, cancelled: boolean): { left: React.ReactNode; right: string | null } => {
  const total = o.amount;
  if (o.payment_state === 'paid') {
    const extra = o.amount_extra ?? 0;
    const tick = <Check size={16} strokeWidth={2.5} aria-hidden="true" />;
    if (extra > 0) {
      return {
        left: <><b className="is-paid">{tick}{copy.paidShort}</b><small>{copy.extra(formatMoney(extra))}</small></>,
        right: copy.paidOfTotal(formatMoney(o.amount_paid), formatMoney(total!)),
      };
    }
    return { left: <b className="is-paid">{tick}{copy.paidInFull}</b>, right: total != null ? formatMoney(total) : null };
  }
  // Nothing is due on a cancelled order, so it only says what came in.
  const due = cancelled || o.amount_due == null ? null : copy.due(formatMoney(o.amount_due));
  if (o.payment_state === 'part_paid' && total != null) {
    return { left: <><b>{copy.paid(formatMoney(o.amount_paid))}</b><small>{copy.ofTotal(formatMoney(total))}</small></>, right: due };
  }
  return { left: <b>{copy.notPaidYet}</b>, right: due };
};

/**
 * Under the status card's hint. Mark paid (pay the rest) goes through the
 * caller's PaidSheet; a part payment has its own sheet here. Every change goes
 * through usePayments, with Undo. Key it by order id.
 */
export const PaymentsBlock: React.FC<{
  order: Order;
  payments: PaymentActions;
  /** Opens "How did they pay?" for whatever is left. */
  onPayRest: (order: Order) => void;
}> = ({ order: o, payments, onPayRest }) => {
  const [parting, setParting] = useState<Order | null>(null);
  const block = useRef<HTMLDivElement>(null);

  // A removed row takes its × with it, and a part payment that pays in full takes
  // its button. Focus would drop to the page (and the popup's keys with it), so
  // once the popup's own focus return has had its go, it lands on the block.
  const [refocus, setRefocus] = useState(0);
  useEffect(() => {
    if (!refocus) return;
    const id = window.setTimeout(() => {
      const at = document.activeElement;
      if (!at || at === document.body || !at.isConnected) block.current?.focus();
    }, 300);
    return () => window.clearTimeout(id);
  }, [refocus]);

  const cancelled = o.status === 'cancelled';
  // A cancelled order only shows money that came in, so it can be taken out.
  if (cancelled && !o.payments.length) return null;

  const total = o.amount;
  const paid = o.payment_state === 'paid';
  // Paid in full in one go: one quiet line, no rows. Mark not paid is in the ⋯ menu.
  const once = paid && o.payments.length === 1 && !(o.amount_extra ?? 0);
  const canAdd = !paid && !cancelled;
  // Delivered and not paid in full: the pinned button already says Mark paid.
  const pinnedPays = laneOf(o) === 'collect';
  const { left, right } = summaryOf(o, cancelled);

  const remove = (p: Payment) => {
    setRefocus((n) => n + 1);
    void payments.remove(o, p);
  };

  return (
    <div className="adm-money" ref={block} tabIndex={-1}>
      <div className="adm-money__top">
        <span className="adm-money__left">{left}</span>
        {right && <span className="adm-money__right">{right}</span>}
      </div>
      {/* The words above say it all, so the bar is only a picture. */}
      {total != null && (
        <span className="adm-money__bar" aria-hidden="true">
          <i style={{ '--p': paidShare(o) } as React.CSSProperties} />
        </span>
      )}
      {canAdd && total == null && <p className="adm-money__meta">{copy.noTotal}</p>}
      {once && o.paid_at && <p className="adm-money__meta">{copy.paidOn(formatDay(o.paid_at), paidByText(o))}</p>}
      {!once && o.payments.length > 0 && (
        <ul className="adm-money__rows" aria-label={copy.listLabel}>
          {o.payments.map((p) => {
            const how = methodText(p);
            const amount = p.amount != null ? formatMoney(p.amount) : '';
            return (
              <li key={p.id}>
                <span>{copy.row(how, formatDay(p.paid_at))}</span>
                <b>{amount}</b>
                {/* Not saved yet: there's nothing to remove until the server has it. */}
                <button type="button" className="adm-money__del" aria-label={copy.removeLabel(amount, how)}
                  disabled={!isSaved(p)} onClick={() => remove(p)}>
                  <X size={18} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {canAdd && (total != null || !pinnedPays) && (
        <div className="adm-money__acts">
          {total != null && (
            <button type="button" className="adm-btn adm-btn--quiet adm-btn--sm" onClick={() => setParting(o)}>
              <Plus size={18} aria-hidden="true" />{copy.partPayment}
            </button>
          )}
          {!pinnedPays && (
            <button type="button" className="adm-btn adm-btn--tonal adm-btn--sm" onClick={() => onPayRest(o)}>
              <Check size={18} aria-hidden="true" />{copy.markPaid}
            </button>
          )}
        </div>
      )}
      <PartPaymentSheet order={parting} onClose={() => setParting(null)}
        onPick={(order, amount, how) => { setRefocus((n) => n + 1); void payments.addPart(order, amount, how); }} />
    </div>
  );
};
