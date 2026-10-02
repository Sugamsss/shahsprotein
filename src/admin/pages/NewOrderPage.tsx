import React, { useEffect, useId, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
// Not Undo2: the site's order popup uses it, and sharing it would move it out of the popup's chunk.
import { ChevronsUp, Gift, History, IndianRupee, Instagram, Minus, Phone, Plus, RotateCcw, Trash2, User, X } from 'lucide-react';
import { OrderThumb } from '../../components/order/OrderThumb';
import { WhatsAppIcon } from '../../components/ui/WhatsAppIcon';
import { adminCopy } from '../../data/adminCopy';
import { productsData } from '../../data/products';
import { AdminSheet } from '../AdminSheet';
import { useOverview } from '../AdminLayout';
import { getCouponUses, getKitchen, getOrder, getOrders, getStock, saveOrder, toAdminError } from '../api';
import { formatDay, formatMoney, formatWeight, istDateValue } from '../format';
import { Field, LoadError, Segmented, Skeleton } from '../parts';
import { usePathPart } from '../router';
import { initials } from './CustomersPage';
import { Switch } from '../Switch';
import { useToast } from '../toast';
import type { CouponUse, Order, OrderInput, OrderSource, PaidMethod } from '../types';
import { useRpc } from '../useRpc';
import { useUnsavedWork } from '../unsavedWork';
import { SAMPLE, cleanPastedPhone, normalisePhone, packsText, plainPhone, productName } from '../orders/model';
import { isSamplesOnly, moneyInput } from '../orders/samples';
import { couponState, hasKinds, repeatCoupon, usedBefore } from '../orders/quote';
import { usePriceBook } from '../orders/usePriceBook';
import { WorkedFrom } from '../orders/Worked';
import { ContactsButton, useNameSuggestions, type Picked } from '../orders/CustomerPick';
import { PAID_METHODS } from '../orders/PaidMethod';
import OrdersPage, { useLaptop } from '../orders/OrdersPage';

const copy = adminCopy.orderForm;
const orderCopy = adminCopy.order;
const kx = adminCopy.kitchenForms;

// Add an order by hand, or edit one (spec 2.8). Phone: a full page. Laptop: a
// 920px popup over the Orders board. /admin/orders/new(?code=…) and /admin/orders/:code/edit.

type Source = Exclude<OrderSource, 'site'>;
const SOURCES: { value: Source; icon: React.ReactNode }[] = [
  { value: 'whatsapp', icon: <WhatsAppIcon size={20} /> },
  { value: 'call', icon: <Phone size={20} strokeWidth={1.75} /> },
  { value: 'instagram', icon: <Instagram size={20} strokeWidth={1.75} /> },
  { value: 'in_person', icon: <User size={20} strokeWidth={1.75} /> },
];
const STEPS = ['cooking', 'packing', 'ready', 'delivered'] as const;
type Step = (typeof STEPS)[number];
const STATUSES = STEPS.map((value) => ({ value, label: orderCopy.steps[value] }));
const PACKS = productsData.flatMap((p) => p.weightOptions.map((size) => ({ product: p, size, key: `${p.id}|${size}` })));
/** Every size the form counts: the packs, then a sample of each product (always free). */
const LINES = [...PACKS, ...productsData.map((p) => ({ product: p, size: SAMPLE, key: `${p.id}|${SAMPLE}` }))];
const PINCODE = /^[1-9][0-9]{5}$/;
const PAID_OPTIONS = PAID_METHODS.map((value) => ({ value, label: adminCopy.paidBy.methods[value] }));

/**
 * An order that turned priority on this save (new, or an edit that switched it on). The page
 * it lands on offers it packed food ("Give it to Meera?"); see useOfferOnArrival.
 */
const giveState = (saved: Order, before: Order | null) =>
  (saved.priority && !before?.priority ? { give: { id: saved.id, name: saved.name, code: saved.code } } : {});

type Errors = Partial<Record<'lines' | 'name' | 'via' | 'pincode' | 'phone' | 'amount' | 'paidMethod' | 'paidNote' | 'form', string>>;

const OrderForm: React.FC<{ order: Order | null; typedCode: string }> = ({ order, typedCode }) => {
  const id = useId();
  const navigate = useNavigate();
  const laptop = useLaptop();
  const toast = useToast();
  const { reload: reloadCounts } = useOverview();
  const stock = useRpc(getStock, []);
  // Only for the sample weights ("Sample · 20 g · free"); without it the rows just say free.
  const kitchen = useRpc(getKitchen, []);
  // Its own quiet calls: without them (an old database, a failure) there's no coupon picker and the
  // total is typed, as before. Edit still sends the order's coupon back unchanged.
  const book = usePriceBook();

  const [qty, setQty] = useState<Record<string, number>>(() =>
    Object.fromEntries((order?.lines ?? []).map((l) => [`${l.product_id}|${l.size}`, l.quantity])));
  const [phone, setPhone] = useState(order?.phone ? plainPhone(order.phone) ?? order.phone : '');
  const [name, setName] = useState(order?.name ?? '');
  const [pincode, setPincode] = useState(order?.pincode ?? '');
  const [via, setVia] = useState<OrderSource | null>(order?.source ?? null);
  const [status, setStatus] = useState<Step>('cooking');
  const [paid, setPaid] = useState(false);
  // An edit sends back what the order has, so saving never drops it by accident.
  const [priority, setPriority] = useState(order?.priority ?? false);
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
  const [extraDiscount, setExtraDiscount] = useState(order?.extra_discount != null ? String(order.extra_discount) : '');
  const [advance, setAdvance] = useState(order?.advance != null ? String(order.advance) : '');
  const [shown, setShown] = useState({ note: !!order?.note, code: !!typedCode, earlier: false, coupon: !!order?.coupon, extraDiscount: order?.extra_discount != null, advance: order?.advance != null });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [match, setMatch] = useState<Order | null>(null);
  const dirty = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [attempt, setAttempt] = useState(0);

  // Typed but not saved: no reload for an update until it's saved or left.
  useUnsavedWork(() => dirty.current || saving);

  const edit = <T,>(set: (value: T) => void) => (value: T) => { dirty.current = true; set(value); };
  const lines = LINES.filter(({ key }) => qty[key]).map(({ product, size, key }) => ({ product_id: product.id, size, quantity: qty[key] }));
  const packs = lines.reduce((sum, l) => sum + (l.size === SAMPLE ? 0 : l.quantity), 0);
  const samples = lines.reduce((sum, l) => sum + (l.size === SAMPLE ? l.quantity : 0), 0);
  // Only samples: a free sample order, with no total, coupon or payment (the server refuses them).
  const samplesOnly = isSamplesOnly(lines);
  const count = packsText({ packs, samples });

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
  const linesChanged = order !== null && LINES.some(({ key }) =>
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
  if (!lines.length) problems.lines = kx.linesError;
  if (name.trim().length < 2) problems.name = copy.errors.name;
  if (!via) problems.via = copy.errors.via;
  if (pincode.trim() && !PINCODE.test(pincode.trim())) problems.pincode = copy.errors.pincode;
  if (phone.trim() && !digits) problems.phone = orderCopy.phoneError;
  if (!samplesOnly && total.trim() && typedTotal == null) problems.amount = orderCopy.totalError;
  if (!order && !samplesOnly && paid && !paidMethod) problems.paidMethod = adminCopy.paidBy.pickOne;
  if (!order && !samplesOnly && paid && paidMethod === 'other' && !paidNote.trim()) problems.paidNote = adminCopy.paidBy.noteMissing;
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
      lines,
      priority,
      ...moneyInput({ samplesOnly, editing: !!order, total: typedTotal, coupon, paid, paidMethod, paidNote }),
      extra_discount: samplesOnly || !extraDiscount ? null : Number(extraDiscount.replace(/\D/g, '')),
      advance: samplesOnly || !advance ? null : Number(advance.replace(/\D/g, '')),
      ...(!order && {
        status,
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
      // A priority order just saved may take packed food: the page it lands on asks (useOfferOnArrival).
      navigate(order ? `/admin/orders/${saved.code}` : '/admin/orders', { state: { flash: saved.id, ...giveState(saved, order) } });
    } catch (err) {
      const error = toAdminError(err);
      setFormError(error.kind === 'message' ? error.message : adminCopy.toast.failed);
      setSaving(false);
      setAttempt((n) => n + 1);
    }
  };

  const setPack = (key: string, n: number) => edit(setQty)({ ...qty, [key]: Math.max(0, Math.min(99, n)) });
  const out = (productId: string, size: string) => stock.data?.some((r) => r.product_id === productId && r.size === size);

  // One pack size, or a product's sample: + Add (a round + for a sample), then the stepper.
  const stepper = (key: string, item: string, sample: boolean) => {
    const n = qty[key] ?? 0;
    if (n === 0) {
      return sample ? (
        <button type="button" className="adm-of__add-sample" aria-label={copy.addLabel(item)} onClick={() => setPack(key, 1)}>
          <Plus size={16} aria-hidden="true" />
        </button>
      ) : (
        <button type="button" className="adm-btn adm-btn--tonal adm-btn--sm" aria-label={copy.addLabel(item)} onClick={() => setPack(key, 1)}>
          <Plus size={18} strokeWidth={1.75} aria-hidden="true" />{copy.add}
        </button>
      );
    }
    return (
      <span className="qty-stepper" role="group" aria-label={item}>
        <button type="button" className={`qty-stepper__btn${n === 1 ? ' is-remove' : ''}`} aria-label={n === 1 ? copy.remove(item) : copy.less(item)} onClick={() => setPack(key, n - 1)}>
          {n === 1 ? <Trash2 size={16} aria-hidden="true" /> : <Minus size={16} aria-hidden="true" />}
        </button>
        <span className="qty-stepper__value">{n}</span>
        <button type="button" className="qty-stepper__btn qty-stepper__btn--more" aria-label={copy.more(item)} aria-disabled={n >= 99 || undefined} onClick={() => setPack(key, n + 1)}>
          <Plus size={16} aria-hidden="true" />
        </button>
      </span>
    );
  };
  // A sample line already on the order keeps the weight it was saved with; a new one takes today's.
  const sampleGrams = (productId: string) =>
    order?.lines.find((l) => l.product_id === productId && l.size === SAMPLE)?.grams_each
    ?? kitchen.data?.products.find((p) => p.product_id === productId)?.sample_grams;

  const ordered = (
    <section className="adm-of__section adm-of--ordered" aria-labelledby={`${id}-ordered`}>
      <div className="adm-of__h">
        <h2 id={`${id}-ordered`}>{copy.ordered}</h2>
        <span>{lines.length ? count : copy.tapToAdd}</span>
      </div>
      {linesChanged && order?.source === 'site' && <p className="adm-of__note">{copy.siteNote}</p>}
      {errors.lines && <p className="adm-field__error" data-error>{errors.lines}</p>}
      <ul className="adm-card adm-of__packs">
        {productsData.map((product) => {
          const sampleKey = `${product.id}|${SAMPLE}`;
          const grams = sampleGrams(product.id);
          return (
            <React.Fragment key={product.id}>
              {product.weightOptions.map((size) => (
                <li key={size}>
                  <OrderThumb product={product} className="adm-of__thumb" />
                  <span className="adm-list__main">
                    <b className="adm-pname">{product.name}</b>
                    <small>{size}{out(product.id, size) && <> · <em>{copy.backSoon}</em></>}</small>
                  </span>
                  {stepper(`${product.id}|${size}`, `${product.name} ${size}`, false)}
                </li>
              ))}
              {/* Tucked under its product: a gift where the photo would be, and never a price. */}
              <li className="adm-of__sample">
                <span className="adm-of__gift" aria-hidden="true"><Gift size={16} strokeWidth={1.75} /></span>
                <span className="adm-list__main">
                  <b><span className="visually-hidden">{product.name} </span>{kx.sample}</b>
                  <small>{[grams && formatWeight(grams), kx.free].filter(Boolean).map((t) => ` · ${t}`).join('')}</small>
                </span>
                {stepper(sampleKey, kx.sampleItem(product.name), true)}
              </li>
            </React.Fragment>
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

  // Priority: jumps the kitchen's line for food not given out yet. Either person can set it.
  const priorityRow = (
    <div className="adm-paidrow adm-of__priority">
      <span className={`adm-paidrow__icon${priority ? ' is-on' : ''}`} aria-hidden="true"><ChevronsUp size={18} /></span>
      <span><b>{kx.priority}</b><small>{kx.priorityHint}</small></span>
      <Switch checked={priority} label={kx.priority} onChange={edit(setPriority)} />
    </div>
  );
  const paidRows = samplesOnly ? (
    <p className="adm-of__free"><Gift size={16} strokeWidth={1.75} aria-hidden="true" />{kx.onlySamplesPaid}</p>
  ) : (
    <>
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
    </>
  );
  // Status and Paid are set here only for a new order; afterwards they live on the order itself.
  // An edit shows Priority only while the order is in Cooking, as the order view does.
  const whereAt = order ? (
    order.status !== 'cooking' ? null : (
      <section className="adm-of__section adm-of--where" aria-label={kx.priority}>
        <div className="adm-card adm-of__paid">{priorityRow}</div>
      </section>
    )
  ) : (
    <section className="adm-of__section adm-of--where" aria-labelledby={`${id}-where`}>
      <h2 id={`${id}-where`} className="adm-of__h">{copy.where}</h2>
      <div className="adm-of__status">
        <Segmented label={copy.where} options={STATUSES} value={status} onChange={edit(setStatus)} slide />
        {status === 'cooking' && <p className="adm-of__hint">{kx.shelfFirst}</p>}
      </div>
      <div className="adm-card adm-of__paid">
        {priorityRow}
        {paidRows}
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
    // Samples ride along free, so the line says so rather than leaving it to guess.
    workedLine = samples ? (
      <span className="adm-worked"><Gift size={14} strokeWidth={1.75} aria-hidden="true" />{kx.fromPrices(couponNow === 'live' ? coupon : null, samples)}</span>
    ) : <WorkedFrom code={couponNow === 'live' ? coupon : null} />;
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
        {samplesOnly && <p className="adm-of__free"><Gift size={16} strokeWidth={1.75} aria-hidden="true" />{kx.onlySamplesTotal}</p>}
        {!samplesOnly && book.ready && couponShown && (
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
        {!samplesOnly && (
          <Field label={orderCopy.total} prefix="₹" error={errors.amount} hint={totalHint}>
            <input className="adm-input" inputMode="numeric" autoComplete="off" value={total} placeholder={orderCopy.totalPlaceholder}
              onChange={(e) => { setTotalMode('manual'); edit(setAmount)(e.target.value); }} />
          </Field>
        )}
        {!samplesOnly && shown.extraDiscount && <Field label={copy.extraDiscount} prefix="₹" hint={copy.extraDiscountHint}><input className="adm-input" inputMode="numeric" autoComplete="off" value={extraDiscount} onChange={(e) => edit(setExtraDiscount)(e.target.value.replace(/\D/g, ''))} /></Field>}
        {!samplesOnly && shown.advance && <Field label={copy.advance} prefix="₹" hint={copy.advanceHint}><input className="adm-input" inputMode="numeric" autoComplete="off" value={advance} onChange={(e) => edit(setAdvance)(e.target.value.replace(/\D/g, ''))} /></Field>}
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
          {!samplesOnly && book.ready && !couponShown && more('coupon', copy.addCoupon)}
          {!samplesOnly && more('extraDiscount', copy.addExtraDiscount)}
          {!samplesOnly && more('advance', copy.addAdvance)}
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
      <span>{count}</span>
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
