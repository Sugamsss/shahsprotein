import React, { useEffect, useState } from 'react';
import { useDialogClose } from '../../components/ui/useDialog';
import { adminCopy } from '../../data/adminCopy';
import { AdminSheet } from '../AdminSheet';
import { getOrders } from '../api';
import { firstName, formatDay, formatPhone } from '../format';
import type { Order, OrderChanges } from '../types';
import { normalisePhone } from './model';
import { PasteButton } from './OrderParts';

const copy = adminCopy.order;

/** Closes through the sheet, so its exit plays, once `run` says the form is fine. */
const CloseAfter: React.FC<{ run: () => boolean; children: React.ReactNode }> = ({ run, children }) => {
  const close = useDialogClose();
  return <button type="button" className="adm-btn adm-btn--primary adm-btn--block" onClick={() => run() && close()}>{children}</button>;
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
      amount: amount.trim() && !/^\d+$/.test(amount.trim()) ? copy.totalError : undefined,
    };
    setErrors(next);
    if (next.phone || next.amount) return false;
    onConfirm(order, {
      status: 'confirmed',
      ...(digits && { phone: digits }),
      ...(amount.trim() && { amount: Number(amount.trim()) }),
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
        <form className="adm-stack" onSubmit={(e) => e.preventDefault()} noValidate>
          <p className="adm-muted">{[order.code, copy.packs(order.packs), order.pincode].filter(Boolean).join(' · ')}</p>
          <div className="adm-field">
            <label className="adm-field__label" htmlFor="adm-confirm-phone">{copy.phone}</label>
            <div className="adm-field__wrap">
              <input id="adm-confirm-phone" className="adm-input" inputMode="tel" autoComplete="off" value={phone}
                placeholder={copy.phonePlaceholder} aria-invalid={!!errors.phone || undefined}
                aria-describedby="adm-confirm-phone-note"
                onChange={(e) => setPhone(e.target.value)}
                onBlur={() => digits && setPhone(formatPhone(digits))} />
              <PasteButton onPaste={setPhone} />
            </div>
            <small id="adm-confirm-phone-note" className={errors.phone ? 'adm-field__status is-error' : 'adm-field__match'}>
              {errors.phone ?? match}
            </small>
          </div>
          <div className="adm-field">
            <label className="adm-field__label" htmlFor="adm-confirm-total">{copy.total}<span className="adm-opt">{copy.optional}</span></label>
            <div className="adm-field__wrap">
              <span className="adm-field__prefix" aria-hidden="true">₹</span>
              <input id="adm-confirm-total" className="adm-input" inputMode="numeric" autoComplete="off" value={amount}
                placeholder={copy.totalPlaceholder} aria-invalid={!!errors.amount || undefined}
                aria-describedby="adm-confirm-total-note"
                onChange={(e) => setAmount(e.target.value)} />
            </div>
            <small id="adm-confirm-total-note" className={errors.amount ? 'adm-field__status is-error' : 'adm-field__hint'}>
              {errors.amount ?? copy.totalHint}
            </small>
          </div>
        </form>
      )}
    </AdminSheet>
  );
};
