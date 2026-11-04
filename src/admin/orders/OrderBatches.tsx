import React, { useCallback, useId, useRef, useState } from 'react';
import { ChevronRight, Tag } from 'lucide-react';
import { adminCopy } from '../../data/adminCopy';
import { AdminSheet } from '../AdminSheet';
import { getKitchen, getOrder, setOrderBatch, undoKitchen } from '../api';
import { formatWeight } from '../format';
import { batchChoices, batchDates, canChangeBatch, orderBatches, type BatchChoice } from '../kitchen/batches';
import { batchLink, useBatchesAvailable } from '../kitchen/useBatchesAvailable';
import { DatesLine } from '../kitchen/DatesLine';
import { LoadError, Skeleton } from '../parts';
import { AdminLink } from '../router';
import type { Order, OrderBatch, OrderBatchEffects } from '../types';
import { useRpc } from '../useRpc';
import { useUndoable } from '../useUndoable';
import { movedOthers, productName } from './model';

// Batch numbers on an order (20261104000000): under each product's lines, the batch its
// food came from. A tap on the number shows Mfg and Exp; "Change batch" picks another batch
// with the food on the shelf (the kitchen gives the oldest first by itself). Every change
// has an exact Undo through undo_admin_kitchen.

const copy = adminCopy.batches;

/** One batch: the number as a button; open, its Mfg, Exp, grams and a link to everyone who got it. */
const BatchChip: React.FC<{ batch: OrderBatch & { code: string }; split: boolean; linkOn: boolean }> = ({ batch, split, linkOn }) => {
  const [open, setOpen] = useState(false);
  const id = useId();
  const { mfg, exp } = batchDates(batch);
  return (
    <div className={`adm-obatch${open ? ' is-open' : ''}`}>
      <button type="button" className="adm-obatch__chip" aria-expanded={open} aria-controls={id}
        aria-label={copy.showDetails(batch.code)} onClick={() => setOpen((v) => !v)}>
        <Tag size={14} aria-hidden="true" />
        <span className="adm-obatch__code">{batch.code}</span>
        <ChevronRight className="adm-obatch__chev" size={14} aria-hidden="true" />
      </button>
      <div id={id} className="adm-obatch__panel" hidden={!open}>
        <dl className="adm-obatch__facts">
          <div><dt>{copy.mfg}</dt><dd>{mfg}</dd></div>
          <div><dt>{copy.exp}</dt><dd>{exp ?? copy.noExp}</dd></div>
        </dl>
        {split && <p className="adm-obatch__note">{copy.fromIt(formatWeight(batch.grams))}</p>}
        {linkOn && <AdminLink className="adm-kx-history-link" to={batchLink(batch.code)}>{copy.whoElse}</AdminLink>}
      </div>
    </div>
  );
};

/**
 * The batches under one product of an order: each number, what was covered by hand, and
 * Change batch (or Pick batch when none was logged for it). Nothing shows while the
 * product is still waiting in Cooking, or before the database has batch numbers.
 */
export const ProductBatches: React.FC<{ order: Order; productId: string; onChange?: (productId: string) => void }> = ({ order, productId, onChange }) => {
  const on = useBatchesAvailable();
  const batches = orderBatches(order, productId);
  const k = order.kitchen?.find((x) => x.product_id === productId);
  if (!k || k.waiting) return null;
  if (!batches.length && !on) return null;
  const changeable = on && !!onChange && canChangeBatch(order, productId);
  if (!batches.length && !changeable) return null;
  return (
    <div className="adm-obatches">
      {batches.map((b) => <BatchChip key={b.batch_id} batch={b} split={batches.length > 1 || k.by_hand > 0} linkOn={on} />)}
      {k.by_hand > 0 && <small className="adm-obatches__hand">{batches.length ? copy.byHand(formatWeight(k.by_hand)) : copy.noBatch}</small>}
      {changeable && (
        <button type="button" className="adm-text-btn adm-obatches__change" aria-label={copy.changeName(productName(productId))}
          onClick={() => onChange?.(productId)}>
          {batches.length ? copy.change : copy.pick}
        </button>
      )}
    </div>
  );
};

