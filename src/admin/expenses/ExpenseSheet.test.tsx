// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminCopy } from '../../data/adminCopy';
import type { Expense } from '../types';

// The delete leaves through the same door on its first try and on Try again, and
// the date field reads the clock again after midnight. Both were quiet bugs.
// The toast is real here (inside the sheet's own bar), so a failure is followed
// the way a person follows it: find Try again, focus it, tap it.
//
// available.ts keeps what it learned about the vendors column for the page session,
// so each case loads its own copy of the sheet (and of the toast it renders inside,
// or the fresh sheet would sit outside the provider's context). The memory still
// holds between mounts within one case: that is the sheet opened again.

const api = vi.hoisted(() => ({
  deleteExpense: vi.fn(), saveExpense: vi.fn(), toAdminError: vi.fn(), getExpenseVendors: vi.fn(),
}));
vi.mock('../api', () => api);
vi.mock('../unsavedWork', () => ({ useUnsavedWork: () => undefined }));
// The pickers have their own frame; here only what the sheet hands them matters.
vi.mock('./PickerSheet', () => ({
  PickerSheet: ({ children, bar }: React.PropsWithChildren<{ bar?: React.ReactNode }>) => <section>{children}{bar}</section>,
}));

const copy = adminCopy.expenses;

type SheetModule = typeof import('./ExpenseSheet');
type ToastModule = typeof import('../toast');
let Sheet!: SheetModule['ExpenseSheet'];
let Toasts!: ToastModule['ToastProvider'];

const expense: Expense = {
  id: 'e-1', spent_on: '2026-11-13', spent_at: '10:00', title: 'Zip pouches', vendor: '', note: '', amount: 3200,
  created_at: '2026-11-13T10:00:00Z', updated_at: '2026-11-13T10:00:00Z',
};

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};

