import React, { useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Check, ClipboardPaste, Copy, Globe, IndianRupee, MessageCircle, MoreHorizontal, Pencil, Phone, Ticket } from 'lucide-react';
import { adminCopy } from '../../data/adminCopy';
import { AdminSheet } from '../AdminSheet';
import { deleteOrder, toAdminError, updateOrder } from '../api';
import { useAdminMe } from '../auth';
import { firstName, formatAgo, formatDay, formatMoney, formatPhone, formatTime } from '../format';
import { AdminLink } from '../router';
import { Field } from '../parts';
import { Switch } from '../Switch';
import { useToast } from '../toast';
import type { Order, OrderChanges, OrderDetail, OrderStatus } from '../types';
import { Code, Thumb, Via } from './OrderCard';
import { itemsText, nextOf, normalisePhone, paidByText, productName, sortLines } from './model';
import { PaidChoices } from './PaidMethod';

// The pieces of one order (spec 2.6), shared by the phone page and the laptop popup.

const copy = adminCopy.order;
type Change = (order: Order, changes: OrderChanges) => void;

/** Code and came-via, the name, when and where. Spans only: the page puts it in an h1, the popup in its h2. */
export const OrderHead: React.FC<{ order: Order; nameRef?: React.Ref<HTMLSpanElement> }> = ({ order: o, nameRef }) => (
  <>
    <span className="adm-od-no">
      <Code code={o.code} />
      {o.source === 'site'
        ? <span className="adm-od-via"><Globe size={14} aria-hidden="true" />{adminCopy.orders.via.site}</span>
        : <Via source={o.source} />}
    </span>
    <span className="adm-od-name" ref={nameRef} tabIndex={-1}>{o.name ?? (o.phone && formatPhone(o.phone))}</span>
    <span className="adm-od-meta">
      {formatDay(o.created_at)}, {formatTime(o.created_at)}{o.pincode && ` · ${o.pincode}`}
    </span>
  </>
);

/** The "2nd order" chip and the suffix note, under the head. */
export const OrderNotes: React.FC<{ order: Order }> = ({ order: o }) => {
  const nth = o.customer && o.customer.order_number > 1;
  if (!nth && o.code === o.message_code) return null;
  return (
    <p className="adm-od-notes">
      {nth && <span className="adm-chip adm-chip--strong">{adminCopy.orders.nthOrder(o.customer!.order_number)}</span>}
      {o.code !== o.message_code && <span>{copy.messageSays(o.message_code)}</span>}
    </p>
  );
};

const STEPS: Exclude<OrderStatus, 'cancelled'>[] = ['new', 'confirmed', 'sent', 'delivered'];

const hintOf = (o: Order) => {
  if (o.stale) return copy.staleHint(formatAgo(o.created_at));
  if (o.status === 'delivered') return o.paid ? copy.hints.done : copy.hints.delivered;
  return copy.hints[o.status as keyof typeof copy.hints];
};

/** What the P key does in the popup: shows "How did they pay?" with focus on UPI. */
export interface PaidRowHandle { choose: () => void }

/**
 * Steps, the hint under them, and the Paid switch. Switching Paid on shows how
 * they paid and saves nothing until one is picked; off (or Esc) hides it again.
 * Key it by order id, so the choices never carry over to another order.
 */
