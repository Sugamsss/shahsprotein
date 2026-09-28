import React, { useRef, useState } from 'react';
import { useDialogClose } from '../../components/ui/useDialog';
import { adminCopy } from '../../data/adminCopy';
import { AdminSheet } from '../AdminSheet';
import { firstName, formatMoney } from '../format';
import { Field } from '../parts';
import type { Order } from '../types';
import { howOf, PaidChoices } from './PaidMethod';
import { parseAmount, quickPicks } from './payments';
import type { HowPaid } from './usePayments';

// "Part payment from Riya": how much came in, then how. Styles: orders.css (.adm-partsheet).

const copy = adminCopy.payments;

/** What the typed amount leaves: "₹500 will still be due.", "That's all of it." or over. */
const hintFor = (amount: number | null, due: number) => {
  if (amount == null) return undefined;
  if (amount < due) return copy.stillDue(formatMoney(due - amount));
  return amount === due ? copy.allOfIt : copy.over(formatMoney(amount - due));
};

/** Inside the sheet, so a pick closes it the way × does and the exit plays. Key it by order id. */
const PartBody: React.FC<{
  order: Order;
  fieldRef: React.RefObject<HTMLInputElement>;
  onPick: (amount: number, how: HowPaid) => void;
}> = ({ order: o, fieldRef, onPick }) => {
  const close = useDialogClose();
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const upi = useRef<HTMLButtonElement>(null);
  const amount = parseAmount(text);
  const picks = quickPicks(o);

  /** Shows why the amount can't be saved and puts the cursor back in it. */
  const refuse = () => {
    setError(text.trim() ? copy.amountWrong : copy.amountMissing);
    fieldRef.current?.focus();
  };
  const how = amount != null ? copy.howPaidAmount(formatMoney(amount)) : adminCopy.paidBy.question;

  return (
    <div className="adm-stack adm-partsheet">
      <p className="adm-muted">
        {o.amount_paid > 0
          ? copy.partSubSome(o.code, formatMoney(o.amount_paid), formatMoney(o.amount ?? 0))
          : copy.partSubNone(o.code, formatMoney(o.amount ?? 0))}
      </p>
      <Field label={copy.amountLabel} prefix="₹" error={error || null} hint={hintFor(amount, o.amount_due ?? 0)}>
        <input ref={fieldRef} className="adm-input" inputMode="numeric" autoComplete="off" enterKeyHint="next"
          value={text}
          onChange={(e) => { setText(e.target.value); setError(''); }}
          // Enter moves on to how they paid, the way the phone keyboard's Next does.
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            if (amount == null) refuse();
            else upi.current?.focus();
          }} />
      </Field>
      {picks.length > 0 && (
        <div className="adm-quick" role="group" aria-label={copy.pickLabel}>
          {picks.map((p) => (
            <button key={p.label} type="button" aria-pressed={amount === p.amount}
              onClick={() => { setText(String(p.amount)); setError(''); }}>
              {copy.pick(p.label, formatMoney(p.amount))}
            </button>
          ))}
        </div>
      )}
      {/* The group below carries the same words as its name, so screen readers hear them once. */}
      <p className="adm-partsheet__how" aria-hidden="true">{how}</p>
      <PaidChoices firstRef={upi} label={how} submitLabel={copy.save}
        onPick={(changes) => {
          if (amount == null) return refuse();
          onPick(amount, howOf(changes));
          close();
        }} />
    </div>
  );
};

/**
 * A part payment: a typed amount (or ¾ ½ ¼ of the total), then UPI, Cash, Bank or
 * Other, which saves. Only for an order with a total. The caller records it with
 * usePayments().addPart.
 */
export const PartPaymentSheet: React.FC<{
  order: Order | null;
  onClose: () => void;
  onPick: (order: Order, amount: number, how: HowPaid) => void;
}> = ({ order, onClose, onPick }) => {
  // Focus starts in the amount, so the phone keyboard is already up.
  const field = useRef<HTMLInputElement>(null);
  const name = order ? firstName(order.name) || order.code : '';
  return (
    <AdminSheet isOpen={!!order} onClose={onClose} closeLabel={adminCopy.close} initialFocus={field}
      title={order ? copy.partTitle(name) : ''}>
      {order && <PartBody key={order.id} order={order} fieldRef={field} onPick={(amount, how) => onPick(order, amount, how)} />}
    </AdminSheet>
  );
};
