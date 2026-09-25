import { useCallback, useRef } from 'react';
import { updateOrder } from '../api';
import { useOverview } from '../AdminLayout';
import type { Order, OrderChanges } from '../types';
import { useUndoable } from '../useUndoable';
import { applyLocal, changeText, reverseOf } from './model';

/**
 * One-tap changes to an order, on the shared useUndoable: show it at once, save
 * it, offer Undo (the reverse keys), and go back on failure. `show` puts an
 * order on screen (the list, the detail); a save also refreshes the badge.
 */
export const useOrderChange = (show: (order: Order) => void) => {
  const run = useUndoable();
  const { reload: reloadBadge } = useOverview();
  const showRef = useRef(show);
  showRef.current = show;

  const change = useCallback((order: Order, changes: OrderChanges, quiet = false): Promise<void> => {
    const after = applyLocal(order, changes);
    return run({
      apply: () => {
        showRef.current(after);
        return () => showRef.current(order);
      },
      save: async () => {
        showRef.current(await updateOrder(order.id, changes));
        void reloadBadge();
      },
      text: changeText(order, changes),
      undo: () => void change(after, reverseOf(order, changes), true),
      quiet,
    });
  }, [run, reloadBadge]);

  return change;
};