export const StatusCard: React.FC<{ order: Order; change: Change; paidRef?: React.Ref<PaidRowHandle> }> = ({ order: o, change, paidRef }) => {
  const [choosing, setChoosing] = useState<false | 'shown' | 'focus'>(false);
  const card = useRef<HTMLElement>(null);
  useImperativeHandle(paidRef, () => ({ choose: () => setChoosing('focus') }), []);
  const open = !!choosing && !o.paid;
  const hide = () => {
    setChoosing(false);
    card.current?.querySelector<HTMLElement>('.adm-paidrow .adm-switch')?.focus();
  };
  const cancelled = o.status === 'cancelled';
  const at = STEPS.indexOf(o.status as (typeof STEPS)[number]);
  const lastChange = o.status_changed_at;
  return (
    <section className="adm-card adm-od-status" ref={card}>
      <div className={`adm-steps${cancelled ? ' is-off' : ''}`} data-at={Math.max(at, 0)} role="group" aria-label={copy.stepsLabel}>
        <span className="adm-steps__fill" aria-hidden="true" />
        {STEPS.map((s, i) => (
          <button key={s} type="button" disabled={cancelled}
            className={`adm-step${i < at ? ' is-done' : ''}${i === at ? ' is-now' : ''}`}
            aria-current={i === at ? 'step' : undefined}
            onClick={() => i !== at && change(o, { status: s })}>
            <span className="adm-step__dot">{i < at && <Check size={12} aria-hidden="true" />}</span>
            {copy.steps[s]}
          </button>
        ))}
      </div>
      {cancelled ? (
        <p className="adm-steps__hint adm-od-cancelled">
          {copy.cancelledOn(formatDay(lastChange))}
          <button type="button" className="adm-btn adm-btn--quiet adm-btn--xs" onClick={() => change(o, { status: 'new' })}>{copy.bringBack}</button>
        </p>
      ) : (
        <p className="adm-steps__hint">{hintOf(o)}</p>
      )}
      <div className="adm-paidrow">
        <span className={`adm-paidrow__icon${o.paid ? ' is-paid' : ''}`} aria-hidden="true"><IndianRupee size={18} /></span>
        <span>
          <b>{o.paid ? adminCopy.orders.paid : copy.notPaidYet}</b>
          <small>
            {o.paid && o.paid_at ? copy.paidOn(formatDay(o.paid_at), paidByText(o))
              : open ? adminCopy.paidBy.question : o.status === 'new' ? copy.payOnDelivery : copy.turnOnWhenPaid}
          </small>
        </span>
        <Switch checked={o.paid || open} label={adminCopy.orders.paid}
          onChange={(on) => (o.paid ? change(o, { paid: false }) : setChoosing(on && 'shown'))} />
      </div>
      {open && (
        <div className="adm-paychoose"
          onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); hide(); } }}>
          <PaidChoices focusFirst={choosing === 'focus'} onPick={(changes) => { setChoosing(false); change(o, changes); }} />
        </div>
      )}
    </section>
  );
};

export const ItemsCard: React.FC<{ order: Order }> = ({ order: o }) => (
  <section className="adm-card">
    <div className="adm-card__h">
      <h2>{copy.packs(o.packs)}</h2>
      <AdminLink className="adm-text-btn" to={`/admin/orders/${o.code}/edit`}><Pencil size={15} aria-hidden="true" />{copy.edit}</AdminLink>
    </div>
    <ul className="adm-items">
      {sortLines(o.lines).map((l) => (
        <li key={l.product_id + l.size}>
          <Thumb id={l.product_id} />
          <span><b className="adm-pname">{productName(l.product_id)}</b><small>{l.size}</small></span>
          <span className="adm-items__q">× {l.quantity}</span>
        </li>
      ))}
    </ul>
    {o.coupon && (
      <p className="adm-od-coupon">
        <Ticket size={18} aria-hidden="true" /><span><b>{o.coupon.code}</b>{o.coupon.description && ` · ${o.coupon.description}`}{!o.coupon.valid && ` ${copy.couponInvalid}`}</span>
      </p>
    )}
  </section>
);

const canPaste = typeof navigator !== 'undefined' && !!navigator.clipboard?.readText;

export const PasteButton: React.FC<{ onPaste: (text: string) => void }> = ({ onPaste }) =>
  canPaste ? (
    <button type="button" className="adm-btn adm-btn--tonal adm-btn--xs"
      onClick={() => navigator.clipboard.readText().then(onPaste, () => {})}>
      <ClipboardPaste size={16} aria-hidden="true" />{copy.paste}
    </button>
  ) : null;

/** Copies the saved phone, for pasting into WhatsApp or the dialler. */
const CopyButton: React.FC<{ text: string }> = ({ text }) => {
  const toast = useToast();
  const copyIt = () => navigator.clipboard.writeText(text).then(() => toast.show({ text: adminCopy.orders.toasts.copied }), () => toast.error());
  return (
    <button type="button" className="adm-btn adm-btn--tonal adm-btn--xs" onClick={copyIt}>
      <Copy size={16} aria-hidden="true" />{copy.copy}
    </button>
  );
};

type FieldKey = 'phone' | 'amount' | 'note';

/** Turns what was typed into the value to save, or an error to show. */
const parseField = (key: FieldKey, raw: string): { value: string | number | null } | { error: string } => {
  const text = raw.trim();
  if (!text) return { value: null };
  if (key === 'phone') {
    const phone = normalisePhone(text);
    return phone ? { value: phone } : { error: copy.phoneError };
  }
  if (key === 'amount') return /^\d+$/.test(text.replace(/[₹,\s]/g, '')) ? { value: Number(text.replace(/\D/g, '')) } : { error: copy.totalError };
  return { value: text };
};

const shownValue = (o: Order, key: FieldKey) =>
  key === 'phone' ? (o.phone ? formatPhone(o.phone) : '') : String(o[key] ?? '');

