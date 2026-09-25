import React, { useEffect, useState } from 'react';
import { useDialogClose } from '../../components/ui/useDialog';
import { adminCopy } from '../../data/adminCopy';
import { AdminSheet } from '../AdminSheet';
import { Field } from '../parts';
import { getOrders } from '../api';
import { firstName, formatDay, formatPhone } from '../format';
import type { Order, OrderChanges } from '../types';
import { normalisePhone } from './model';

/** "1,200" or "₹ 1200" → "1200", as the order page's Total takes it. */
const totalDigits = (raw: string) => raw.replace(/[₹,\s]/g, '');
import { PasteButton } from './OrderParts';

const copy = adminCopy.order;

/** Closes through the sheet, so its exit plays, once `run` says the form is fine. */
const CloseAfter: React.FC<{ run: () => boolean; children: React.ReactNode }> = ({ run, children }) => {
  const close = useDialogClose();
  return <button type="button" className="adm-btn adm-btn--primary adm-btn--block" onClick={() => run() && close()}>{children}</button>;
};

/** The form: Enter (Go on a phone keyboard) in either field confirms, like the button. */
const EnterConfirms: React.FC<{ run: () => boolean; children: React.ReactNode }> = ({ run, children }) => {
  const close = useDialogClose();
  return (
    <form className="adm-stack" noValidate onSubmit={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' || !(e.target instanceof HTMLInputElement)) return;
        e.preventDefault();
        if (run()) close();
      }}>
      {children}
    </form>
  );
};

/**
 * Phone: Confirm on a New card (spec 2.7). The phone and the total are both
 * optional; they're saved with the confirm, and Undo only puts the status back.
 */
export const ConfirmSheet: React.FC<{
  order: Order | null;
  onClose: () => void;
  onConfirm: (order: Order, changes: OrderChanges) => void;
}> = ({ order, onClose, onConfirm }) => {
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [errors, setErrors] = useState<{ phone?: string; amount?: string }>({});
  const [match, setMatch] = useState('');

  useEffect(() => {
    setPhone(order?.phone ? formatPhone(order.phone) : '');
    setAmount(order?.amount != null ? String(order.amount) : '');
    setErrors({});
  }, [order]);

  // "Same number as Neha's order on Wed 23 Sep", 300ms after typing stops.
  const digits = normalisePhone(phone);
  useEffect(() => {
    setMatch('');
    if (!digits || !order) return;
    let live = true;
    const timer = setTimeout(() => {
      getOrders({ view: 'all', phone: digits, limit: 1 }).then(({ orders: [hit] }) => {
        if (live && hit && hit.id !== order.id) setMatch(copy.matchHint(firstName(hit.name) || hit.code, formatDay(hit.created_at)));
      }, () => {});
    }, 300);
    return () => { live = false; clearTimeout(timer); };
  }, [digits, order]);

  const confirm = (): boolean => {
    if (!order) return false;
    const next = {
      phone: phone.trim() && !digits ? copy.phoneError : undefined,
      amount: amount.trim() && !/^\d+$/.test(totalDigits(amount)) ? copy.totalError : undefined,
    };
    setErrors(next);
    if (next.phone || next.amount) return false;
    onConfirm(order, {
      status: 'confirmed',
      ...(digits && { phone: digits }),
      ...(amount.trim() && { amount: Number(totalDigits(amount)) }),
    });
    return true;
  };

  const name = order ? firstName(order.name) || order.code : '';
  return (
    <AdminSheet
      isOpen={!!order}
      onClose={onClose}
      closeLabel={adminCopy.close}
      title={copy.confirmTitle(name)}
      bar={
        <div className="adm-stack adm-grow">
          <CloseAfter run={confirm}>{adminCopy.orders.next.confirm[1]}</CloseAfter>
          <small className="adm-muted adm-center">{copy.confirmNote}</small>
        </div>
      }
    >
      {order && (
        <EnterConfirms run={confirm}>
          <p className="adm-muted">{[order.code, copy.packs(order.packs), order.pincode].filter(Boolean).join(' · ')}</p>
          <Field label={copy.phone} error={errors.phone} hint={match || undefined} action={<PasteButton onPaste={setPhone} />}>
            <input className="adm-input" inputMode="tel" autoComplete="off" value={phone} placeholder={copy.phonePlaceholder}
              onChange={(e) => { setPhone(e.target.value); setErrors((x) => ({ ...x, phone: undefined })); }} onBlur={() => digits && setPhone(formatPhone(digits))} />
          </Field>
          <Field label={copy.total} optional={copy.optional} prefix="₹" error={errors.amount} hint={copy.totalHint}>
            <input className="adm-input" inputMode="numeric" enterKeyHint="go" autoComplete="off" value={amount} placeholder={copy.totalPlaceholder}
              onChange={(e) => { setAmount(e.target.value); setErrors((x) => ({ ...x, amount: undefined })); }} />
          </Field>
        </EnterConfirms>
      )}
    </AdminSheet>
  );
};
