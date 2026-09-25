import { useCallback, useRef } from 'react';
import { adminCopy } from '../../data/adminCopy';
import { toAdminError, updateOrder } from '../api';
import { useOverview } from '../AdminLayout';
import { useToast } from '../toast';
import type { Order, OrderChanges } from '../types';
import { applyLocal, changeText, reverseOf } from './model';

/**
 * One-tap changes (spec 2.3): show it at once, save it, then offer Undo, which
 * sends the reverse keys. On failure the order goes back and the error toast
 * offers Try again. `show` puts an order on screen (the list, the detail).
 */
export const useOrderChange = (show: (order: Order) => void) => {
  const toast = useToast();
  const { reload: reloadBadge } = useOverview();
  const showRef = useRef(show);
  showRef.current = show;

  const change = useCallback(async (order: Order, changes: OrderChanges, quiet = false): Promise<void> => {
    showRef.current(applyLocal(order, changes));
    try {
      const saved = await updateOrder(order.id, changes);
      showRef.current(saved);
      void reloadBadge();
      if (quiet) return; // an Undo: the toast already says "Undone."
      toast.show({
        text: changeText(order, changes),
        action: { label: adminCopy.toast.undo, onAction: () => void change(saved, reverseOf(order, changes), true) },
      });
    } catch (err) {
      showRef.current(order);
      const error = toAdminError(err);
      if (error.kind === 'message') toast.show({ text: error.message });
      else toast.error(() => void change(order, changes, quiet));
    }
  }, [toast, reloadBadge]);

  return change;
};