/** A detail field that saves 600ms after typing stops, and on leaving it. Key it by order id. */
const AutoField: React.FC<{
  order: Order; field: FieldKey; onSaved: (o: Order) => void; inputRef?: React.Ref<HTMLInputElement>;
}> = ({ order, field, onSaved, inputRef }) => {
  const [value, setValue] = useState(() => shownValue(order, field));
  const [status, setStatus] = useState('');
  const latest = useRef(order);
  latest.current = order;
  const timer = useRef<number>();
  /** Typed but not saved yet. */
  const pending = useRef<string | null>(null);
  const input = useRef<HTMLElement | null>(null);

  // A change from elsewhere ("Use 98231…", Undo) shows unless you're typing here.
  const saved = order[field];
  useEffect(() => {
    if (document.activeElement !== input.current) setValue(shownValue(latest.current, field));
  }, [saved, field]);

  const save = async (raw: string) => {
    window.clearTimeout(timer.current);
    pending.current = null;
    const parsed = parseField(field, raw);
    if ('error' in parsed) return setStatus(parsed.error);
    const current = latest.current[field];
    if (parsed.value === (current ?? null)) return setStatus('');
    try {
      onSaved(await updateOrder(latest.current.id, { [field]: parsed.value }));
      setStatus(copy.saved);
    } catch (err) {
      const e = toAdminError(err);
      setStatus(e.kind === 'message' ? e.message : adminCopy.toast.failed);
    }
  };
  // Leaving (Esc, ← →, closing) saves what was typed rather than dropping it.
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => () => {
    window.clearTimeout(timer.current);
    if (pending.current !== null) void saveRef.current(pending.current);
  }, []);

  const onChange = (next: string) => {
    setValue(next);
    setStatus('');
    window.clearTimeout(timer.current);
    pending.current = next;
    timer.current = window.setTimeout(() => void save(next), 600);
  };
  const isError = status !== '' && status !== copy.saved;
  const common = {
    value, className: 'adm-input',
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value),
    onBlur: () => void save(value),
    onFocus: (e: React.FocusEvent<HTMLElement>) => { input.current = e.currentTarget; },
  };

  return (
    <Field
      label={{ phone: copy.phone, amount: copy.total, note: copy.note }[field]}
      optional={field === 'phone' ? undefined : copy.optional}
      prefix={field === 'amount' ? '₹' : undefined}
      error={isError ? status : null}
      hint={status || (field === 'amount' ? copy.totalHint : undefined)}
      action={field === 'phone' && (order.phone
        ? <CopyButton text={formatPhone(order.phone)} />
        : <PasteButton onPaste={(text) => { setValue(text); void save(text); }} />)}
    >
      {field === 'note'
        ? <textarea {...common} rows={3} placeholder={copy.notePlaceholder} />
        : <input {...common} ref={inputRef} inputMode={field === 'phone' ? 'tel' : 'numeric'} autoComplete="off"
            placeholder={field === 'phone' ? copy.phonePlaceholder : copy.totalPlaceholder} />}
    </Field>
  );
};

/** "Reply on WhatsApp": their chat, with a first line ready from whoever is signed in. */
const replyLink = (o: Order, from: string | null) => {
  const text = copy.reply({
    name: firstName(o.name),
    from: firstName(from),
    code: o.message_code,
    packs: copy.packs(o.packs),
    total: o.amount != null ? formatMoney(o.amount) : null,
  });
  return `https://wa.me/${o.phone}?text=${encodeURIComponent(text)}`;
};

/** Phone, total and note save as you type; then where it goes and how to reach them. */
export const DetailsCard: React.FC<{
  order: Order & Partial<Pick<OrderDetail, 'phone_suggestion'>>;
  onSaved: (o: Order) => void;
  phoneRef?: React.Ref<HTMLInputElement>;
}> = ({ order: o, onSaved, phoneRef }) => {
  const me = useAdminMe();
  const suggestion = !o.phone && o.phone_suggestion;
  const [busy, setBusy] = useState(false);
  const useSuggestion = async () => {
    if (!suggestion) return;
    setBusy(true);
    try { onSaved(await updateOrder(o.id, { phone: suggestion.phone })); } catch { /* the field stays empty */ }
    setBusy(false);
  };
  return (
    <section className="adm-card adm-stack" key={o.id}>
      <AutoField key={`p${o.id}`} order={o} field="phone" onSaved={onSaved} inputRef={phoneRef} />
      {suggestion && (
        <button type="button" className="adm-text-btn" disabled={busy} onClick={useSuggestion}>
          {copy.useSuggestion(formatPhone(suggestion.phone), formatDay(suggestion.created_at))}
        </button>
      )}
      <AutoField key={`a${o.id}`} order={o} field="amount" onSaved={onSaved} />
      <AutoField key={`n${o.id}`} order={o} field="note" onSaved={onSaved} />
      <p className="adm-od-fact"><span>{copy.deliverTo}</span>{o.pincode ?? copy.deliverToSatara}</p>
      {o.phone && (
        <div className="adm-od-reach">
          <a className="adm-btn adm-btn--quiet adm-btn--sm" href={replyLink(o, me.display_name)} target="_blank" rel="noreferrer">
            <MessageCircle size={18} aria-hidden="true" />{copy.whatsapp}
          </a>
          <a className="adm-btn adm-btn--quiet adm-btn--sm" href={`tel:+${o.phone}`}><Phone size={18} aria-hidden="true" />{copy.call}</a>
        </div>
      )}
    </section>
  );
};

