import React, { useEffect, useId, useRef, useState } from 'react';
// Not ChevronDown: the site's order popup uses it, and sharing it would move it out of the popup's chunk.
import { ChevronRight } from 'lucide-react';
import { adminCopy } from '../../data/adminCopy';
import type { Product } from '../../types/product';
import { AdminSheet } from '../AdminSheet';
import { setKitchenProduct, setPrices, toAdminError } from '../api';
import { formatDay } from '../format';
import { couponState } from '../orders/quote';
import { keepChanges, keepDraft, type KeepDraft } from '../orders/samples';
import { Segmented } from '../parts';
import { useToast } from '../toast';
import type { Coupon, Kitchen, KitchenProduct, PriceChange, Prices, ShelfLifeUnit } from '../types';

const copy = adminCopy.products;
const kx = adminCopy.kitchenForms;
const UNITS = (['days', 'months'] as const).map((value) => ({ value, label: kx.units[value] }));
const formCopy = adminCopy.orderForm;

/** A cell's key: '' is the base price, else the coupon's id. */
const cellKey = (couponId: string | null, size: string) => `${couponId ?? ''}|${size}`;

/** '' is no price; a number is whole rupees 1 to 99,999; null is a bad cell. */
const parsePrice = (raw: string): number | '' | null => {
  const text = raw.replace(/[₹,\s]/g, '');
  if (!text) return '';
  if (!/^\d+$/.test(text)) return null;
  const n = Number(text);
  return n >= 1 && n <= 99999 ? n : null;
};

/** One ₹ box. Coupon cells show the base price as a grey placeholder: what they'd pay if it's left empty. */
const PriceCell: React.FC<{
  value: string; label: string; placeholder?: string; invalid: boolean;
  onChange: (value: string) => void; inputRef?: React.Ref<HTMLInputElement>;
}> = ({ value, label, placeholder, invalid, onChange, inputRef }) => (
  <label className="adm-price">
    <span aria-hidden="true">₹</span>
    <input ref={inputRef} className="adm-input" inputMode="numeric" enterKeyHint="done" autoComplete="off" maxLength={6}
      aria-label={label} aria-invalid={invalid || undefined} value={value} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)} />
  </label>
);

/** A server refusal in its own words (22023), else the usual "couldn't save". */
const why = (err: unknown) => {
  const e = toAdminError(err);
  return e.kind === 'message' ? e.message : adminCopy.toast.failed;
};

/**
 * One product, titled with its name: base price per size, its sample and shelf life,
 * then each coupon's own prices. Each part shows only when it loaded (`prices`, `keep`).
 * One Save sends only what changed: the price cells in one setPrices call, the sample and
 * shelf life in one setKitchenProduct call. If one of them fails, it says which; the part
 * that saved is passed up at once, so trying again only sends the rest.
 */
