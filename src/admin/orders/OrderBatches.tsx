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
import type { Order, OrderBatchEffects } from '../types';
import { useRpc } from '../useRpc';
import { useUndoable } from '../useUndoable';
import { movedOthers, productName } from './model';

// Batch numbers on an order (20261104000000): under each product's lines, the batch its
// food came from. A tap on the number shows Mfg and Exp; "Change batch" picks another batch
// with the food on the shelf (the kitchen gives the oldest first by itself). Every change
// has an exact Undo through undo_admin_kitchen.

const copy = adminCopy.batches;

/**
 * The batches under one product of an order, on their own full-width line: each number with its
 * Exp, readable at a glance. A tap opens a small panel: Mfg and Exp, then Change batch (only when
 * another batch could take it) and everyone who got it. An order still going out with no logged
 * batch gets Pick batch. Nothing shows while the product is still waiting in Cooking, before the
 * database has batch numbers, or on a delivered order covered by hand.
 */
export const ProductBatches: React.FC<{ order: Order; productId: string; onChange?: (productId: string) => void }> = ({ order, productId, onChange }) => {
  const on = useBatchesAvailable();
  const [openId, setOpenId] = useState<string | null>(null);
  const panelId = useId();
  const batches = orderBatches(order, productId);
  const k = order.kitchen?.find((x) => x.product_id === productId);
  const changeable = on && !!onChange && !!k && canChangeBatch(order, productId);
  // Only ask the kitchen once a panel is open: is there another batch this could come from?
  const kitchen = useRpc(() => (openId && changeable ? getKitchen() : Promise.resolve(null)), [openId, changeable, order.updated_at]);
  if (!k || k.waiting) return null;

  if (!batches.length) {
    if (!changeable || order.status === 'delivered') return null;
    return (
      <div className="adm-obatches">
        <span className="adm-obatches__none">{copy.noBatch}</span>
        <button type="button" className="adm-btn adm-btn--tonal adm-btn--xs" aria-label={copy.changeName(productName(productId))}
          onClick={() => onChange?.(productId)}>{copy.pick}</button>
      </div>
    );
  }

  const open = batches.find((b) => b.batch_id === openId);
  const others = kitchen.data ? batchChoices(kitchen.data, order, productId).some((c) => !c.current && c.enough && !c.past) : false;
  const split = batches.length > 1 || k.by_hand > 0;
  return (
    <div className="adm-obatches">
      {batches.map((b) => {
        const isOpen = b.batch_id === openId;
        const { exp } = batchDates(b);
        return (
          <span key={b.batch_id} className="adm-obatch">
            <button type="button" className={`adm-obatch__chip${isOpen ? ' is-open' : ''}`} aria-expanded={isOpen}
              aria-controls={panelId} aria-label={copy.showDetails(b.code)} onClick={() => setOpenId(isOpen ? null : b.batch_id)}>
              <Tag size={14} aria-hidden="true" />
              <span className="adm-obatch__code">{b.code}</span>
              <ChevronRight className="adm-obatch__chev" size={14} aria-hidden="true" />
            </button>
            <span className="adm-obatch__exp">{exp ? copy.expShort(exp) : copy.noExp}</span>
          </span>
        );
      })}
      <div id={panelId} className="adm-obatch__panel" hidden={!open}>
        {open && (
          <>
            <dl className="adm-obatch__facts">
              <div><dt>{copy.mfg}</dt><dd>{batchDates(open).mfg}</dd></div>
              <div><dt>{copy.exp}</dt><dd>{batchDates(open).exp ?? copy.noExp}</dd></div>
            </dl>
            {split && (
              <p className="adm-obatch__note">
                {[copy.fromIt(formatWeight(open.grams)), k.by_hand > 0 && copy.byHand(formatWeight(k.by_hand))].filter(Boolean).join(' · ')}
              </p>
            )}
            <div className="adm-obatch__actions">
              {changeable && others && (
                <button type="button" className="adm-btn adm-btn--tonal adm-btn--xs" aria-label={copy.changeName(productName(productId))}
                  onClick={() => onChange?.(productId)}>{copy.change}</button>
              )}
              {on && <AdminLink className="adm-kx-history-link" to={batchLink(open.code)}>{copy.whoElse}</AdminLink>}
            </div>
          </>
        )}
      </div>
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
