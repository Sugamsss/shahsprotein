// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminCopy } from '../../data/adminCopy';
import type { Expense } from '../types';
import { ToastProvider } from '../toast';
import { ExpenseSheet } from './ExpenseSheet';

// The delete leaves through the same door on its first try and on Try again, and
// the date field reads the clock again after midnight. Both were quiet bugs.
// The toast is real here (inside the sheet's own bar), so a failure is followed
// the way a person follows it: find Try again, focus it, tap it.

const api = vi.hoisted(() => ({ deleteExpense: vi.fn(), saveExpense: vi.fn(), toAdminError: vi.fn() }));
vi.mock('../api', () => api);
vi.mock('../unsavedWork', () => ({ useUnsavedWork: () => undefined }));
// The pickers have their own frame; here only what the sheet hands them matters.
vi.mock('./PickerSheet', () => ({
  PickerSheet: ({ children, bar }: React.PropsWithChildren<{ bar?: React.ReactNode }>) => <section>{children}{bar}</section>,
}));

const copy = adminCopy.expenses;

const expense: Expense = {
  id: 'e-1', spent_on: '2026-11-13', spent_at: '10:00', title: 'Zip pouches', note: '', amount: 3200,
  created_at: '2026-11-13T10:00:00Z', updated_at: '2026-11-13T10:00:00Z',
};

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
};

describe('expense sheet', () => {
  let root: Root;
  let container: HTMLDivElement;

  const flush = async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  };

  const renderSheet = (today = '2026-11-14') => {
    const props = { expense, today, onSaved: vi.fn(), onDeleted: vi.fn(), onClose: vi.fn() };
    act(() => root.render(<ToastProvider><ExpenseSheet {...props} /></ToastProvider>));
    return props;
  };

  // The real sheet is portalled to <body>, so everything lives in the document.
  const byText = (text: string) => [...document.querySelectorAll('button')]
    .find((button) => button.textContent?.trim() === text);
  const saveButton = () => byText(copy.saveEdit);
  const deleteButton = () => byText(copy.delete);
  const retryButton = () => byText(adminCopy.toast.retry);
  const dateField = () => document.querySelector('button[aria-haspopup="dialog"]') as HTMLButtonElement;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    vi.stubGlobal('matchMedia', () => ({
      matches: false, media: '', onchange: null,
      addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
    }));
    api.deleteExpense.mockReset();
    api.saveExpense.mockReset();
    api.toAdminError.mockReset().mockReturnValue({ kind: 'message', message: "That didn't save." });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('holds the sheet while the delete waits, then closes it once the row is gone', async () => {
    const pending = deferred<void>();
    api.deleteExpense.mockReturnValue(pending.promise);
    const props = renderSheet();

    act(() => deleteButton()!.click());
    expect(deleteButton()!.disabled).toBe(true);
    expect(byText(copy.saving)!.disabled).toBe(true);
    expect(props.onClose).not.toHaveBeenCalled();

    await act(async () => { pending.resolve(); await pending.promise; });
    expect(api.deleteExpense).toHaveBeenCalledWith('e-1', true);
    expect(props.onDeleted).toHaveBeenCalledTimes(1);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('puts Try again inside the sheet, where a tap and Tab can reach it', async () => {
    api.toAdminError.mockReturnValue({ kind: 'network', message: 'Network' });
    api.deleteExpense.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
    const props = renderSheet();

    await act(async () => { deleteButton()!.click(); await flush(); });
    expect(props.onClose).not.toHaveBeenCalled();
    expect(deleteButton()!.disabled).toBe(false);
    expect(saveButton()!.disabled).toBe(false);

    const retry = retryButton()!;
    expect(retry).toBeTruthy();
    // In the dialog, not the page toast hidden behind the sheet's scrim…
    expect(retry.closest('[role="dialog"]')).not.toBeNull();
    // …and in the pinned bar, inside the sheet's clipped box.
    expect(retry.closest('.adm-sheet__bar')).not.toBeNull();
    // A native button in the dialog's focus trap, so Tab reaches it.
    expect(retry.disabled).toBe(false);
    expect(retry.tabIndex).toBe(0);
    act(() => retry.focus());
    expect(document.activeElement).toBe(retry);

    act(() => retry.click());
    await act(async () => { await new Promise((done) => setTimeout(done, 0)); });
    expect(api.deleteExpense).toHaveBeenCalledTimes(2);
    expect(api.deleteExpense).toHaveBeenLastCalledWith('e-1', true);
    expect(props.onDeleted).toHaveBeenCalledTimes(1);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('reads the clock again when the day turns over', async () => {
    vi.useFakeTimers();
    // 00:01 on 14 Nov in India, a day on from the one the page opened on.
    vi.setSystemTime(new Date('2026-11-13T18:31:00Z'));
    renderSheet('2026-11-13');

    expect(dateField().textContent).toBe(copy.yesterday);
    act(() => dateField().click());
    const todayButton = byText(copy.todayButton)!;
    expect(todayButton).not.toBe(dateField());
    act(() => todayButton.click());
    expect(dateField().textContent).toBe(copy.today);
  });
});