export const History: React.FC<{ history?: OrderDetail['history'] }> = ({ history }) =>
  history?.length ? (
    <details className="adm-card adm-od-history">
      <summary>{copy.history}</summary>
      <ol>
        {history.map((h, i) => (
          <li key={i}>
            <b>{copy.events[h.event]}</b> · {formatDay(h.at)}, {formatTime(h.at)}{h.by_name && ` · ${firstName(h.by_name)}`}
          </li>
        ))}
      </ol>
    </details>
  ) : null;

/**
 * The pinned button: the order's next step, or "All done." A stale order gets
 * "They messaged, confirm it", with Still waiting next to it.
 */
export const PrimaryAction: React.FC<{ order: Order; change: Change; onNext?: () => void }> = ({ order, change, onNext }) => {
  const next = nextOf(order);
  if (!next) return <span className="adm-od-alldone">{adminCopy.orders.allDone}</span>;
  const go = (
    <button type="button" className="adm-btn adm-btn--primary adm-od-go" onClick={onNext ?? (() => change(order, next.changes))}>
      <Check size={20} aria-hidden="true" />{next.labels[1]}
    </button>
  );
  if (next.lane !== 'stale') return go;
  return (
    <span className="adm-od-pair">
      <button type="button" className="adm-btn adm-btn--tonal" onClick={() => change(order, { kept: true })}>{adminCopy.orders.stillWaiting}</button>
      {go}
    </span>
  );
};

/** ⋯: edit, copy, cancel, delete (with its own confirm). */
export const OrderMenu: React.FC<{ order: Order; change: Change; onDeleted: () => void; up?: boolean }> = ({ order: o, change, onDeleted, up }) => {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('focusin', away);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('focusin', away); };
  }, [open]);

  const copyDetails = async () => {
    setOpen(false);
    const text = [o.code, o.name, itemsText(o), o.pincode, o.phone && formatPhone(o.phone)].filter(Boolean).join(' · ');
    try { await navigator.clipboard.writeText(text); toast.show({ text: adminCopy.orders.toasts.copied }); } catch { toast.error(); }
  };
  const remove = async () => {
    setBusy(true);
    try {
      await deleteOrder(o.id);
      setConfirming(false);
      toast.show({ text: adminCopy.orders.toasts.deleted });
      onDeleted();
    } catch { toast.error(() => void remove()); }
    setBusy(false);
  };

  return (
    <div className={`adm-omenu${up ? ' adm-omenu--up' : ''}`} ref={wrap}>
      <button type="button" className="adm-btn adm-btn--quiet adm-btn--sm" aria-expanded={open} aria-label={copy.moreLabel}
        onClick={() => setOpen((v) => !v)}>
        <MoreHorizontal size={20} aria-hidden="true" />{up && copy.more}
      </button>
      <div className="adm-menu" hidden={!open}>
        <AdminLink className="adm-menu__item" to={`/admin/orders/${o.code}/edit`}><Pencil size={18} aria-hidden="true" />{copy.menu.edit}</AdminLink>
        <button type="button" className="adm-menu__item" onClick={copyDetails}><Copy size={18} aria-hidden="true" />{copy.menu.copy}</button>
        {o.status !== 'cancelled' && (
          <button type="button" className="adm-menu__item" onClick={() => { setOpen(false); change(o, { status: 'cancelled' }); }}>{copy.menu.cancel}</button>
        )}
        <button type="button" className="adm-menu__item is-danger" onClick={() => { setOpen(false); setConfirming(true); }}>{copy.menu.delete}</button>
      </div>
      <AdminSheet isOpen={confirming} onClose={() => setConfirming(false)} title={copy.deleteTitle} closeLabel={adminCopy.close}
        bar={<div className="adm-row">
          <button type="button" className="adm-btn adm-btn--quiet" onClick={() => setConfirming(false)}>{copy.keep}</button>
          <button type="button" className="adm-btn adm-btn--danger" disabled={busy} onClick={remove}>{copy.menu.delete}</button>
        </div>}>
        <p>{copy.deleteBody}</p>
      </AdminSheet>
    </div>
  );
};
