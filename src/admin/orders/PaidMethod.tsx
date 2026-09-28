import React, { useEffect, useRef, useState } from 'react';
import { useDialogClose } from '../../components/ui/useDialog';
import { adminCopy } from '../../data/adminCopy';
import { AdminSheet } from '../AdminSheet';
import { firstName, formatMoney } from '../format';
import { Field } from '../parts';
import type { Order, OrderChanges, PaidMethod } from '../types';
import type { HowPaid } from './usePayments';

// How an order was paid, picked as it's marked paid. Styles: orders.css (.adm-paypick).

const copy = adminCopy.paidBy;
/** UPI first: most people pay that way. Nothing is ever picked for them. */
export const PAID_METHODS: readonly PaidMethod[] = ['upi', 'cash', 'bank', 'other'];

/** The keys that mark an order paid this way. */
export const paidWith = (method: PaidMethod, note?: string): OrderChanges =>
  ({ paid: true, paid_method: method, ...(method === 'other' && { paid_note: note }) });

/**
 * UPI, Cash, Bank, Other as buttons that commit on tap (not radios, so arrow keys never
 * save by accident). UPI, Cash and Bank call `onPick` at once; Other opens a one-line
 * note with Mark paid, and Enter there does the same.
 */
export const PaidChoices: React.FC<{
  onPick: (changes: OrderChanges) => void;
  /** UPI's button, e.g. for a sheet's initialFocus. */
  firstRef?: React.RefObject<HTMLButtonElement>;
  label?: string;
  /** Other's button, "Mark paid" unless this pick does something else (a part payment's "Save"). */
  submitLabel?: string;
}> = ({ onPick, firstRef, label = copy.question, submitLabel = copy.markPaid }) => {
  const [other, setOther] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const ownFirst = useRef<HTMLButtonElement>(null);
  const first = firstRef ?? ownFirst;
  const noteRef = useRef<HTMLInputElement>(null);

  // They tapped Other to type, so the note takes focus (and the phone keyboard comes up).
  useEffect(() => { if (other) noteRef.current?.focus(); }, [other]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const text = note.trim();
    if (!text) {
      setError(copy.noteMissing);
      noteRef.current?.focus();
      return;
    }
    onPick(paidWith('other', text));
  };

  return (
    <div className="adm-paypick">
      <div className="adm-segmented adm-segmented--buttons" role="group" aria-label={label}>
        {PAID_METHODS.map((m) => (
          <button key={m} type="button" ref={m === 'upi' ? first : undefined}
            className={m === 'other' && other ? 'is-on' : undefined}
            aria-expanded={m === 'other' ? other : undefined}
            onClick={() => (m === 'other' ? setOther((v) => !v) : onPick(paidWith(m)))}>
            {copy.methods[m]}
          </button>
        ))}
      </div>
      {other && (
        <form className="adm-paypick__other" noValidate onSubmit={submit}>
          <Field label={copy.noteLabel} error={error || null}
            action={<button type="submit" className="adm-btn adm-btn--primary adm-btn--sm">{submitLabel}</button>}>
            <input ref={noteRef} className="adm-input" maxLength={60} autoComplete="off" enterKeyHint="done"
              value={note} placeholder={copy.notePlaceholder}
              onChange={(e) => { setNote(e.target.value); setError(''); }} />
          </Field>
        </form>
      )}
    </div>
  );
};

/** A picker's keys as the payment RPCs take them. */
export const howOf = (changes: OrderChanges): HowPaid =>
  ({ method: changes.paid_method as PaidMethod, ...(changes.paid_note && { note: changes.paid_note }) });

/** Inside the sheet, so a pick closes it the way × does and the exit plays. */
const PickAndClose: React.FC<{ onPick: (how: HowPaid) => void; firstRef: React.RefObject<HTMLButtonElement> }> = ({ onPick, firstRef }) => {
  const close = useDialogClose();
  return <PaidChoices firstRef={firstRef} onPick={(changes) => { onPick(howOf(changes)); close(); }} />;
};

/**
 * "Mark paid" = pay the rest: from a card, Done, the pinned button, P, or the
 * order's own Mark paid. "How did Neha pay?", or on a part-paid order "How did
 * Riya pay the ₹250?". The caller records it with usePayments().payTheRest.
 * Marking not paid never comes here; it's one tap with Undo.
 */
export const PaidSheet: React.FC<{
  order: Order | null;
  onClose: () => void;
  onPick: (order: Order, how: HowPaid) => void;
}> = ({ order, onClose, onPick }) => {
  // Focus starts on UPI: a tap or Enter there saves, so it's one step from the card.
  const upi = useRef<HTMLButtonElement>(null);
  const name = order ? firstName(order.name) || order.code : '';
  const part = order?.payment_state === 'part_paid' && order.amount != null && order.amount_due != null;
  return (
    <AdminSheet isOpen={!!order} onClose={onClose} closeLabel={adminCopy.close} initialFocus={upi}
      title={!order ? '' : part ? adminCopy.payments.restTitle(name, formatMoney(order.amount_due!)) : copy.sheetTitle(name)}>
      {order && (
        <div className="adm-stack">
          <p className="adm-muted">
            {part ? adminCopy.payments.restSub(order.code, formatMoney(order.amount_paid), formatMoney(order.amount!))
              : [order.code, order.amount != null && formatMoney(order.amount)].filter(Boolean).join(' · ')}
          </p>
          <PickAndClose firstRef={upi} onPick={(how) => onPick(order, how)} />
        </div>
      )}
    </AdminSheet>
  );
};
