import { useCallback } from 'react';
import { adminCopy } from '../data/adminCopy';
import { toAdminError } from './api';
import { useToast, type ToastApi } from './toast';

// One-tap changes, the same everywhere (spec 2.3): show it at once, save it,
// then offer Undo. If the save fails the change goes back: a message from the
// server (22023) shows as it is, anything else gets "That didn't save" with Try again.

export interface UndoableRun {
  /** Shows the change now. Returns how to take it back. */
  apply: () => () => void;
  /** Saves it. Put the saved answer on screen in here. */
  save: () => Promise<unknown>;
  /** The toast sentence, e.g. "Anjali's order is confirmed". */
  text: string;
  /** The reverse, usually the same kind of run with `quiet: true`. */
  undo: () => void;
  /** An Undo: no new Undo toast, since the toast already says "Undone.". */
  quiet?: boolean;
}

export const runUndoable = async (toast: ToastApi, run: UndoableRun): Promise<void> => {
  const rollback = run.apply();
  try {
    await run.save();
  } catch (err) {
    rollback();
    const error = toAdminError(err);
    if (error.kind === 'message') toast.show({ text: error.message });
    else toast.error(() => void runUndoable(toast, run)); // the same run, quiet or not
    return;
  }
  if (!run.quiet) toast.show({ text: run.text, action: { label: adminCopy.toast.undo, onAction: run.undo } });
};

export const useUndoable = (): ((run: UndoableRun) => Promise<void>) => {
  const toast = useToast();
  return useCallback((run: UndoableRun) => runUndoable(toast, run), [toast]);
};
