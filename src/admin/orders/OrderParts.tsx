import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, ClipboardPaste, Copy, MessageCircle, MoreHorizontal, Pencil, Phone, Ticket } from 'lucide-react';
import { adminCopy } from '../../data/adminCopy';
import { AdminSheet } from '../AdminSheet';
import { deleteOrder, toAdminError, updateOrder } from '../api';
import { useAdminMe } from '../auth';
import { firstName, formatDay, formatMoney, formatPhone, formatTime } from '../format';
import { AdminLink } from '../router';
import { Field } from '../parts';
import { Switch } from '../Switch';
import { useToast } from '../toast';
import { useUnsavedWork } from '../unsavedWork';
import type { Order, OrderChanges, OrderDetail, OrderStatus } from '../types';
import { Code, FromWebsite, Thumb, Via } from './OrderCard';
import { MOVE_TO_PACKING, itemsText, orderOnly, lineState, madeOnDay, nextOf, normalisePhone, packsText, productName, sizeText, sortLines } from './model';
import { PaymentsBlock } from './PaymentsBlock';
import { usePriceBook } from './usePriceBook';
import type { PaymentActions } from './usePayments';

// The pieces of one order (spec 2.6), shared by the phone page and the laptop popup.

const copy = adminCopy.order;
type Change = (order: Order, changes: OrderChanges) => void | Promise<void>;

/** Code and came-via, the name, when and where. Spans only: the page puts it in an h1, the popup in its h2. */
export const OrderHead: React.FC<{ order: Order; nameRef?: React.Ref<HTMLSpanElement> }> = ({ order: o, nameRef }) => (
  <>
    <span className="adm-od-no">
      <Code code={o.code} />
      {o.source === 'site' ? <FromWebsite /> : <Via source={o.source} />}
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

const STEPS: Exclude<OrderStatus, 'cancelled'>[] = ['cooking', 'packing', 'ready', 'delivered'];

const hintOf = (o: Order) => {
  if (o.status === 'cooking') {
    return copy.hints.cooking(o.kitchen.filter((k) => k.waiting).map((k) => productName(k.product_id)));
  }
  if (o.status === 'delivered') {
    if (o.free_sample) return copy.hints.freeSample;
    if (o.paid) return copy.hints.done;
    return o.payment_state === 'part_paid' ? adminCopy.payments.restToCome : copy.hints.delivered;
  }
  return o.status === 'cancelled' ? '' : copy.hints[o.status];
};

/** Steps, the hint under them, and the order's money. Key it by order id. */
export const StatusCard: React.FC<{
  order: Order;
  change: Change;
  payments: PaymentActions;
  /** Opens "How did they pay?" for whatever is left. */
  onPayRest: (order: Order) => void;
  /** Priority was just turned on (and saved): offer it packed food from other orders. */
  onPriorityOn?: (order: Order) => void;
}> = ({ order: o, change, payments, onPayRest, onPriorityOn }) => {
  const cancelled = o.status === 'cancelled';
  const at = STEPS.indexOf(o.status as (typeof STEPS)[number]);
  const lastChange = o.status_changed_at;
  return (
    <section className="adm-card adm-od-status">
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
          <button type="button" className="adm-btn adm-btn--quiet adm-btn--xs" onClick={() => change(o, { status: 'cooking' })}>{copy.bringBack}</button>
        </p>
      ) : (
        <p className="adm-steps__hint">{hintOf(o)}</p>
      )}
      {/* Skip the line: only while it cooks, since that's the only place it changes anything. */}
      {o.status === 'cooking' && (
        <div className="adm-od-priority">
          <span><b>{adminCopy.orderPriority.label}</b><small>{adminCopy.orderPriority.hint}</small></span>
          <Switch checked={o.priority} label={adminCopy.orderPriority.switchLabel(firstName(o.name) || o.code)}
            onChange={async (priority) => {
              await change(o, { priority });
              if (priority) onPriorityOn?.(o);
            }} />
        </div>
      )}
      {/* A free sample has no money to take. */}
      {!o.free_sample && <PaymentsBlock order={o} payments={payments} onPayRest={onPayRest} />}
    </section>
  );
};

/**
 * Per product, while it's being cooked: "Still to cook", or "Ready, made Thu 17 Sep" (the days
 * its batches were made; plain "Ready" when it was covered by hand). Past Cooking it says nothing:
 * the steps already do.
 */
