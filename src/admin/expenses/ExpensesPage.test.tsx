// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Expense } from '../types';
import ExpensesPage from './ExpensesPage';

const api = vi.hoisted(() => ({ getExpenses: vi.fn() }));
vi.mock('../api', async (original) => ({ ...await original<typeof import('../api')>(), ...api }));
vi.mock('./ExpenseSheet', () => ({ ExpenseSheet: () => null }));
vi.mock('../parts', async (original) => {
  const actual = await original<typeof import('../parts')>();
  return { ...actual, Skeleton: () => <p>Loading</p> };
});
const expense: Expense = { id: 'x', spent_on: '2026-11-14', spent_at: '10:00', title: 'Packaging', vendor: '', note: '', amount: 3200, created_at: '2026-11-14T10:00:00Z', updated_at: '2026-11-14T10:00:00Z' };
const deferred = <T,>() => { let resolve!: (value: T) => void; let reject!: (reason?: unknown) => void; const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; };
describe('expense totals filter association', () => {
  let root: Root; let container: HTMLDivElement;
  const render = () => act(() => root.render(<ExpensesPage />));
  const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
  beforeEach(async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    vi.useFakeTimers();
    api.getExpenses.mockReset().mockResolvedValue({ today: '2026-11-14', expenses: [expense] });
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); render(); await act(async () => { await flush(); });
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); vi.useRealTimers(); vi.restoreAllMocks(); });
  it('shows searched totals, then hides stale totals after changed filters and same-filter refresh failure', async () => {
    const search = container.querySelector('input[type="search"]')!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    const searched = { ...expense, amount: 875 };
    api.getExpenses.mockReturnValueOnce(Promise.resolve({ today: '2026-11-14', expenses: [searched] }));
    await act(async () => { setter.call(search, 'courier'); search.dispatchEvent(new Event('input', { bubbles: true })); vi.advanceTimersByTime(250); await flush(); });
    expect(container.textContent).toContain('₹875');
    expect(container.querySelector('.adm-exp__sum-label')?.textContent).toBe('“courier” · all time');
    const pendingRange = deferred<{ today: string; expenses: Expense[] }>();
    api.getExpenses.mockReturnValueOnce(pendingRange.promise);
    const thisMonth = [...container.querySelectorAll('label')].find((label) => label.textContent === 'This month')?.querySelector('input') as HTMLInputElement;
    await act(async () => { thisMonth.click(); await flush(); });
    expect(container.querySelector('.adm-exp__sum')).toBeNull();
    await act(async () => { pendingRange.resolve({ today: '2026-11-14', expenses: [searched] }); await flush(); });
    expect(container.querySelector('.adm-exp__sum')).not.toBeNull();
    expect(container.querySelector('.adm-exp__sum-label')?.textContent).toBe('“courier” · this month');
    const pendingSameFilter = deferred<never>();
    api.getExpenses.mockReturnValueOnce(pendingSameFilter.promise);
    await act(async () => { vi.advanceTimersByTime(11_000); window.dispatchEvent(new Event('focus')); await flush(); });
    // The focus refresh asks the same question the range change did, filters and all.
    const calls = api.getExpenses.mock.calls.map(([query]) => query);
    expect(calls[calls.length - 1]).toEqual(calls[calls.length - 2]);
    expect(calls[calls.length - 1]).toMatchObject({ search: 'courier' });
    await act(async () => { pendingSameFilter.reject({ message: 'offline' }); await flush(); });
    expect(container.querySelector('.adm-exp__sum')).not.toBeNull();
    expect(container.textContent).toContain('Could not refresh expenses.');
  });
});
