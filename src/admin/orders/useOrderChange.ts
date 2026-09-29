import { useCallback, useRef } from 'react';
import { getOrder, undoKitchen, updateOrder } from '../api';
import { useOverview } from '../AdminLayout';
import type { Order, OrderChanges, UpdatedOrder } from '../types';
import { useUndoable } from '../useUndoable';
import { applyLocal, changeText, effectsText, movedOthers, orderOnly, undoPlanOf } from './model';

/**
 * One-tap changes to an order, on the shared useUndoable: show it at once, save it,
 * offer Undo, and go back on failure. `show` puts an order on screen (the list, the
 * detail); a save also refreshes the badge.
 *
 * Undo: every status or priority change answers with kitchen_effects and an action_id,
 * and goes back through undo_admin_kitchen, which restores status, when it entered it,
 * priority and the kitchen exactly, and deletes the history the move wrote; then the
 * order is loaded again. If something moved since, the server's sentence shows as the
 * toast. An answer without an action id sends the reverse keys.
 *
 * `onOthers` runs only when the change moved or touched other orders too (and after
 * the Undo of such a change), so a board can load them again.
 */
export const useOrderChange = (show: (order: Order) => void, onOthers?: () => void) => {
  const run = useUndoable();
  const { reload: reloadBadge } = useOverview();
  const showRef = useRef(show);
  showRef.current = show;
  const othersRef = useRef(onOthers);
  othersRef.current = onOthers;

  const undoKitchenMove = useCallback((before: Order, saved: UpdatedOrder, actionId: string) => run({
    apply: () => {
      showRef.current(before);
      return () => showRef.current(orderOnly(saved));
    },
    save: async () => {
      await undoKitchen(actionId);
      const fresh = await getOrder(before.code);
      if (fresh) showRef.current(fresh);
      if (movedOthers(before, saved.kitchen_effects)) othersRef.current?.();
      void reloadBadge();
    },
    text: '',
    undo: () => {},
    quiet: true,
  }), [run, reloadBadge]);

  const change = useCallback((order: Order, changes: OrderChanges, quiet = false): Promise<void> => {
    const after = applyLocal(order, changes);
    let saved: UpdatedOrder | null = null;
    return run({
      apply: () => {
        showRef.current(after);
        return () => showRef.current(order);
      },
      save: async () => {
        const answer = await updateOrder(order.id, changes);
        saved = answer;
        showRef.current(orderOnly(answer));
        if (movedOthers(order, answer.kitchen_effects)) othersRef.current?.();
        void reloadBadge();
      },
      text: () => {
        const more = effectsText(order, saved?.kitchen_effects ?? null);
        return more ? `${changeText(order, changes)}. ${more}` : changeText(order, changes);
      },
      undo: () => {
        const plan = undoPlanOf(order, changes, saved);
        if ('kitchen' in plan) void undoKitchenMove(order, saved!, plan.kitchen);
        else void change(saved ? orderOnly(saved) : after, plan.changes, true);
      },
      quiet,
    });
  }, [run, reloadBadge, undoKitchenMove]);

  return change;
};