describe('expense sheet', () => {
  let root: Root;
  let container: HTMLDivElement;

  const flush = async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  };

  const renderSheet = (today = '2026-11-14', row: Expense = expense) => {
    const props = { expense: row, today, onSaved: vi.fn(), onDeleted: vi.fn(), onClose: vi.fn() };
    act(() => root.render(<Toasts><Sheet {...props} /></Toasts>));
    return props;
  };

  /** The sheet is opened again from the list: a fresh mount, with the module's memory kept. */
  const remountSheet = () => {
    act(() => root.unmount());
    container.remove();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    return renderSheet();
  };

  // The real sheet is portalled to <body>, so everything lives in the document.
  const byText = (text: string) => [...document.querySelectorAll('button')]
    .find((button) => button.textContent?.trim() === text);
  const saveButton = () => byText(copy.saveEdit);
  const deleteButton = () => byText(copy.delete);
  const retryButton = () => byText(adminCopy.toast.retry);
  const dateField = () => document.querySelector('button[aria-haspopup="dialog"]') as HTMLButtonElement;
  const vendorBox = () => document.querySelector('input[role="combobox"]') as HTMLInputElement | null;
  const typeInto = async (element: HTMLInputElement, text: string) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => {
      setter.call(element, text);
      element.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };

  it('preserves a typed vendor and blocks save after an inconclusive first vendors check', async () => {
    const pending = deferred<never>();
    api.getExpenseVendors.mockReturnValue(pending.promise);
    api.toAdminError.mockReturnValue({ kind: 'network', message: 'Offline' });
    // An expense that already has one: the value is in the form before the read.
    renderSheet('2026-11-14', { ...expense, vendor: 'Satara Packaging' });
    expect(vendorBox()!.disabled).toBe(true);
    expect(saveButton()!.disabled).toBe(true);
    await act(async () => { pending.reject(new Error('offline')); await Promise.resolve(); });
    expect(vendorBox()?.value).toBe('Satara Packaging');
    expect(vendorBox()?.disabled).toBe(true);
    expect(saveButton()!.disabled).toBe(true);
    await act(async () => { saveButton()!.click(); await flush(); });
    expect(api.saveExpense).not.toHaveBeenCalled();
  });

  beforeEach(async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    vi.stubGlobal('matchMedia', () => ({
      matches: false, media: '', onchange: null,
      addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
    }));
    api.deleteExpense.mockReset();
    api.saveExpense.mockReset();
    // The Vendor field waits for this answer; no vendors is a real answer ('' is fine).
    api.getExpenseVendors.mockReset().mockResolvedValue([]);
    api.toAdminError.mockReset().mockReturnValue({ kind: 'message', message: "That didn't save." });
    vi.resetModules();
    Sheet = (await import('./ExpenseSheet')).ExpenseSheet;
    Toasts = (await import('../toast')).ToastProvider;
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

  it('saves the vendor it was given, tidied the way the server stores it', async () => {
    api.saveExpense.mockResolvedValue(undefined);
    renderSheet();
    // The field waits for the vendors read, so it is there once that answer lands.
    await act(async () => { await Promise.resolve(); });
    expect(vendorBox()).not.toBeNull();

    await typeInto(vendorBox()!, '  Satara   Packaging ');
    await act(async () => { saveButton()!.click(); await flush(); });

    expect(api.saveExpense).toHaveBeenCalledTimes(1);
    expect(api.saveExpense.mock.calls[0][0]).toMatchObject({ vendor: 'Satara Packaging' });
  });

  it('says a vendor is too long and keeps the sheet open', async () => {
    api.saveExpense.mockResolvedValue(undefined);
    renderSheet();
    await act(async () => { await Promise.resolve(); });
    await typeInto(vendorBox()!, 'v'.repeat(81));

    await act(async () => { saveButton()!.click(); await flush(); });

    expect(api.saveExpense).not.toHaveBeenCalled();
    expect(document.querySelector('.adm-field__error')?.textContent).toBe(copy.vendorLong);
    expect(vendorBox()!.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(vendorBox());
  });

  it('keeps Vendor and Save working when a later read fails after one has confirmed the column', async () => {
    api.saveExpense.mockResolvedValue(undefined);
    renderSheet();
    await act(async () => { await Promise.resolve(); });
    expect(vendorBox()!.disabled).toBe(false);

    // Opened again while the vendors call is down: the column was proved earlier, so
    // the field and Save must not go dead with it.
    api.getExpenseVendors.mockRejectedValue(new Error('offline'));
    api.toAdminError.mockReturnValue({ kind: 'network', message: 'Offline' });
    remountSheet();
    expect(vendorBox()!.disabled).toBe(false);
    expect(saveButton()!.disabled).toBe(false);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(vendorBox()!.disabled).toBe(false);
    expect(saveButton()!.disabled).toBe(false);

    await typeInto(vendorBox()!, 'Satara Packaging');
    await act(async () => { saveButton()!.click(); await flush(); });
    expect(api.saveExpense).toHaveBeenCalledTimes(1);
    expect(api.saveExpense.mock.calls[0][0]).toMatchObject({ vendor: 'Satara Packaging' });
  });

  it('keeps typed vendor data and blocks save when the pending vendors check reports missing', async () => {
    // An earlier read in this session already confirmed the column. Say so here, and
    // find the sheet waiting open, rather than trust whatever ran before this case.
    renderSheet();
    await act(async () => { await Promise.resolve(); });
    expect(vendorBox()!.disabled).toBe(false);

    const pending = deferred<never>();
    api.getExpenseVendors.mockReturnValue(pending.promise);
    api.toAdminError.mockReturnValue({ kind: 'missing', message: 'Not set up' });
    remountSheet();
    const field = vendorBox()!;
    expect(field).not.toBeNull();
    expect(field.disabled).toBe(false);
    await typeInto(field, 'Satara Packaging');
    // The column was proved, so the field and Save wait open while this one asks; the
    // answer is what takes the field away.
    expect(saveButton()!.disabled).toBe(false);
    await act(async () => { pending.reject({ code: 'PGRST202' }); await Promise.resolve(); });
    expect(vendorBox()?.value).toBe('Satara Packaging');
    expect(saveButton()!.disabled).toBe(true);
    expect(vendorBox()?.disabled).toBe(true);
    await act(async () => { saveButton()!.click(); await flush(); });
    expect(api.saveExpense).not.toHaveBeenCalled();
  });

  it('leaves the vendor field out, and sends no vendor, while the vendors read is missing', async () => {
    // A database without 20261114000001: the column isn't there, so the field isn't either.
    api.toAdminError.mockReturnValue({ kind: 'missing', message: 'Not set up' });
    api.getExpenseVendors.mockRejectedValue({ code: 'PGRST202' });
    api.saveExpense.mockResolvedValue(undefined);
    renderSheet();
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(vendorBox()).toBeNull();

    await act(async () => { saveButton()!.click(); await flush(); });
    expect(api.saveExpense).toHaveBeenCalledTimes(1);
    expect(Object.prototype.hasOwnProperty.call(api.saveExpense.mock.calls[0][0], 'vendor')).toBe(false);
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
