import React, { useEffect, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { OrderThumb } from '../../components/order/OrderThumb';
import { adminCopy } from '../../data/adminCopy';
import { productsData } from '../../data/products';
import { AdminSheet } from '../AdminSheet';
import { formatMoney, formatWeight } from '../format';
import { Field, Segmented } from '../parts';
import { fromDrafts, sizeFor, sizeGrams, toDrafts, typedNumber, type Draft, type DraftError } from './bigOrder';
import type { Rates } from './quote';

const copy = adminCopy.orderForm.advanced;

/**
 * Advanced edit (Add and Edit order): each pack line's weight (its sizes, or Other in grams),
 * quantity and price for this order. It edits a copy; Done checks every line and only then
 * hands the packs and typed prices back. ×, Esc and the backdrop leave the order as it was.
 * Samples aren't here: they stay on the form's list.
 */
export const AdvancedEditSheet: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  qty: Record<string, number>;
  rates: Rates;
  /** The price list's price for a pack (coupon included), or undefined. */
  listPrice: (productId: string, size: string) => number | undefined;
  onDone: (packs: Record<string, number>, rates: Rates) => void;
}> = ({ isOpen, onClose, qty, rates, listPrice, onDone }) => {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [errors, setErrors] = useState<Record<number, DraftError>>({});
  const next = useRef(1);

  // A fresh copy each time it opens.
  useEffect(() => {
    if (!isOpen) return;
    const list = toDrafts(qty, rates);
    next.current = list.length + 1;
    setDrafts(list);
    setErrors({});
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const change = (id: number, patch: Partial<Draft>) => {
    setDrafts((list) => list.map((d) => (d.id === id ? { ...d, ...patch } : d)));
    setErrors(({ [id]: _, ...rest }) => rest);
  };
  const add = (productId: string) => {
    const size = productsData.find((p) => p.id === productId)?.weightOptions[0] ?? 'other';
    setDrafts((list) => [...list, { id: next.current++, productId, size, grams: '', qty: '1', price: '' }]);
  };
  const done = () => {
    const result = fromDrafts(drafts);
    if (Object.keys(result.errors).length) return setErrors(result.errors);
    onDone(result.qty, result.rates);
    onClose();
  };

  let packs = 0;
  let grams = 0;
  let total: number | null = 0;
  const rows = drafts.map((d) => {
    const product = productsData.find((p) => p.id === d.productId);
    const weight = d.size === 'other' ? typedNumber(d.grams) : null;
    const size = d.size === 'other' ? (weight ? sizeFor(d.productId, weight) : null) : d.size;
    const list = size ? listPrice(d.productId, size) : undefined;
    const typed = typedNumber(d.price);
    const price = typed ?? list;
    const n = typedNumber(d.qty) ?? 0;
    packs += n;
    grams += n * (size ? sizeGrams(size) ?? 0 : 0);
    if (total != null) total = price != null ? total + n * price : null;
    let hint: string = copy.noBook;
    if (errors[d.id]) hint = copy.errors[errors[d.id]];
    else if (typed != null && list != null && typed < list) hint = copy.off(formatMoney(list - typed));
    else if (typed != null) hint = copy.yours;
    else if (list != null) hint = copy.usingBook(formatMoney(list));
    return { d, product, list, price, n, hint, error: !!errors[d.id] };
  });

  return (
    <AdminSheet isOpen={isOpen} onClose={onClose} title={copy.title} closeLabel={adminCopy.close} className="adm-adv"
      bar={(
        <div className="adm-of__bar">
          <span>{[adminCopy.order.packs(packs), grams ? formatWeight(grams) : '', total != null && packs ? formatMoney(total) : ''].filter(Boolean).join(' · ')}</span>
          <button type="button" className="adm-btn adm-btn--primary" onClick={done}>{copy.done}</button>
        </div>
      )}>
      <p className="adm-intro">{copy.sub}</p>
      {!drafts.length && <p className="adm-card adm-empty">{copy.empty}</p>}
      <ul className="adm-adv__lines">
        {rows.map(({ d, product, list, price, n, hint, error }) => product && (
          <li key={d.id} className="adm-card adm-adv-line">
            <div className="adm-adv-line__head">
              <OrderThumb product={product} className="adm-of__thumb" />
              <span className="adm-list__main">
                <b className="adm-pname">{product.name}</b>
                <small>{price != null ? copy.line(n, formatMoney(price), formatMoney(n * price)) : copy.packsOnly(n)}</small>
              </span>
              <button type="button" className="adm-adv-line__remove" aria-label={copy.remove(product.name)}
                onClick={() => setDrafts((all) => all.filter((x) => x.id !== d.id))}>
                <Trash2 size={18} strokeWidth={1.75} aria-hidden="true" />
              </button>
            </div>
            <div className="adm-adv-line__weight">
              <span className="adm-field__label" aria-hidden="true">{copy.weight}</span>
              <Segmented label={`${copy.weight}, ${product.name}`} slide value={d.size}
                options={[...product.weightOptions.map((s) => ({ value: s, label: s })), { value: 'other', label: copy.other }]}
                onChange={(size) => change(d.id, { size })} />
              {d.size === 'other' && (
                <Field label={copy.grams} error={errors[d.id] === 'weight' ? hint : undefined}>
                  <input className="adm-input" inputMode="numeric" autoComplete="off" maxLength={5} placeholder={copy.gramsPlaceholder}
                    value={d.grams} onChange={(e) => change(d.id, { grams: e.target.value.replace(/\D/g, '') })} />
                </Field>
              )}
            </div>
            <div className="adm-form__pair">
              <Field label={copy.quantity} error={errors[d.id] === 'quantity' ? hint : undefined}>
                <input className="adm-input" inputMode="numeric" autoComplete="off" maxLength={4} value={d.qty}
                  onChange={(e) => change(d.id, { qty: e.target.value.replace(/\D/g, '') })} />
              </Field>
              <Field label={copy.price} prefix="₹" error={errors[d.id] === 'price' ? hint : undefined}>
                <input className="adm-input" inputMode="numeric" autoComplete="off" maxLength={5}
                  placeholder={list != null ? String(list) : copy.pricePlaceholder}
                  value={d.price} onChange={(e) => change(d.id, { price: e.target.value.replace(/\D/g, '') })} />
              </Field>
            </div>
            {!error && <p className={`adm-adv-line__hint${price == null ? ' is-warn' : ''}`}>{hint}</p>}
          </li>
        ))}
      </ul>
      <div className="adm-adv__add">
        <span className="adm-field__label">{copy.addProduct}</span>
        <div className="adm-adv__chips">
          {productsData.map((p) => (
            <button key={p.id} type="button" className="adm-btn adm-btn--tonal adm-btn--sm" aria-label={copy.addLabel(p.name)} onClick={() => add(p.id)}>
              {copy.add(p.name)}
            </button>
          ))}
        </div>
      </div>
    </AdminSheet>
  );
};
