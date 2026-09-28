import React, { useEffect, useId, useRef, useState } from 'react';
// Not ChevronDown: the site's order popup uses it, and sharing it would move it out of the popup's chunk.
import { ChevronRight } from 'lucide-react';
import { adminCopy } from '../../data/adminCopy';
import type { Product } from '../../types/product';
import { AdminSheet } from '../AdminSheet';
import { setPrices, toAdminError } from '../api';
import { formatDay } from '../format';
import { couponState } from '../orders/quote';
import { useToast } from '../toast';
import type { Coupon, PriceChange, Prices } from '../types';

const copy = adminCopy.products;
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

/**
 * "{Product} prices": base price per size, then each coupon's own. One Save sends
 * only the cells that changed (null for a cleared one) in one setPrices call.
 */
export const ProductPricesSheet: React.FC<{
  product: Product;
  prices: Prices;
  coupons: Coupon[];
  onClose: () => void;
  onSaved: (prices: Prices) => void;
}> = ({ product, prices, coupons, onClose, onSaved }) => {
  const id = useId();
  const toast = useToast();
  const sizes = product.weightOptions;
  const saved = (couponId: string | null, size: string) => {
    const row = couponId
      ? prices.coupons.find((r) => r.coupon_id === couponId && r.product_id === product.id && r.size === size)
      : prices.base.find((r) => r.product_id === product.id && r.size === size);
    return row ? String(row.price) : '';
  };
  const [cells, setCells] = useState<Record<string, string>>(() => Object.fromEntries([null, ...coupons.map((c) => c.id)]
    .flatMap((couponId) => sizes.map((size) => [cellKey(couponId, size), saved(couponId, size)]))));
  const [bad, setBad] = useState<string | null>(null);
  const [error, setError] = useState('');
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
  const dirty = Object.entries(cells).some(([key, value]) => {
    const [couponId, size] = key.split('|');
    return value.trim() !== saved(couponId || null, size);
  });

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
    if (!changes.length) return onClose();
    setBusy(true);
    setError('');
    try {
      const next = await setPrices(changes);
      toast.show({ text: copy.pricesSaved(product.name) });
      onSaved(next);
    } catch (err) {
      const e = toAdminError(err);
      setError(e.kind === 'message' ? e.message : adminCopy.toast.failed);
      setBusy(false);
    }
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
        title={copy.sheetTitle(product.name)} closeLabel={adminCopy.close} initialFocus={firstBase}
        bar={<button type="submit" form={id} className="adm-btn adm-btn--primary adm-btn--block" disabled={busy}>{busy ? copy.saving : copy.savePrices}</button>}>
        <form id={id} ref={form} className="adm-psheet" noValidate onSubmit={(e) => { e.preventDefault(); void save(); }}>
          {error && <p className="adm-form__error" role="alert">{error}</p>}
          <div className="adm-pgrid adm-psheet__base" style={cols}>
            {head}
            <span className="adm-pgrid__label">{copy.base}</span>
            {sizes.map((size, i) => {
              const key = cellKey(null, size);
              return (
                <PriceCell key={size} value={cells[key] ?? ''} invalid={bad === key} onChange={set(key)}
                  label={copy.baseCell(`${product.name} ${size}`)} inputRef={i === 0 ? firstBase : undefined} />
              );
            })}
          </div>
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
