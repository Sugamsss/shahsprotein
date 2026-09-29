import { useCallback } from 'react';
import { adminCopy } from '../../data/adminCopy';
import { undoKitchen } from '../api';
import { useToast } from '../toast';
import type { Kitchen, KitchenEffects } from '../types';
import { useUndoable } from '../useUndoable';

/**
 * After a kitchen change saved (a log, a fix, a delete, a write-off): show the kitchen
 * it left, and the toast with an exact Undo (undo_admin_kitchen). If something moved
 * since, the server's plain sentence shows in place of "Undone.".
 * `onKitchen` puts a kitchen on screen and refreshes the rest of the page.
 */
export const useKitchenDone = (onKitchen: (kitchen: Kitchen) => void) => {
  const toast = useToast();
  const run = useUndoable();
  return useCallback((effects: KitchenEffects, text: string) => {
    onKitchen(effects.kitchen);
    const actionId = effects.action_id;
    toast.show({
      text,
      action: actionId ? {
        label: adminCopy.toast.undo,
        onAction: () => void run({
          apply: () => () => {},
          save: async () => onKitchen((await undoKitchen(actionId)).kitchen),
          text: '',
          undo: () => {},
          quiet: true,
        }),
      } : undefined,
    });
  }, [toast, run, onKitchen]);
};