export const ProductSheet: React.FC<{
  product: Product;
  /** Null when prices (or the coupon list) didn't load: no price parts then. */
  prices: Prices | null;
  coupons: Coupon[] | null;
  /** Null when the kitchen didn't load: no sample and shelf life part then. */
  keep: Pick<KitchenProduct, 'sample_grams' | 'shelf_life'> | null;
  onClose: () => void;
  onPrices: (prices: Prices) => void;
  onKeep: (kitchen: Kitchen) => void;
}> = ({ product, prices: loadedPrices, coupons: loadedCoupons, keep, onClose, onPrices, onKeep }) => {
  const id = useId();
  const toast = useToast();
  const sizes = product.weightOptions;
  const hasPrices = !!loadedPrices && !!loadedCoupons;
  const prices = hasPrices ? loadedPrices : { base: [], coupons: [] };
  const coupons = hasPrices ? loadedCoupons : [];
  const saved = (couponId: string | null, size: string) => {
    const row = couponId
      ? prices.coupons.find((r) => r.coupon_id === couponId && r.product_id === product.id && r.size === size)
      : prices.base.find((r) => r.product_id === product.id && r.size === size);
    return row ? String(row.price) : '';
  };
  const [cells, setCells] = useState<Record<string, string>>(() => Object.fromEntries([null, ...coupons.map((c) => c.id)]
    .flatMap((couponId) => sizes.map((size) => [cellKey(couponId, size), saved(couponId, size)]))));
  const [bad, setBad] = useState<string | null>(null);
  const [draft, setDraft] = useState<KeepDraft>(() => keepDraft(keep?.sample_grams ?? 0, keep?.shelf_life ?? null));
  const [keepBad, setKeepBad] = useState<'sample' | 'shelf' | null>(null);
  const sampleInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  // A refusal shows at the top of the form, which may be scrolled away by now.
  const errorLine = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (error) errorLine.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [error]);
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [idleOpen, setIdleOpen] = useState(false);
  const firstBase = useRef<HTMLInputElement>(null);
  const form = useRef<HTMLFormElement>(null);
  // After a Save with a bad cell: focus it once it's on screen (it may have just been unfolded).
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (attempt) form.current?.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus();
  }, [attempt]);

  const now = new Date();
  const inUse = coupons.filter((c) => couponState(c.code, coupons, now) === 'live');
  const idle = coupons.filter((c) => !inUse.includes(c));

  const changes: PriceChange[] = Object.entries(cells).flatMap(([key, value]) => {
    const [couponId, size] = key.split('|');
    const before = saved(couponId || null, size);
    const next = parsePrice(value);
    if (next === null || String(next) === before) return [];
    return [{ coupon_id: couponId || null, product_id: product.id, size, price: next === '' ? null : next }];
  });
  const keepNow = keep ? keepChanges(keep, draft) : { settings: null };
  const dirty = Object.entries(cells).some(([key, value]) => {
    const [couponId, size] = key.split('|');
    return value.trim() !== saved(couponId || null, size);
  }) || !('settings' in keepNow) || keepNow.settings !== null;
  const setKeep = (change: Partial<KeepDraft>) => {
    setDraft((d) => ({ ...d, ...change }));
    setKeepBad(null);
  };

  const set = (key: string) => (value: string) => {
    setCells((c) => ({ ...c, [key]: value }));
    if (bad === key) setBad(null);
  };

  const save = async () => {
    if (busy) return;
    const wrong = Object.entries(cells).find(([, value]) => parsePrice(value) === null)?.[0];
    if (wrong) {
      setBad(wrong);
      // An ended or off coupon's cell may be folded away.
      if (!wrong.startsWith('|') && idle.some((c) => wrong.startsWith(`${c.id}|`))) setIdleOpen(true);
      setAttempt((n) => n + 1);
      return;
    }
    if ('bad' in keepNow) {
      setKeepBad(keepNow.bad);
      setAttempt((n) => n + 1);
      return;
    }
    const settings = keepNow.settings;
    if (!changes.length && !settings) return onClose();
    setBusy(true);
    setError('');
    const [priced, kept] = await Promise.allSettled([
      changes.length ? setPrices(changes) : Promise.resolve(null),
      settings ? setKitchenProduct(product.id, settings) : Promise.resolve(null),
    ]);
    if (priced.status === 'fulfilled' && priced.value) onPrices(priced.value);
    if (kept.status === 'fulfilled' && kept.value) onKeep(kept.value);
    if (priced.status === 'fulfilled' && kept.status === 'fulfilled') {
      toast.show({ text: kx.saved(product.name) });
      onClose();
      return;
    }
    // Say which part didn't save when the other did; otherwise just why.
    if (priced.status === 'rejected' && kept.status === 'fulfilled' && settings) setError(kx.pricesFailed(why(priced.reason)));
    else if (kept.status === 'rejected' && priced.status === 'fulfilled' && changes.length) setError(kx.keepFailed(why(kept.reason)));
    else setError(why(priced.status === 'rejected' ? priced.reason : (kept as PromiseRejectedResult).reason));
    setBusy(false);
  };

  const basePlaceholder = (size: string) => {
    const base = parsePrice(cells[cellKey(null, size)] ?? '');
    return typeof base === 'number' ? String(base) : undefined;
  };
  const cols = { '--cols': sizes.length } as React.CSSProperties;
  const couponRows = (list: Coupon[], note: (c: Coupon) => string | null) => list.map((c) => (
    <React.Fragment key={c.id}>
      <span className="adm-pcode">
        <b>{c.code}</b>
        {note(c) && <small>{note(c)}</small>}
      </span>
      {sizes.map((size) => {
        const key = cellKey(c.id, size);
        return (
          <PriceCell key={size} value={cells[key] ?? ''} invalid={bad === key} onChange={set(key)}
            label={copy.couponCell(`${product.name} ${size}`, c.code)} placeholder={basePlaceholder(size)} />
        );
      })}
    </React.Fragment>
  ));
  const head = (
    <>
      <span aria-hidden="true" />
      {sizes.map((size) => <span key={size} className="adm-pgrid__col" aria-hidden="true">{size}</span>)}
    </>
  );

  return (
    <>
      <AdminSheet isOpen onClose={onClose} canClose={() => { if (dirty) setLeaving(true); return !dirty; }}
        title={product.name} closeLabel={adminCopy.close} initialFocus={hasPrices ? firstBase : sampleInput}
        bar={<button type="submit" form={id} className="adm-btn adm-btn--primary adm-btn--block" disabled={busy}>{busy ? copy.saving : kx.save}</button>}>
        <form id={id} ref={form} className="adm-psheet" noValidate onSubmit={(e) => { e.preventDefault(); void save(); }}>
          {error && <p ref={errorLine} className="adm-form__error" role="alert">{error}</p>}
          {hasPrices && <div className="adm-pgrid adm-psheet__base" style={cols}>
            {head}
            <span className="adm-pgrid__label">{copy.base}</span>
            {sizes.map((size, i) => {
              const key = cellKey(null, size);
              return (
                <PriceCell key={size} value={cells[key] ?? ''} invalid={bad === key} onChange={set(key)}
                  label={copy.baseCell(`${product.name} ${size}`)} inputRef={i === 0 ? firstBase : undefined} />
              );
            })}
          </div>}
          {keep && (
            <div className="adm-pkeep">
              <h3>{kx.keepTitle}</h3>
              <p className="adm-phint">{kx.keepHint}</p>
              <div className="adm-pkeep__row">
                <label htmlFor={`${id}-sample`}>{kx.sampleField}</label>
                <span className="adm-unitbox">
                  <input ref={sampleInput} id={`${id}-sample`} className="adm-input" inputMode="numeric" enterKeyHint="done" autoComplete="off"
                    maxLength={3} value={draft.sample} aria-invalid={keepBad === 'sample' || undefined}
                    aria-describedby={keepBad === 'sample' ? `${id}-keep-error` : undefined}
                    onChange={(e) => setKeep({ sample: e.target.value })} />
                  <span aria-hidden="true">{kx.sampleUnit}</span>
                </span>
              </div>
              <div className="adm-pkeep__row">
                <label htmlFor={`${id}-keeps`}>{kx.keepsFor}</label>
                <span className="adm-pkeep__pair">
                  <input id={`${id}-keeps`} className="adm-input adm-pkeep__n" inputMode="numeric" enterKeyHint="done" autoComplete="off"
                    maxLength={3} value={draft.amount} aria-invalid={keepBad === 'shelf' || undefined}
                    aria-describedby={keepBad === 'shelf' ? `${id}-keep-error` : undefined}
                    onChange={(e) => setKeep({ amount: e.target.value })} />
                  <Segmented<ShelfLifeUnit> label={kx.unitLabel} options={UNITS} value={draft.unit} onChange={(unit) => setKeep({ unit })} slide />
                </span>
              </div>
              {keepBad && <p id={`${id}-keep-error`} className="adm-field__error" role="alert">{keepBad === 'sample' ? kx.sampleError : kx.shelfError}</p>}
            </div>
          )}
          {coupons.length > 0 && (
            <div className="adm-psheet__coupons">
              <h3>{copy.couponPrices}</h3>
              <p className="adm-phint">{copy.couponPricesHint}</p>
              {inUse.length > 0 && <div className="adm-pgrid" style={cols}>{couponRows(inUse, () => null)}</div>}
              {idle.length > 0 && (
                <>
                  <button type="button" className="adm-ptoggle" aria-expanded={idleOpen} aria-controls={`${id}-idle`}
                    onClick={() => setIdleOpen(!idleOpen)}>
                    {copy.notInUse(idle.length)}<ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" />
                  </button>
                  <div id={`${id}-idle`} className="adm-pgrid is-idle" style={cols} hidden={!idleOpen}>
                    {/* Like the Coupons page: an ended coupon says so, on or off. */}
                    {couponRows(idle, (c) => (c.expires_at && new Date(c.expires_at) <= now
                      ? copy.couponEnded(formatDay(c.expires_at)) : copy.couponOff))}
                  </div>
                </>
              )}
            </div>
          )}
          {bad && <p className="adm-field__error" role="alert">{copy.priceError}</p>}
        </form>
      </AdminSheet>
      <AdminSheet isOpen={leaving} onClose={() => setLeaving(false)} title={formCopy.leaveTitle} closeLabel={adminCopy.close}
        bar={<div className="adm-of__leave">
          <button type="button" className="adm-btn adm-btn--quiet" onClick={() => setLeaving(false)}>{formCopy.keepEditing}</button>
          <button type="button" className="adm-btn adm-btn--primary" onClick={onClose}>{formCopy.leave}</button>
        </div>}>
        {null}
      </AdminSheet>
    </>
  );
};
