import React, { useCallback, useRef, useState } from 'react';
import { useDialogClose } from '../../components/ui/useDialog';
import { adminCopy } from '../../data/adminCopy';
import { useOverview } from '../AdminLayout';
import { AdminSheet } from '../AdminSheet';
import { givePriority, undoKitchen } from '../api';
import type { Order, PriorityGiveEffects } from '../types';
import { useUndoable } from '../useUndoable';
import { giveText, givenText } from './giveText';

type Taker = Pick<Order, 'id' | 'name' | 'code'>;

/** The two buttons; each closes the popup with its exit first. */
const Bar: React.FC<{ confirm: string; onGive: () => void }> = ({ confirm, onGive }) => {
  const close = useDialogClose();
  return (
    <div className="adm-give__bar">
      <button type="button" className="adm-btn adm-btn--quiet" onClick={close}>{adminCopy.priorityGive.notNow}</button>
      <button type="button" className="adm-btn adm-btn--primary" onClick={() => { close(); onGive(); }}>{confirm}</button>
    </div>
  );
};

/**
 * "Meera is priority. Give Meera Tanvi's packed Raggi Jaggi 500 g?" — offered right after an
 * order turns priority. `offer(order)` asks the server for a preview and opens the popup only
 * when there are pouches to give; otherwise (or on any error) nothing shows. Render `popup`.
 * Giving commits, toasts with an exact Undo (undo_admin_kitchen), and calls `onDone` after both,
 * so the screen can load the orders that moved.
 */
export const usePriorityGive = (onDone?: () => void) => {
  const [offered, setOffered] = useState<{ taker: Taker; preview: PriorityGiveEffects } | null>(null);
  const run = useUndoable();
  const { reload: reloadBadge } = useOverview();
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  const offer = useCallback(async (taker: Taker) => {
    try {
      const preview = await givePriority(taker.id, true);
      if (preview.pouches.length) setOffered({ taker, preview });
    } catch {
      // Not priority any more, not in Cooking, or offline: there's simply nothing to offer.
    }
  }, []);

  const give = (taker: Taker) => {
    let actionId: string | null = null;
    let text = '';
    const refresh = () => { doneRef.current?.(); void reloadBadge(); };
    void run({
      apply: () => () => {},
      save: async () => {
        const done = await givePriority(taker.id);
        actionId = done.action_id;
        text = givenText(taker, done);
        refresh();
      },
      text: () => text,
      undo: () => {
        if (!actionId) return;
        const id = actionId;
        void run({ apply: () => () => {}, save: async () => { await undoKitchen(id); refresh(); }, text: '', undo: () => {}, quiet: true });
      },
    });
  };

  const words = offered && giveText(
    offered.taker,
    offered.preview.pouches,
    offered.preview.orders.filter((e) => e.id !== offered.taker.id && e.to === 'cooking' && e.from !== 'cooking'),
  );
  const popup = offered && words && (
    <AdminSheet isOpen centred onClose={() => setOffered(null)} title={words.title} closeLabel={adminCopy.close} className="adm-give"
      bar={<Bar confirm={words.confirm} onGive={() => give(offered.taker)} />}>
      <p className="adm-give__q">{words.question}</p>
      {words.items.length > 0 && <ul className="adm-give__list">{words.items.map((item) => <li key={item}>{item}</li>)}</ul>}
      {words.after && <p className="adm-give__after">{words.after}</p>}
    </AdminSheet>
  );

  return { offer, popup };
};
