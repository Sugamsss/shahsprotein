import React, { useEffect, useId, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { IndianRupee, Instagram, Minus, Phone, Plus, Trash2, User, X } from 'lucide-react';
import { OrderThumb } from '../../components/order/OrderThumb';
import { WhatsAppIcon } from '../../components/ui/WhatsAppIcon';
import { adminCopy } from '../../data/adminCopy';
import { productsData } from '../../data/products';
import { AdminSheet } from '../AdminSheet';
import { useOverview } from '../AdminLayout';
import { getOrder, getOrders, getStock, saveOrder, toAdminError } from '../api';
import { formatPhone, istDateValue } from '../format';
import { Field, LoadError, Segmented, Skeleton } from '../parts';
import { usePathPart } from '../router';
import { Switch } from '../Switch';
import { useToast } from '../toast';
import type { Order, OrderInput, OrderSource } from '../types';
import { useRpc } from '../useRpc';
import { normalisePhone } from '../orders/model';
import { PasteButton } from '../orders/OrderParts';
import OrdersPage, { useLaptop } from '../orders/OrdersPage';

const copy = adminCopy.orderForm;
const orderCopy = adminCopy.order;

// Add an order by hand, or edit one (spec 2.8). Phone: a full page. Laptop: a
// 920px popup over the Orders board. /admin/orders/new(?code=…) and /admin/orders/:code/edit.

type Source = Exclude<OrderSource, 'site'>;
const SOURCES: { value: Source; icon: React.ReactNode }[] = [
  { value: 'whatsapp', icon: <WhatsAppIcon size={20} /> },
  { value: 'call', icon: <Phone size={20} strokeWidth={1.75} /> },
  { value: 'instagram', icon: <Instagram size={20} strokeWidth={1.75} /> },
  { value: 'in_person', icon: <User size={20} strokeWidth={1.75} /> },
];
const STEPS = ['new', 'confirmed', 'sent', 'delivered'] as const;
type Step = (typeof STEPS)[number];
const STATUSES = STEPS.map((value) => ({ value, label: orderCopy.steps[value] }));
const PACKS = productsData.flatMap((p) => p.weightOptions.map((size) => ({ product: p, size, key: `${p.id}|${size}` })));
const PINCODE = /^[1-9][0-9]{5}$/;

type Errors = Partial<Record<'lines' | 'name' | 'via' | 'pincode' | 'phone' | 'amount' | 'form', string>>;

const OrderForm: React.FC<{ order: Order | null; typedCode: string }> = ({ order, typedCode }) => {
  const id = useId();
  const navigate = useNavigate();
  const laptop = useLaptop();
  const toast = useToast();
  const { reload: reloadCounts } = useOverview();
  const stock = useRpc(getStock, []);

  const [qty, setQty] = useState<Record<string, number>>(() =>
    Object.fromEntries((order?.lines ?? []).map((l) => [`${l.product_id}|${l.size}`, l.quantity])));
  const [phone, setPhone] = useState(order?.phone ? formatPhone(order.phone) : '');
  const [name, setName] = useState(order?.name ?? '');
  const [pincode, setPincode] = useState(order?.pincode ?? '');
  const [via, setVia] = useState<OrderSource | null>(order?.source ?? null);
  const [status, setStatus] = useState<Step>('confirmed');
  const [paid, setPaid] = useState(false);
  const [amount, setAmount] = useState(order?.amount != null ? String(order.amount) : '');
  const [note, setNote] = useState(order?.note ?? '');
  const [code, setCode] = useState(typedCode.toUpperCase().replace(/^(#|SN-)/, ''));
  const [when, setWhen] = useState({ date: '', time: '' });
  const [shown, setShown] = useState({ note: !!order?.note, code: !!typedCode, earlier: false });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [match, setMatch] = useState<Order | null>(null);
  const dirty = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [attempt, setAttempt] = useState(0);

  const edit = <T,>(set: (value: T) => void) => (value: T) => { dirty.current = true; set(value); };
  const packs = Object.values(qty).reduce((sum, n) => sum + n, 0);
  const linesChanged = order !== null && PACKS.some(({ key }) =>
    (qty[key] ?? 0) !== (order.lines.find((l) => `${l.product_id}|${l.size}` === key)?.quantity ?? 0));

  // "Anjali Kulkarni · 2 orders before", 300ms after the phone stops changing.
  const digits = normalisePhone(phone);
  useEffect(() => {
    setMatch(null);
    if (!digits) return;
    let live = true;
    const timer = setTimeout(() => {
      getOrders({ view: 'all', phone: digits, limit: 1 }).then(({ orders: [hit] }) => {
        if (live && hit && hit.id !== order?.id) setMatch(hit);
      }, () => {});
    }, 300);
    return () => { live = false; clearTimeout(timer); };
  }, [digits, order?.id]);

  // After a failed Save, show the first problem.
  useEffect(() => {
    if (!attempt) return;
    const first = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"], [data-error]');
    first?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    if (first?.matches('input, textarea')) first.focus({ preventScroll: true });
  }, [attempt]);

  const close = () => navigate(order ? `/admin/orders/${order.code}` : '/admin/orders');
  // Close, Esc and the backdrop ask first when something was typed.
  const canClose = () => {
    if (dirty.current) setLeaving(true);
    return !dirty.current;
  };

  // Checked live once Save has been tried, so each error goes as soon as it's fixed.
  const problems: Errors = {};
  if (packs === 0) problems.lines = copy.errors.lines;
  if (name.trim().length < 2) problems.name = copy.errors.name;
  if (!via) problems.via = copy.errors.via;
  if (pincode.trim() && !PINCODE.test(pincode.trim())) problems.pincode = copy.errors.pincode;
  if (phone.trim() && !digits) problems.phone = orderCopy.phoneError;
  if (amount.trim() && !/^\d+$/.test(amount.replace(/[₹,\s]/g, ''))) problems.amount = orderCopy.totalError;
  const errors: Errors = attempt ? { ...problems, form: formError || undefined } : {};

  const save = async () => {
    setFormError('');
    if (Object.keys(problems).length) return setAttempt((n) => n + 1);

    const input: OrderInput = {
      source: via as OrderSource,
      name: name.trim(),
      phone: digits,
      pincode: pincode.trim() || null,
      note: note.trim() || null,
      amount: amount.trim() ? Number(amount.replace(/\D/g, '')) : null,
      lines: PACKS.filter(({ key }) => qty[key]).map(({ product, size, key }) => ({ product_id: product.id, size, quantity: qty[key] })),
      ...(order
        ? { coupon: order.coupon?.code ?? null }
        : {
            status, paid,
            ...(code && { code: `SN-${code}` }),
            ...(shown.earlier && when.date && { created_at: `${when.date}T${when.time || '12:00'}:00+05:30` }),
          }),
    };
    setSaving(true);
    try {
      const saved = await saveOrder(input, order?.id);
      void reloadCounts();
      toast.show({
        text: copy.saved(saved.code),
        action: order ? undefined : { label: copy.view, onAction: () => navigate(`/admin/orders/${saved.code}`) },
      });
      navigate(order ? `/admin/orders/${saved.code}` : '/admin/orders', { state: { flash: saved.id } });
    } catch (err) {
      const error = toAdminError(err);
      setFormError(error.kind === 'message' ? error.message : adminCopy.toast.failed);
      setSaving(false);
      setAttempt((n) => n + 1);
    }
  };

  const setPack = (key: string, n: number) => edit(setQty)({ ...qty, [key]: Math.max(0, Math.min(99, n)) });
  const out = (productId: string, size: string) => stock.data?.some((r) => r.product_id === productId && r.size === size);

  const ordered = (
    <section className="adm-of__section adm-of--ordered" aria-labelledby={`${id}-ordered`}>
      <div className="adm-of__h">
        <h2 id={`${id}-ordered`}>{copy.ordered}</h2>
        <span>{packs ? orderCopy.packs(packs) : copy.tapToAdd}</span>
      </div>
      {linesChanged && order?.source === 'site' && <p className="adm-of__note">{copy.siteNote}</p>}
      {errors.lines && <p className="adm-field__error" data-error>{errors.lines}</p>}
      <ul className="adm-card adm-of__packs">
        {PACKS.map(({ product, size, key }) => {
          const n = qty[key] ?? 0;
          const item = `${product.name} ${size}`;
          return (
            <li key={key}>
              <OrderThumb product={product} className="adm-of__thumb" />
              <span className="adm-list__main">
                <b className="adm-pname">{product.name}</b>
                <small>{size}{out(product.id, size) && <> · <em>{copy.backSoon}</em></>}</small>
              </span>
              {n === 0 ? (
                <button type="button" className="adm-btn adm-btn--tonal adm-btn--sm" aria-label={copy.addLabel(item)} onClick={() => setPack(key, 1)}>
                  <Plus size={18} strokeWidth={1.75} aria-hidden="true" />{copy.add}
                </button>
              ) : (
                <span className="qty-stepper" role="group" aria-label={item}>
                  <button type="button" className={`qty-stepper__btn${n === 1 ? ' is-remove' : ''}`} aria-label={n === 1 ? copy.remove(item) : copy.less(item)} onClick={() => setPack(key, n - 1)}>
                    {n === 1 ? <Trash2 size={16} aria-hidden="true" /> : <Minus size={16} aria-hidden="true" />}
                  </button>
                  <span className="qty-stepper__value">{n}</span>
                  <button type="button" className="qty-stepper__btn qty-stepper__btn--more" aria-label={copy.more(item)} aria-disabled={n >= 99 || undefined} onClick={() => setPack(key, n + 1)}>
                    <Plus size={16} aria-hidden="true" />
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );

  const who = (
    <section className="adm-of__section adm-of--who" aria-labelledby={`${id}-who`}>
      <h2 id={`${id}-who`} className="adm-of__h">{copy.who}</h2>
      <div className="adm-card adm-form">
        <Field label={copy.phone} error={errors.phone} action={<PasteButton onPaste={edit(setPhone)} />}>
          <input className="adm-input" inputMode="tel" autoComplete="off" value={phone} placeholder={orderCopy.phonePlaceholder}
            onChange={(e) => edit(setPhone)(e.target.value)} onBlur={() => digits && setPhone(formatPhone(digits))} />
        </Field>
        {match && (
          <div className="adm-of__match">
            <span className="adm-of__initials" aria-hidden="true">{(match.name ?? '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()}</span>
            <span className="adm-list__main">
              <b>{match.name}</b>
              <small>{[copy.ordersBefore(match.customer?.orders ?? 1), match.pincode].filter(Boolean).join(' · ')}</small>
            </span>
            <button type="button" className="adm-btn adm-btn--primary adm-btn--sm" aria-label={copy.useLabel(match.name ?? '')}
              onClick={() => { edit(setName)(match.name ?? ''); setPincode(match.pincode ?? ''); }}>{copy.use}</button>
          </div>
        )}
        <div className="adm-form__pair">
          <Field label={copy.name} error={errors.name}>
            <input className="adm-input" autoComplete="off" maxLength={60} value={name} placeholder={copy.namePlaceholder} onChange={(e) => edit(setName)(e.target.value)} />
          </Field>
          <Field label={copy.pincode} error={errors.pincode}>
            <input className="adm-input" inputMode="numeric" maxLength={6} value={pincode} placeholder={copy.pincodePlaceholder}
              onChange={(e) => edit(setPincode)(e.target.value.replace(/\D/g, ''))} />
          </Field>
        </div>
      </div>
    </section>
  );

  // A site order keeps "site" (the server refuses anything else), so it has no Came via.
  const cameVia = order?.source === 'site' ? null : (
    <fieldset className="adm-of__section adm-of--via" data-error={errors.via ? '' : undefined}>
      <legend className="adm-of__h">{copy.via}</legend>
      {errors.via && <p className="adm-field__error">{errors.via}</p>}
      <div className="adm-of__via">
        {SOURCES.map(({ value, icon }) => (
          <label key={value}>
            <input type="radio" name={`${id}-via`} checked={via === value} onChange={() => edit(setVia)(value)} />
            <span>{icon}{adminCopy.orders.via[value]}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );

  // Status and Paid are set here only for a new order; afterwards they live on the order itself.
  const whereAt = order ? null : (
    <section className="adm-of__section adm-of--where" aria-labelledby={`${id}-where`}>
      <h2 id={`${id}-where`} className="adm-of__h">{copy.where}</h2>
      <Segmented label={copy.where} options={STATUSES} value={status} onChange={edit(setStatus)} />
      <div className="adm-card adm-paidrow">
        <span className={`adm-paidrow__icon${paid ? ' is-paid' : ''}`} aria-hidden="true"><IndianRupee size={18} /></span>
        <span><b>{paid ? adminCopy.orders.paid : orderCopy.notPaidYet}</b><small>{copy.paidHint}</small></span>
        <Switch checked={paid} label={adminCopy.orders.paid} onChange={edit(setPaid)} />
      </div>
    </section>
  );

  const more = (key: keyof typeof shown, label: string) => !shown[key] && (
    <button type="button" className="adm-text-btn" onClick={() => setShown({ ...shown, [key]: true })}>
      <Plus size={16} strokeWidth={1.75} aria-hidden="true" />{label}
    </button>
  );
  const extras = (
    <section className="adm-of__section adm-of--extras" aria-labelledby={`${id}-extras`}>
      <h2 id={`${id}-extras`} className="adm-of__h">{copy.ifYouHave}</h2>
      <div className="adm-card adm-form">
        <Field label={orderCopy.total} prefix="₹" error={errors.amount}>
          <input className="adm-input" inputMode="numeric" autoComplete="off" value={amount} placeholder={orderCopy.totalPlaceholder} onChange={(e) => edit(setAmount)(e.target.value)} />
        </Field>
        {shown.note && (
          <Field label={orderCopy.note}>
            <textarea className="adm-input" rows={3} value={note} placeholder={orderCopy.notePlaceholder} onChange={(e) => edit(setNote)(e.target.value)} />
          </Field>
        )}
        {!order && shown.code && (
          <Field label={copy.codeLabel} hint={copy.codeHint} prefix="SN-">
            <input className="adm-input adm-input--mono" autoCapitalize="characters" autoComplete="off" spellCheck={false} maxLength={5}
              value={code} onChange={(e) => edit(setCode)(e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, ''))} />
          </Field>
        )}
        {!order && shown.earlier && (
          <div className="adm-form__pair">
            <Field label={copy.date}><input className="adm-input" type="date" max={istDateValue()} value={when.date} onChange={(e) => edit(setWhen)({ ...when, date: e.target.value })} /></Field>
            <Field label={copy.time}><input className="adm-input" type="time" value={when.time} onChange={(e) => edit(setWhen)({ ...when, time: e.target.value })} /></Field>
          </div>
        )}
        <div className="adm-of__links">
          {more('note', copy.addNote)}
          {!order && more('code', copy.addCode)}
          {!order && more('earlier', copy.earlier)}
        </div>
      </div>
    </section>
  );

  const title = order ? copy.editTitle(order.code) : copy.newTitle;
  const bar = (
    <div className="adm-of__bar">
      <span>{orderCopy.packs(packs)}</span>
      <button type="submit" form={`${id}-form`} className="adm-btn adm-btn--primary" disabled={saving}>
        {saving ? copy.saving : order ? copy.saveEdit : copy.save}
      </button>
    </div>
  );
  const body = (
    <form id={`${id}-form`} ref={formRef} className="adm-of" noValidate onSubmit={(e) => { e.preventDefault(); void save(); }}>
      {!order && <p className="adm-intro adm-of__intro">{copy.intro}</p>}
      {errors.form && <p className="adm-form__error" role="alert" data-error>{errors.form}</p>}
      {/* The spec's phone order, which is also the keyboard order; the laptop places them in two columns. */}
      {ordered}{who}{cameVia}{whereAt}{extras}
    </form>
  );
  const leaveDialog = (
    <AdminSheet isOpen={leaving} onClose={() => setLeaving(false)} title={copy.leaveTitle} closeLabel={adminCopy.close}
      bar={<div className="adm-of__leave">
        <button type="button" className="adm-btn adm-btn--quiet" onClick={() => setLeaving(false)}>{copy.keepEditing}</button>
        <button type="button" className="adm-btn adm-btn--primary" onClick={close}>{copy.leave}</button>
      </div>}>
      {null}
    </AdminSheet>
  );

  if (laptop) {
    return (
      <>
        <OrdersPage behind />
        <AdminSheet isOpen onClose={close} canClose={canClose} width={920} title={title} closeLabel={adminCopy.close} bar={bar} className="adm-of-popup">
          {body}
        </AdminSheet>
        {leaveDialog}
      </>
    );
  }
  return (
    <div className="adm-page adm-of-page">
      <div className="adm-title-row">
        <h1 className="adm-title">{title}</h1>
        <button type="button" className="adm-sheet__close" aria-label={adminCopy.close} onClick={() => canClose() && close()}>
          <X size={20} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
      {body}
      <div className="adm-of-page__bar">{bar}</div>
      {leaveDialog}
    </div>
  );
};

const NewOrderPage: React.FC = () => {
  const code = usePathPart(1);
  const editing = code !== 'new';
  const typed = new URLSearchParams(useLocation().search).get('code') ?? '';
  const { data, error, loading, reload } = useRpc(() => (editing ? getOrder(code) : Promise.resolve(null)), [code]);

  if (!editing) return <OrderForm order={null} typedCode={typed} />;
  if (error && !data) return <div className="adm-page"><LoadError onRetry={() => void reload()} /></div>;
  if (!data) return <div className="adm-page">{loading ? <Skeleton rows={4} /> : <p className="adm-card adm-empty">{orderCopy.notFound(code)}</p>}</div>;
  return <OrderForm key={data.id} order={data} typedCode="" />;
};

export default NewOrderPage;
