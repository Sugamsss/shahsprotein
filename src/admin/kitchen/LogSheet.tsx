import React, { useId, useMemo, useState } from 'react';
import { Check, ChevronRight, Plus } from 'lucide-react';
import { OrderThumb } from '../../components/order/OrderThumb';
import { useDialogClose } from '../../components/ui/useDialog';
import { adminCopy } from '../../data/adminCopy';
import { productsData } from '../../data/products';
import { AdminSheet } from '../AdminSheet';
import { logBatches, toAdminError } from '../api';
import { formatWeight } from '../format';
import { productName } from '../orders/model';
import type { BatchInput, Kitchen, KitchenEffects } from '../types';
import { MadeOn } from './MadeOn';
import { BIG_BATCH, inSiteOrder, packedCount, prefill, type LogRow } from './model';
import { Outcomes } from './Outcomes';
import { AmountWheel } from './Wheel';

const copy = adminCopy.kitchen;

// Log cooking (A+ one step, design/pranjali-action-*.png "the sheet"): every product
// that needs cooking is already there at exactly what's needed, so the usual log is
// two taps (Log cooking, Log it). A pill opens that row's kg + g wheels; a row rolled
// to 0 dims to "not made" with "+ Add". Products nobody waits on can be added (spare
// cooking). The sentences under it are the server's preview of exactly this log.

/** A product added with nothing waiting on it starts at half a kilo. */
const ADDED_START = 500;

const productOf = (id: string) => productsData.find((p) => p.id === id);

/** The pinned bar: Log it, or the big-amount check. Inside the sheet, so it can close it. */
const Bar: React.FC<{
  busy: boolean;
  disabled: boolean;
  big: { product_id: string; grams: number } | null;
  onLog: () => Promise<boolean>;
  onChange: () => void;
}> = ({ busy, disabled, big, onLog, onChange }) => {
  const close = useDialogClose();
  const log = async () => { if (await onLog()) close(); };
  if (big) {
    const [lead, rest] = copy.big(formatWeight(big.grams), productName(big.product_id));
    const yes = copy.yesLog(formatWeight(big.grams));
    return (
      <div className="adm-kx-bar">
        <p className="adm-kx-check" role="alert"><b>{lead}</b>{rest}</p>
        <div className="adm-kx-bar__pair">
          <button type="button" className="adm-btn adm-btn--quiet" onClick={onChange} disabled={busy}>{copy.changeIt}</button>
          <button type="button" className="adm-btn adm-btn--primary" onClick={() => void log()} disabled={busy}>
            {busy ? copy.logging : <span>{yes[0]}<span className="adm-kx-nowrap">{yes[1]}</span></span>}
          </button>
        </div>
      </div>
    );
  }
  return (
    <button type="button" className="adm-btn adm-btn--primary adm-btn--block adm-kx-main" onClick={() => void log()} disabled={busy || disabled}>
      <Check size={20} aria-hidden="true" />{busy ? copy.logging : copy.logIt}
    </button>
  );
};

