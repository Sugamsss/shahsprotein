// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExpenseVendor } from '../types';

// The Vendor field may only be used once a read has proved the column is there. A
// failure proves nothing: the typed value stays, Save waits, and no vendor reaches
// an older save that would drop it. The module remembers a confirmed answer for the
// page session, so each case here loads its own copy of it.

const api = vi.hoisted(() => ({ getExpenseVendors: vi.fn(), getExpenses: vi.fn(), toAdminError: vi.fn() }));
vi.mock('../api', () => api);

type State = { vendors: ExpenseVendor[]; show: boolean; ready: boolean };

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};

describe('the vendors read', () => {
  let roots: Root[];
  let hosts: HTMLDivElement[];
  let box: { state: State | null };

  const mount = (useExpenseVendors: () => State) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const Probe: React.FC = () => { box.state = useExpenseVendors(); return null; };
    act(() => root.render(<Probe />));
    roots.push(root);
    hosts.push(host);
  };

  const load = async () => {
    vi.resetModules();
    return (await import('./available')).useExpenseVendors;
  };

  const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    api.getExpenseVendors.mockReset();
    api.getExpenses.mockReset();
    api.toAdminError.mockReset().mockReturnValue({ kind: 'network', message: 'Offline' });
    box = { state: null };
    roots = [];
    hosts = [];
  });

  afterEach(() => {
    roots.forEach((root) => act(() => root.unmount()));
    hosts.forEach((host) => host.remove());
    vi.restoreAllMocks();
  });

  it('does not call a failed first read proof that the column is there', async () => {
    const pending = deferred<ExpenseVendor[]>();
    api.getExpenseVendors.mockReturnValue(pending.promise);
    mount(await load());

    // The box shows while the read is out, but nothing may be sent yet.
    expect(box.state).toMatchObject({ show: true, ready: false });
    await act(async () => { pending.reject(new Error('offline')); await Promise.resolve(); });
    expect(box.state).toMatchObject({ show: false, ready: false });
    expect(box.state?.vendors).toEqual([]);
  });

  it('takes the field away only when the database says the column is missing', async () => {
    api.getExpenseVendors.mockRejectedValue({ code: 'PGRST202' });
    api.toAdminError.mockReturnValue({ kind: 'missing', message: 'Not set up' });
    mount(await load());
    await flush();
    expect(box.state).toMatchObject({ show: false, ready: true });
  });

  it('turns the field on from an answer that arrived', async () => {
    api.getExpenseVendors.mockResolvedValue([{ name: 'Satara Packaging', count: 4, last_used: '2026-11-14' }]);
    mount(await load());
    await flush();
    expect(box.state).toMatchObject({ show: true, ready: true });
    expect(box.state?.vendors).toHaveLength(1);
  });

  it('keeps a column an earlier read confirmed when a later read fails', async () => {
    const hook = await load();
    api.getExpenseVendors.mockResolvedValue([]);
    mount(hook);
    await flush();
    expect(box.state).toMatchObject({ show: true, ready: true });

    // The sheet is opened again while the call is down: the field keeps working,
    // because the column was already proved.
    api.getExpenseVendors.mockRejectedValue(new Error('offline'));
    mount(hook);
    expect(box.state).toMatchObject({ show: true, ready: true });
    await flush();
    expect(box.state).toMatchObject({ show: true, ready: true });
  });
});