/** One choice in the sheet: number, Mfg and Exp, and what's on the shelf. Acts on the tap. */
const ChoiceRow: React.FC<{ c: BatchChoice; need: number; onPick: (c: BatchChoice) => void }> = ({ c, need, onPick }) => {
  const { mfg, exp } = batchDates(c);
  const why = c.current ? copy.inOrder : c.past ? copy.pastExp : !c.enough ? copy.notEnough(formatWeight(c.spare), formatWeight(need)) : copy.spare(formatWeight(c.spare));
  return (
    <li>
      <button type="button" className={`adm-bchoice${c.current ? ' is-current' : ''}`} disabled={c.current || c.past || !c.enough}
        aria-current={c.current || undefined} onClick={() => onPick(c)}>
        <span className="adm-bchoice__main">
          <span className="adm-bchoice__code">
            {c.code}
            {c.oldest && <span className="adm-chip">{copy.oldest}</span>}
          </span>
          <DatesLine className="adm-bchoice__dates" mfg={mfg} exp={exp} />
        </span>
        <span className={`adm-bchoice__end${c.past || (!c.enough && !c.current) ? ' is-off' : ''}`}>{why}</span>
      </button>
    </li>
  );
};

/** Change batch: the batches this product could come from, oldest first. */
export const ChangeBatchSheet: React.FC<{
  order: Order | null;
  productId: string | null;
  onClose: () => void;
  onPick: (order: Order, productId: string, choice: BatchChoice) => void;
}> = ({ order, productId, onClose, onPick }) => {
  const isOpen = !!order && !!productId;
  const kitchen = useRpc(() => (isOpen ? getKitchen() : Promise.resolve(null)), [isOpen, order?.updated_at, productId]);
  const name = productId ? productName(productId) : '';
  const need = order?.kitchen?.find((k) => k.product_id === productId)?.covered ?? 0;
  const choices = kitchen.data && order && productId ? batchChoices(kitchen.data, order, productId) : null;
  return (
    <AdminSheet isOpen={isOpen} onClose={onClose} title={copy.sheetTitle(name)} closeLabel={adminCopy.close} className="adm-kx-sheet">
      <div className="adm-kx-body">
        <p className="adm-muted adm-bchoice__hint">{copy.sheetHint}</p>
        {kitchen.error && !kitchen.data && <LoadError onRetry={kitchen.reload} />}
        {kitchen.loading && !kitchen.data && <Skeleton cards={1} rows={2} />}
        {choices && (
          <ul className="adm-bchoices">
            {choices.map((c) => <ChoiceRow key={c.batch_id} c={c} need={need} onPick={(x) => { onPick(order!, productId!, x); onClose(); }} />)}
          </ul>
        )}
        {choices && choices.filter((c) => !c.current).length === 0 && <p className="adm-muted">{copy.nothingElse}</p>}
      </div>
    </AdminSheet>
  );
};

/**
 * Change batch with the shared Undo toast. `show` puts the saved order on screen; `onOthers`
 * runs when the food it freed moved other orders (so a board can load them again).
 */
export const useBatchChange = (show: (order: Order) => void, onOthers?: () => void) => {
  const run = useUndoable();
  const showRef = useRef(show);
  showRef.current = show;
  const othersRef = useRef(onOthers);
  othersRef.current = onOthers;

  return useCallback((order: Order, productId: string, choice: BatchChoice) => {
    let saved: OrderBatchEffects | null = null;
    return run({
      apply: () => () => {},
      save: async () => {
        saved = await setOrderBatch(order.id, productId, choice.batch_id);
        showRef.current(saved.order);
        if (movedOthers(order, saved)) othersRef.current?.();
      },
      text: () => copy.changed(productName(productId), choice.code),
      undo: () => {
        const actionId = saved?.action_id;
        if (!actionId) return;
        void run({
          apply: () => () => {},
          save: async () => {
            await undoKitchen(actionId);
            const fresh = await getOrder(order.code);
            if (fresh) showRef.current(fresh);
            if (saved && movedOthers(order, saved)) othersRef.current?.();
          },
          text: '',
          undo: () => {},
          quiet: true,
        });
      },
    });
  }, [run]);
};
