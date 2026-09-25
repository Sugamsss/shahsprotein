import { describe, expect, it } from 'vitest';
import { AdminError } from './api';
import type { ToastApi } from './toast';
import { runUndoable, type UndoableRun } from './useUndoable';

// The one-tap change contract (spec 2.3): on screen at once, Undo after a save,
// back as it was when the save fails.

const setup = (save: () => Promise<unknown>, quiet = false) => {
  const screen = { value: 'before' };
  const shown: Parameters<ToastApi['show']>[0][] = [];
  const retries: (() => void)[] = [];
  const toast: ToastApi = { show: (t) => shown.push(t), error: (retry) => retry && retries.push(retry) };
  let undone = 0;
  const run: UndoableRun = {
    apply: () => { screen.value = 'after'; return () => { screen.value = 'before'; }; },
    save,
    text: "Anjali's order is confirmed",
    undo: () => { undone += 1; },
    quiet,
  };
  return { screen, shown, retries, toast, run, undone: () => undone };
};

describe('runUndoable', () => {
  it('keeps the change and offers Undo once it saves', async () => {
    const t = setup(() => Promise.resolve());
    await runUndoable(t.toast, t.run);
    expect(t.screen.value).toBe('after');
    expect(t.shown.map((s) => s.text)).toEqual(["Anjali's order is confirmed"]);
    t.shown[0].action?.onAction();
    expect(t.undone()).toBe(1);
  });

  it('shows no Undo toast for an Undo (quiet)', async () => {
    const t = setup(() => Promise.resolve(), true);
    await runUndoable(t.toast, t.run);
    expect(t.shown).toEqual([]);
  });

  it('puts it back and shows the server message as it is', async () => {
    const t = setup(() => Promise.reject(new AdminError('message', 'That order code doesn’t look right.')));
    await runUndoable(t.toast, t.run);
    expect(t.screen.value).toBe('before');
    expect(t.shown).toEqual([{ text: 'That order code doesn’t look right.' }]);
    expect(t.retries).toEqual([]);
  });

  it('puts it back on a network failure, and Try again repeats the same run', async () => {
    let calls = 0;
    const t = setup(() => (calls++ === 0 ? Promise.reject(new AdminError('network')) : Promise.resolve()), true);
    await runUndoable(t.toast, t.run);
    expect(t.screen.value).toBe('before');
    expect(t.retries).toHaveLength(1);

    t.retries[0]();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(t.screen.value).toBe('after');
    expect(t.shown).toEqual([]); // still quiet: a failed Undo retries as an Undo
  });
});