export const LogSheet: React.FC<{
  kitchen: Kitchen;
  onClose: () => void;
  /** Saved: show its kitchen and the toast. */
  onLogged: (effects: KitchenEffects, text: string) => void;
}> = ({ kitchen, onClose, onLogged }) => {
  const [rows, setRows] = useState<LogRow[]>(() => prefill(kitchen));
  const [open, setOpen] = useState<string | null>(null);
  const [madeOn, setMadeOn] = useState(kitchen.today);
  const [big, setBig] = useState<{ product_id: string; grams: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const wheelId = useId();

  const extras = inSiteOrder(kitchen.products).filter((p) => !rows.some((r) => r.product_id === p.product_id));
  const batches: BatchInput[] = rows
    .filter((r) => r.grams > 0)
    .map((r) => ({ product_id: r.product_id, grams: r.grams, ...(madeOn === kitchen.today ? {} : { made_on: madeOn }) }));
  const key = JSON.stringify(batches);
  const request = useMemo(() => (batches.length ? { key, load: () => logBatches(batches, true) } : null), [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const setGrams = (productId: string, grams: number) => {
    setBig(null);
    setError('');
    setRows((list) => list.map((r) => (r.product_id === productId ? { ...r, grams } : r)));
  };
  const add = (productId: string) => {
    const row = rows.find((r) => r.product_id === productId);
    if (row) setGrams(productId, row.need || ADDED_START);
    else {
      setRows((list) => inSiteOrder([...list, { product_id: productId, need: 0, grams: ADDED_START }]));
      setBig(null);
    }
    setOpen(productId);
  };

  const onLog = async (): Promise<boolean> => {
    if (!batches.length || busy) return false;
    const huge = batches.find((b) => b.grams > BIG_BATCH);
    if (huge && !big) { setBig({ product_id: huge.product_id, grams: huge.grams }); return false; }
    setBusy(true);
    setError('');
    try {
      const effects = await logBatches(batches);
      const items = inSiteOrder(batches).map((b) => copy.item(formatWeight(b.grams), productName(b.product_id)));
      onLogged(effects, copy.logged(items, packedCount(effects)));
      return true;
    } catch (err) {
      setError(toAdminError(err).message);
      setBig(null);
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminSheet
      isOpen
      onClose={onClose}
      title={copy.logCooking}
      closeLabel={adminCopy.close}
      className="adm-kx-sheet"
      bar={<Bar busy={busy} disabled={!batches.length} big={big} onLog={onLog} onChange={() => { if (big) setOpen(big.product_id); setBig(null); }} />}
    >
      <div className="adm-kx-body">
        {error && <p className="adm-form__error" role="alert">{error}</p>}
        <MadeOn value={madeOn} today={kitchen.today} onChange={(day) => { setMadeOn(day); setBig(null); }} />

        {rows.length > 0 && (
          <ul className="adm-kx-rows">
            {rows.map((row) => {
              const product = productOf(row.product_id);
              const name = productName(row.product_id);
              const isOpen = open === row.product_id;
              const off = row.grams === 0 && !isOpen;
              // Each part stays whole ("Need 2 kg" never breaks); a narrow row wraps between them.
              const sub = (row.need
                ? [copy.need(formatWeight(row.need)), row.grams === 0 && copy.notMade]
                : [copy.nothingNeeded, copy.goesSpare]).filter(Boolean) as string[];
              return (
                <li key={row.product_id} className={`adm-kx-row${off ? ' is-off' : ''}${isOpen ? ' is-open' : ''}`}>
                  <div className="adm-kx-row__head">
                    {product && <OrderThumb product={product} className="adm-kx-thumb" />}
                    <span className="adm-kx-row__name">
                      <b>{name}</b>
                      <span className="adm-kx-row__sub">{sub.map((part, i) => <React.Fragment key={part}>{i > 0 && ' · '}<span>{part}</span></React.Fragment>)}</span>
                    </span>
                    {off ? (
                      <button type="button" className="adm-kx-pill is-add" onClick={() => add(row.product_id)} aria-label={copy.addName(name)}>
                        <Plus size={18} aria-hidden="true" />{copy.add}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={`adm-kx-pill${isOpen ? ' is-open' : ''}`}
                        aria-expanded={isOpen}
                        aria-controls={isOpen ? `${wheelId}-${row.product_id}` : undefined}
                        aria-label={copy.amountName(name, formatWeight(row.grams))}
                        onClick={() => setOpen(isOpen ? null : row.product_id)}
                      >
                        {formatWeight(row.grams)}<ChevronRight className="adm-kx-pill__chev" size={18} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                  {isOpen && (
                    <AmountWheel id={`${wheelId}-${row.product_id}`} value={row.grams} name={name} onChange={(grams) => setGrams(row.product_id, grams)} />
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <Outcomes
          heading={copy.whenYouLog}
          before={kitchen}
          mode="log"
          request={request}
          empty={copy.pickSomething}
        />

        {extras.length > 0 && (
          <div className="adm-kx-extras">
            {extras.map((p) => (
              <button key={p.product_id} type="button" className="adm-kx-extra" onClick={() => add(p.product_id)}>
                <Plus size={18} aria-hidden="true" /><b>{productName(p.product_id)}</b><span>{copy.nothingNeeded}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </AdminSheet>
  );
};
