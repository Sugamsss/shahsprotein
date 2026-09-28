import React, { useEffect, useId, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
// Not Undo2: the site's order popup uses it, and sharing it would move it out of the popup's chunk.
import { History, IndianRupee, Instagram, Minus, Phone, Plus, RotateCcw, Trash2, User, X } from 'lucide-react';
import { OrderThumb } from '../../components/order/OrderThumb';
import { WhatsAppIcon } from '../../components/ui/WhatsAppIcon';
import { adminCopy } from '../../data/adminCopy';
import { productsData } from '../../data/products';
import { AdminSheet } from '../AdminSheet';
import { useOverview } from '../AdminLayout';
import { getCouponUses, getOrder, getOrders, getStock, saveOrder, toAdminError } from '../api';
import { formatDay, formatMoney, istDateValue } from '../format';
import { Field, LoadError, Segmented, Skeleton } from '../parts';
import { usePathPart } from '../router';
import { initials } from './CustomersPage';
import { Switch } from '../Switch';
import { useToast } from '../toast';
import type { CouponUse, Order, OrderInput, OrderSource, PaidMethod } from '../types';
import { useRpc } from '../useRpc';
import { cleanPastedPhone, normalisePhone, plainPhone, productName } from '../orders/model';
import { couponState, hasKinds, repeatCoupon, usedBefore } from '../orders/quote';
import { usePriceBook } from '../orders/usePriceBook';
import { WorkedFrom } from '../orders/Worked';
import { ContactsButton, useNameSuggestions, type Picked } from '../orders/CustomerPick';
import { PAID_METHODS } from '../orders/PaidMethod';
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
const PAID_OPTIONS = PAID_METHODS.map((value) => ({ value, label: adminCopy.paidBy.methods[value] }));

type Errors = Partial<Record<'lines' | 'name' | 'via' | 'pincode' | 'phone' | 'amount' | 'paidMethod' | 'paidNote' | 'form', string>>;

const OrderForm: React.FC<{ order: Order | null; typedCode: string }> = ({ order, typedCode }) => {
  const id = useId();
  const navigate = useNavigate();
  const laptop = useLaptop();
  const toast = useToast();
  const { reload: reloadCounts } = useOverview();
  const stock = useRpc(getStock, []);
  // Its own quiet calls: without them (an old database, a failure) there's no coupon picker and the
  // total is typed, as before. Edit still sends the order's coupon back unchanged.
  const book = usePriceBook();

  const [qty, setQty] = useState<Record<string, number>>(() =>
    Object.fromEntries((order?.lines ?? []).map((l) => [`${l.product_id}|${l.size}`, l.quantity])));
  const [phone, setPhone] = useState(order?.phone ? plainPhone(order.phone) ?? order.phone : '');
  const [name, setName] = useState(order?.name ?? '');
  const [pincode, setPincode] = useState(order?.pincode ?? '');
  const [via, setVia] = useState<OrderSource | null>(order?.source ?? null);
  const [status, setStatus] = useState<Step>('confirmed');
  const [paid, setPaid] = useState(false);
  // Nothing picked until they pick: '' is "not yet".
  const [paidMethod, setPaidMethod] = useState<PaidMethod | ''>('');
  const [paidNote, setPaidNote] = useState('');
  const [amount, setAmount] = useState(order?.amount != null ? String(order.amount) : '');
  // 'auto' follows the worked-out total; any typing makes it 'manual' for good. Edit keeps what was saved.
  const [totalMode, setTotalMode] = useState<'auto' | 'manual'>(order ? 'manual' : 'auto');
  // Sunit's own pick ('' is no coupon). A saved code stays as it was, even one that's no longer in
  // the list. Null only on a new order he hasn't picked or cleared in yet: a returning number's
  // Repeat coupon may fill in there, and once he picks or clears, nothing fills in again.
  const [couponPick, setCouponPick] = useState<string | null>(order ? order.coupon?.code ?? '' : null);
  // The typed number's coupon orders, with the number they're for, so a slow answer never lands on another.
  const [uses, setUses] = useState<{ phone: string; list: CouponUse[] } | null>(null);
  const couponInput = useRef<HTMLSelectElement>(null);
  const [note, setNote] = useState(order?.note ?? '');
  const [code, setCode] = useState(typedCode.toUpperCase().replace(/^(#|SN-)/, ''));
  const [when, setWhen] = useState({ date: '', time: '' });
  const [shown, setShown] = useState({ note: !!order?.note, code: !!typedCode, earlier: false, coupon: !!order?.coupon });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [match, setMatch] = useState<Order | null>(null);
  const dirty = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [attempt, setAttempt] = useState(0);

  const edit = <T,>(set: (value: T) => void) => (value: T) => { dirty.current = true; set(value); };
  const packs = Object.values(qty).reduce((sum, n) => sum + n, 0);
  const lines = PACKS.filter(({ key }) => qty[key]).map(({ product, size, key }) => ({ product_id: product.id, size, quantity: qty[key] }));

  // Filled in by itself: only on a new order, only while he hasn't picked, only with the coupon list shown.
  const digits = normalisePhone(phone);
  const phoneUses = uses && uses.phone === digits ? uses.list : null;
  const filled = couponPick === null && book.ready && phoneUses ? repeatCoupon(phoneUses, book.coupons ?? [], new Date()) : null;
  const coupon = couponPick ?? filled ?? '';
  const worked = book.workOut(lines, coupon || null);
  const workedTotal = worked && 'total' in worked ? worked.total : null;
  const missing = worked && 'missing' in worked ? worked.missing : null;
  const total = totalMode === 'auto' ? (workedTotal != null ? String(workedTotal) : '') : amount;
  const typedTotal = /^\d+$/.test(total.replace(/[₹,\s]/g, '')) ? Number(total.replace(/\D/g, '')) : null;
  const couponNow = coupon && book.coupons ? couponState(coupon, book.coupons, new Date()) : null;
  const linesChanged = order !== null && PACKS.some(({ key }) =>
    (qty[key] ?? 0) !== (order.lines.find((l) => `${l.product_id}|${l.size}` === key)?.quantity ?? 0));

  // A past customer or a contact: their name and number, and their last pincode if none is typed.
  const fill = ({ name: pickedName, phone: pickedPhone, pincode: pickedPincode }: Picked) => {
    dirty.current = true;
    if (pickedName) setName(pickedName);
    if (pickedPhone) setPhone(plainPhone(pickedPhone) ?? pickedPhone);
    if (pickedPincode && !pincode.trim()) setPincode(pickedPincode);
  };
  const suggest = useNameSuggestions(name, fill);

  // "Anjali Kulkarni · 2 orders before", 300ms after the phone stops changing.
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

  // Their coupon orders, for the fill-in and the one-time note. Only where the database has kinds, so an
  // older one is never asked; a failure just leaves both off.
  const kinds = hasKinds(book.coupons);
  useEffect(() => {
    if (!digits || !kinds) return;
    let live = true;
    const timer = setTimeout(() => {
      getCouponUses(digits).then((list) => { if (live) setUses({ phone: digits, list }); }, () => {});
    }, 300);
    return () => { live = false; clearTimeout(timer); };
  }, [digits, kinds]);

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
  if (total.trim() && typedTotal == null) problems.amount = orderCopy.totalError;
  if (!order && paid && !paidMethod) problems.paidMethod = adminCopy.paidBy.pickOne;
  if (!order && paid && paidMethod === 'other' && !paidNote.trim()) problems.paidNote = adminCopy.paidBy.noteMissing;
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
      amount: typedTotal,
      lines,
      // save_admin_order has always taken `coupon`, so this works on the old database too.
      ...(order
        ? { coupon: coupon || null }
        : {
            ...(coupon && { coupon }),
            status, paid,
            ...(paid && paidMethod && { paid_method: paidMethod }),
            ...(paid && paidMethod === 'other' && { paid_note: paidNote.trim() }),
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
        <Field label={copy.phone} error={errors.phone} action={<ContactsButton onPick={fill} />}>
          <input className="adm-input" inputMode="tel" autoComplete="off" value={phone} placeholder={orderCopy.phonePlaceholder}
            onChange={(e) => {
              // Shown plainly (9876543210). A paste, a keyboard's clipboard chip or autofill is cleaned
              // at once, even out of a sentence; typing is cleaned on blur, so the cursor isn't fought.
              const text = e.target.value;
              edit(setPhone)(cleanPastedPhone(phone, text, (e.nativeEvent as InputEvent).inputType) ?? text);
            }}
            onBlur={() => digits && setPhone(plainPhone(digits) ?? phone)} />
        </Field>
        {/* Hidden once Use would change nothing, e.g. right after picking them from the suggestions. */}
        {match && (match.name !== name.trim() || (!!match.pincode && match.pincode !== pincode.trim())) && (
          <div className="adm-of__match">
            <span className="adm-of__initials" aria-hidden="true">{initials(match.name)}</span>
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
            <input className="adm-input" autoComplete="off" maxLength={60} value={name} placeholder={copy.namePlaceholder}
              {...suggest.inputProps} onChange={(e) => edit(setName)(e.target.value)} />
          </Field>
          {suggest.list}
          <Field label={copy.pincode} error={errors.pincode}>
            <input className="adm-input" inputMode="numeric" maxLength={6} value={pincode}
              placeholder={order?.source === 'site' ? copy.pincodePlaceholder : copy.pincodeSatara}
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
      <div className="adm-card adm-of__paid">
        <div className="adm-paidrow">
          <span className={`adm-paidrow__icon${paid ? ' is-paid' : ''}`} aria-hidden="true"><IndianRupee size={18} /></span>
          <span><b>{paid ? adminCopy.orders.paid : orderCopy.notPaidYet}</b><small>{paid ? adminCopy.paidBy.question : copy.paidHint}</small></span>
          <Switch checked={paid} label={adminCopy.orders.paid} onChange={edit(setPaid)} />
        </div>
        {/* A plain choice saved with the form, so radios fit here (the order itself uses buttons that save). */}
        {paid && (
          <div className="adm-paychoose adm-stack" data-error={errors.paidMethod ? '' : undefined}>
            {errors.paidMethod && <p className="adm-field__error">{errors.paidMethod}</p>}
            <Segmented label={adminCopy.paidBy.question} options={PAID_OPTIONS} value={paidMethod} onChange={edit(setPaidMethod)} />
            {paidMethod === 'other' && (
              <Field label={adminCopy.paidBy.noteLabel} error={errors.paidNote}>
                <input className="adm-input" maxLength={60} autoComplete="off" value={paidNote} placeholder={adminCopy.paidBy.notePlaceholder}
                  onChange={(e) => edit(setPaidNote)(e.target.value)} />
              </Field>
            )}
          </div>
        )}
      </div>
    </section>
  );

  // Coupons page order: in use first, then off and ended under "Not in use".
  const inUse = (book.coupons ?? []).filter((c) => couponState(c.code, book.coupons ?? [], new Date()) === 'live');
  const notInUse = (book.coupons ?? []).filter((c) => !inUse.includes(c));
  const picked = book.coupons?.find((c) => c.code.toUpperCase() === coupon.toUpperCase());
  const stateHint = couponNow === 'off' ? copy.couponOff(coupon)
    : couponNow === 'expired' && picked?.expires_at ? copy.couponEnded(coupon, formatDay(picked.expires_at))
    : couponNow === 'unknown' ? copy.couponUnknown(coupon)
    : '';
  // His pick keeps the field open, even when it clears a coupon that opened it by filling in.
  const pickCoupon = (code: string) => { edit(setCouponPick)(code); setShown((s) => ({ ...s, coupon: true })); };
  // A heads-up, never a block. In Edit it counts only orders made before this one.
  const usedOn = phoneUses && book.coupons ? usedBefore(phoneUses, coupon, book.coupons, order ?? undefined) : null;
  const usedHint = usedOn ? copy.couponUsed(formatDay(usedOn.created_at), usedOn.order_code) : '';
  const usedNote = usedHint && (
    <span className="adm-worked"><History size={14} strokeWidth={1.75} aria-hidden="true" />{usedHint}</span>
  );
  const couponHint = filled ? (
    <span className="adm-worked">
      {copy.couponFilled}
      <button type="button" className="adm-text-btn" aria-label={copy.removeCouponLabel(filled)}
        onClick={() => { pickCoupon(''); couponInput.current?.focus(); }}>
        <X size={14} strokeWidth={2} aria-hidden="true" />{copy.removeCoupon}
      </button>
    </span>
  ) : usedNote ? <>{stateHint && `${stateHint} `}{usedNote}</> : stateHint || undefined;
  // A filled-in coupon opens the field by itself, so it's never applied out of sight.
  const couponShown = shown.coupon || !!filled;

  // Under Total: how it was worked out, or the worked-out total to go back to, or why there's none.
  const paidSoFar = order && order.amount_paid > 0 ? adminCopy.payments.paidSoFar(formatMoney(order.amount_paid)) : '';
  let workedLine: React.ReactNode = null;
  if (totalMode === 'auto' && workedTotal != null) {
    workedLine = <WorkedFrom code={couponNow === 'live' ? coupon : null} />;
  } else if (totalMode === 'manual' && workedTotal != null && workedTotal !== typedTotal) {
    const money = formatMoney(workedTotal);
    const [before] = orderCopy.workedIs(money, !!order).split(money);
    workedLine = (
      <span className="adm-worked">
        {before}<b>{money}</b>
        <button type="button" className="adm-text-btn" aria-label={orderCopy.useThatLabel(money)}
          onClick={() => { dirty.current = true; setTotalMode('auto'); }}>
          <RotateCcw size={14} strokeWidth={2} aria-hidden="true" />{orderCopy.useThat}
        </button>
      </span>
    );
  } else if (!total.trim() && missing) {
    workedLine = orderCopy.noPrice(`${productName(missing.product_id)} ${missing.size}`);
  }
  // Without prices this is exactly the old hint: "₹750 paid so far", or nothing.
  const totalHint = workedLine ? <>{paidSoFar && `${paidSoFar}. `}{workedLine}</> : paidSoFar || undefined;

  const more = (key: keyof typeof shown, label: string) => !shown[key] && (
    <button type="button" className="adm-text-btn" onClick={() => {
      setShown({ ...shown, [key]: true });
      // The link goes away, so the coupon field takes the focus (the code is all it's for).
      if (key === 'coupon') requestAnimationFrame(() => couponInput.current?.focus());
    }}>
      <Plus size={16} strokeWidth={1.75} aria-hidden="true" />{label}
    </button>
  );
  const extras = (
    <section className="adm-of__section adm-of--extras" aria-labelledby={`${id}-extras`}>
      <h2 id={`${id}-extras`} className="adm-of__h">{copy.ifYouHave}</h2>
      <div className="adm-card adm-form">
        {/* The cause above the effect: the coupon sits over the total it changes. */}
        {book.ready && couponShown && (
          <Field label={copy.coupon} hint={couponHint}>
            <select ref={couponInput} className={`adm-input adm-select${coupon ? '' : ' is-none'}`} value={coupon}
              onChange={(e) => pickCoupon(e.target.value)}>
              <option value="">{copy.noCoupon}</option>
              {couponNow === 'unknown' && <option value={coupon}>{coupon}</option>}
              {inUse.map((c) => <option key={c.id} value={c.code}>{c.code}</option>)}
              {notInUse.length > 0 && (
                <optgroup label={copy.notInUse}>
                  {notInUse.map((c) => <option key={c.id} value={c.code}>{c.code}</option>)}
                </optgroup>
              )}
            </select>
          </Field>
        )}
        {/* Editing an order with money in: say how much, so a new total's due or extra is no surprise. */}
        <Field label={orderCopy.total} prefix="₹" error={errors.amount} hint={totalHint}>
          <input className="adm-input" inputMode="numeric" autoComplete="off" value={total} placeholder={orderCopy.totalPlaceholder}
            onChange={(e) => { setTotalMode('manual'); edit(setAmount)(e.target.value); }} />
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
          {book.ready && !couponShown && more('coupon', copy.addCoupon)}
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