const LineState: React.FC<{ order: Order; productId: string }> = ({ order, productId }) => {
  if (order.status !== 'cooking') return null;
  const state = lineState(order, productId);
  if (!state) return null;
  if (!state.ready) return <small className="adm-lstate is-wait">{copy.stillToCook}</small>;
  return (
    <small className="adm-lstate is-ready">
      <Check size={14} aria-hidden="true" />{state.madeOn.length ? copy.readyMade(state.madeOn.map(madeOnDay)) : copy.ready}
    </small>
  );
};

export const ItemsCard: React.FC<{ order: Order }> = ({ order: o }) => (
  <section className="adm-card">
    <div className="adm-card__h">
      <h2>{packsText(o)}</h2>
      <AdminLink className="adm-text-btn" to={`/admin/orders/${o.code}/edit`}><Pencil size={15} aria-hidden="true" />{copy.edit}</AdminLink>
    </div>
    <ul className="adm-items">
      {sortLines(o.lines).map((l, i, lines) => (
        <li key={l.product_id + l.size}>
          <Thumb id={l.product_id} />
          <span>
            <b className="adm-pname">{productName(l.product_id)}</b><small>{sizeText(l.size)}</small>
            {/* Once per product, under its last line. */}
            {lines[i + 1]?.product_id !== l.product_id && <LineState order={o} productId={l.product_id} />}
          </span>
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
  order: Order; field: FieldKey; onSaved: (o: Order) => void;
  /** The total: the worked-out one, offered as a tap. Never filled in by itself, since this field saves. */
  worked?: number | null;
}> = ({ order, field, onSaved, worked }) => {
  const [value, setValue] = useState(() => shownValue(order, field));
  const [status, setStatus] = useState('');
  const latest = useRef(order);
  latest.current = order;
  const timer = useRef<number>();
  /** Typed but not saved yet. */
  const pending = useRef<string | null>(null);
  const input = useRef<HTMLElement | null>(null);
  /** On screen but not saved: waiting to save, or its save failed or was refused. No reload for an update meanwhile. */
  const unsaved = useRef(false);
  useUnsavedWork(() => unsaved.current);

  // A change from elsewhere ("Use 98231…", Undo) shows unless you're typing here.
  const saved = order[field];
  useEffect(() => {
    if (document.activeElement !== input.current) { setValue(shownValue(latest.current, field)); unsaved.current = false; }
  }, [saved, field]);

  const save = async (raw: string) => {
    window.clearTimeout(timer.current);
    pending.current = null;
    unsaved.current = true;
    const parsed = parseField(field, raw);
    if ('error' in parsed) return setStatus(parsed.error);
    const current = latest.current[field];
    if (parsed.value === (current ?? null)) { unsaved.current = false; return setStatus(''); }
    try {
      onSaved(orderOnly(await updateOrder(latest.current.id, { [field]: parsed.value })));
      unsaved.current = false;
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
    unsaved.current = true;
    timer.current = window.setTimeout(() => void save(next), 600);
  };
  const isError = status !== '' && status !== copy.saved;
  const shown = parseField(field, value);
  const offer = worked != null && !('value' in shown && shown.value === worked);
  const common = {
    value, className: 'adm-input',
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value),
    onBlur: () => void save(value),
    onFocus: (e: React.FocusEvent<HTMLElement>) => { input.current = e.currentTarget; },
  };

  return (
    <>
    <Field
      label={{ phone: copy.phone, amount: copy.total, note: copy.note }[field]}
      optional={field === 'phone' ? undefined : copy.optional}
      prefix={field === 'amount' ? '₹' : undefined}
      error={isError ? status : null}
      // With money already in, the total says so, so a new total never surprises (due or extra).
      hint={status || (field === 'amount'
        ? (order.amount_paid > 0 ? `${adminCopy.payments.paidSoFar(formatMoney(order.amount_paid))}. ${copy.totalHint}` : copy.totalHint)
        : undefined)}
      action={field === 'phone' && (order.phone
        ? <CopyButton text={formatPhone(order.phone)} />
        : <PasteButton onPaste={(text) => { setValue(text); void save(text); }} />)}
    >
      {field === 'note'
        ? <textarea {...common} rows={3} placeholder={copy.notePlaceholder} />
        : <input {...common} inputMode={field === 'phone' ? 'tel' : 'numeric'} autoComplete="off"
            placeholder={field === 'phone' ? copy.phonePlaceholder : copy.totalPlaceholder} />}
    </Field>
    {offer && (
      // mousedown keeps the focus in the field, so its blur doesn't save what was typed first.
      <button type="button" className="adm-text-btn adm-od-use-total" onMouseDown={(e) => e.preventDefault()}
        onClick={() => { setValue(String(worked)); void save(String(worked)); }}>
        {copy.useTotal(formatMoney(worked))}
      </button>
    )}
    </>
  );
};

/** "Reply on WhatsApp": their chat, with a first line ready from whoever is signed in. */
const replyLink = (o: Order, from: string | null) => {
  const text = copy.reply({
    name: firstName(o.name),
    from: firstName(from),
    code: o.message_code,
    packs: packsText(o),
    total: o.amount != null ? formatMoney(o.amount) : null,
  });
  return `https://wa.me/${o.phone}?text=${encodeURIComponent(text)}`;
};

/** Phone, total and note save as you type; then where it goes and how to reach them. */
export const DetailsCard: React.FC<{
  order: Order & Partial<Pick<OrderDetail, 'phone_suggestion'>>;
  onSaved: (o: Order) => void;
}> = ({ order: o, onSaved }) => {
  const me = useAdminMe();
  const suggestion = !o.phone && o.phone_suggestion;
  const [busy, setBusy] = useState(false);
  // Prices in their own quiet calls: on an old database there's just no "Use ₹X".
  const book = usePriceBook();
  const worked = book.workOut(sortLines(o.lines), o.coupon?.code ?? null);
  const useSuggestion = async () => {
    if (!suggestion) return;
    setBusy(true);
    try { onSaved(orderOnly(await updateOrder(o.id, { phone: suggestion.phone }))); } catch { /* the field stays empty */ }
    setBusy(false);
  };
  return (
    <section className="adm-card adm-stack" key={o.id}>
      <AutoField key={`p${o.id}`} order={o} field="phone" onSaved={onSaved} />
      {suggestion && (
        <button type="button" className="adm-text-btn" disabled={busy} onClick={useSuggestion}>
          {copy.useSuggestion(formatPhone(suggestion.phone), formatDay(suggestion.created_at))}
        </button>
      )}
      <AutoField key={`a${o.id}`} order={o} field="amount" onSaved={onSaved} worked={worked && 'total' in worked ? worked.total : null} />
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
            <b>{(h.auto && copy.autoEvents[h.event]) || copy.events[h.event]}</b> · {formatDay(h.at)}, {formatTime(h.at)}
            {h.by_name && !h.auto && ` · ${firstName(h.by_name)}`}
          </li>
        ))}
      </ol>
    </details>
  ) : null;

/**
 * The pinned button: the order's next step, or "All done." once it's done. Cooking has
 * none (it moves on by itself; "Move to Packing" is in ⋯), so nothing shows.
 */
export const PrimaryAction: React.FC<{ order: Order; change: Change; onNext?: () => void }> = ({ order, change, onNext }) => {
  const next = nextOf(order);
  if (order.status === 'cooking') return null;
  if (!next) return <span className="adm-od-alldone">{adminCopy.orders.allDone}</span>;
  return (
    <button type="button" className="adm-btn adm-btn--primary adm-od-go" onClick={onNext ?? (() => change(order, next.changes))}>
      <Check size={20} aria-hidden="true" />{next.labels[1]}
    </button>
  );
};

/** ⋯: move a Cooking order to Packing, edit, copy, mark not paid (when money came in), cancel, delete (with its own confirm). */
export const OrderMenu: React.FC<{
  order: Order; change: Change; payments: PaymentActions; onDeleted: () => void; up?: boolean;
}> = ({ order: o, change, payments, onDeleted, up }) => {
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
        {o.status === 'cooking' && (
          <button type="button" className="adm-menu__item" onClick={() => { setOpen(false); change(o, MOVE_TO_PACKING); }}>
            <ArrowRight size={18} aria-hidden="true" />{copy.menu.moveToPacking}
          </button>
        )}
        <AdminLink className="adm-menu__item" to={`/admin/orders/${o.code}/edit`}><Pencil size={18} aria-hidden="true" />{copy.menu.edit}</AdminLink>
        <button type="button" className="adm-menu__item" onClick={copyDetails}><Copy size={18} aria-hidden="true" />{copy.menu.copy}</button>
        {o.payments.length > 0 && (
          <button type="button" className="adm-menu__item" onClick={() => { setOpen(false); void payments.markNotPaid(o); }}>
            {adminCopy.payments.markNotPaid}
          </button>
        )}
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
