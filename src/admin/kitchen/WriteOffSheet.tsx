import React, { useId, useState } from 'react';
import { OrderThumb } from '../../components/order/OrderThumb';
import { useDialogClose } from '../../components/ui/useDialog';
import { adminCopy } from '../../data/adminCopy';
import { productsData } from '../../data/products';
import { AdminSheet } from '../AdminSheet';
import { toAdminError, writeOffSpare } from '../api';
import { formatWeight } from '../format';
import { madeOnDay, productName } from '../orders/model';
import { Segmented } from '../parts';
import type { Kitchen, KitchenEffects, WriteOffReason } from '../types';
import { partOptions, partStart, type SpareBatch } from './model';
import { SpareKeeps } from './Spare';
import { AmountWheel } from './Wheel';

const copy = adminCopy.kitchen;

// Used up / thrown out (design/shots/pieces/used-up*.png): one batch of spare, all of it
// or part of it (a grams wheel), and what happened. The button's words follow the
// choice ("Throw out 285 g"). A batch past its date starts at All of it + Thrown out.
// Only offered when kitchen.can_write_off (the cook, or anyone when nobody is).

type Amount = 'all' | 'part';

const Bar: React.FC<{ label: string; busy: boolean; onSave: () => Promise<boolean> }> = ({ label, busy, onSave }) => {
  const close = useDialogClose();
  return (
    <button type="button" className="adm-btn adm-btn--primary adm-btn--block adm-kx-main" disabled={busy} onClick={async () => { if (await onSave()) close(); }}>
      {label}
    </button>
  );
};

export const WriteOffSheet: React.FC<{
  kitchen: Kitchen;
  productId: string;
  batchId: string;
  onClose: () => void;
  onDone: (effects: KitchenEffects, text: string) => void;
}> = ({ kitchen, productId, batchId, onClose, onDone }) => {
  const batches = kitchen.products.find((p) => p.product_id === productId)?.spare_batches ?? [];
  const [pickedId, setPickedId] = useState(batchId);
  const batch: SpareBatch | undefined = batches.find((b) => b.batch_id === pickedId) ?? batches[0];
  const startFor = (b: SpareBatch | undefined) => ({
    amount: 'all' as Amount,
    reason: (b?.state === 'past' ? 'thrown_out' : 'used_up') as WriteOffReason,
    part: b ? partStart(b.grams) : 0,
  });
  const [choice, setChoice] = useState(() => startFor(batch));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const name = productName(productId);
  const product = productsData.find((p) => p.id === productId);
  const groupName = useId();

  if (!batch) return null;
  const parts = partOptions(batch.grams);
  const canSplit = parts.length > 0;
  const amount: Amount = canSplit ? choice.amount : 'all';
  const grams = amount === 'all' ? batch.grams : Math.min(choice.part, batch.grams);
  const weight = formatWeight(grams);
  const label = choice.reason === 'thrown_out' ? copy.throwOut(weight) : copy.takeOff(weight);

  const pick = (b: SpareBatch) => { setPickedId(b.batch_id); setChoice(startFor(b)); };

  const onSave = async (): Promise<boolean> => {
    if (busy) return false;
    setBusy(true);
    setError('');
    try {
      const effects = await writeOffSpare(batch.batch_id, amount === 'all' ? null : grams, choice.reason);
      const left = effects.batches.find((b) => b.id === batch.batch_id)?.spare ?? 0;
      const say = choice.reason === 'thrown_out' ? copy.threw : copy.took;
      onDone(effects, say(weight, name, left > 0 ? formatWeight(left) : null));
      return true;
    } catch (err) {
      setError(toAdminError(err).message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const card = (b: SpareBatch) => (
    <>
      {product && <OrderThumb product={product} className="adm-kx-thumb" />}
      <span className="adm-kx-batch__text">
        <b>{copy.made(madeOnDay(b.made_on))}</b>
        <SpareKeeps batch={b} long />
      </span>
    </>
  );

  return (
    <AdminSheet
      isOpen
      onClose={onClose}
      title={copy.offTitle}
      closeLabel={adminCopy.close}
      className="adm-kx-sheet"
      bar={<Bar label={busy ? copy.saving : label} busy={busy} onSave={onSave} />}
    >
      <div className="adm-kx-body">
        {error && <p className="adm-form__error" role="alert">{error}</p>}
        <div className="adm-kx-group">
          <span className="adm-kx-label" id={`${groupName}-shelf`}>{copy.onShelf(name)}</span>
          {batches.length > 1 ? (
            <div className="adm-kx-batches" role="radiogroup" aria-labelledby={`${groupName}-shelf`}>
              {batches.map((b) => (
                <label key={b.batch_id} className={`adm-kx-batch is-choice${b.batch_id === batch.batch_id ? ' is-on' : ''}`}>
                  <input type="radio" name={groupName} checked={b.batch_id === batch.batch_id} onChange={() => pick(b)} />
                  {card(b)}
                </label>
              ))}
            </div>
          ) : <div className="adm-kx-batch">{card(batch)}</div>}
        </div>

        {canSplit && (
          <div className="adm-kx-group">
            <span className="adm-kx-label" aria-hidden="true">{adminCopy.kitchen.howMuch}</span>
            <Segmented
              label={copy.howMuch}
              slide
              value={amount}
              onChange={(next) => setChoice((c) => ({ ...c, amount: next }))}
              options={[{ value: 'all', label: copy.allOfIt(formatWeight(batch.grams)) }, { value: 'part', label: copy.partOfIt }]}
            />
            <div className={`adm-kx-reveal${amount === 'part' ? ' is-open' : ''}`}>
              <div>
                {amount === 'part' && (
                  <>
                    {batch.grams < 1000
                      ? <AmountWheel value={grams} name={copy.partWheel} grams={parts} onChange={(g) => setChoice((c) => ({ ...c, part: g }))} />
                      : <AmountWheel value={grams} name={copy.partWheel} onChange={(g) => setChoice((c) => ({ ...c, part: Math.max(1, Math.min(g, batch.grams)) }))} />}
                    <p className="adm-kx-stays">
                      {(() => { const [w, rest] = copy.stays(formatWeight(batch.grams - grams)); return <><b>{w}</b>{rest}</>; })()}
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="adm-kx-group">
          <span className="adm-kx-label" aria-hidden="true">{copy.whatHappened}</span>
          <Segmented
            label={copy.whatHappened}
            slide
            value={choice.reason}
            onChange={(reason) => setChoice((c) => ({ ...c, reason }))}
            options={[{ value: 'used_up', label: copy.usedUp }, { value: 'thrown_out', label: copy.thrownOut }]}
          />
        </div>
      </div>
    </AdminSheet>
  );
};
