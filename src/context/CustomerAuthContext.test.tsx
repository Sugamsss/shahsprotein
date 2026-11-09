// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomerAuthProvider, useCustomerAuth } from './CustomerAuthContext';

const authState = vi.hoisted(() => ({
  listener: null as null | ((event: string, session: { user: { id: string } } | null) => void),
  request: vi.fn(),
  verify: vi.fn(),
  signOut: vi.fn(),
  current: vi.fn(),
}));

vi.mock('../services/customerAuthClient', () => ({
  currentCustomerSession: () => authState.current(),
  getCustomerAuthClient: () => ({
    auth: {
      onAuthStateChange: (listener: (event: string, session: { user: { id: string } } | null) => void) => {
        authState.listener = listener;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
    },
  }),
  requestCustomerOtp: (phone: string) => authState.request(phone),
  verifyCustomerOtp: (phone: string, token: string) => authState.verify(phone, token),
  signOutCustomer: () => authState.signOut(),
}));

describe('CustomerAuthContext', () => {
  let root: Root;
  let container: HTMLDivElement;
  let value: ReturnType<typeof useCustomerAuth>;

  function Capture() { value = useCustomerAuth(); return null; }

  const render = () => act(() => root.render(<CustomerAuthProvider><Capture /></CustomerAuthProvider>));

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    authState.listener = null;
    authState.request.mockReset().mockResolvedValue({ error: null });
    authState.verify.mockReset().mockResolvedValue({ data: { session: null }, error: new Error('bad code') });
    authState.signOut.mockReset().mockResolvedValue(undefined);
    authState.current.mockReset().mockResolvedValue(null);
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    render();
  });

  afterEach(() => { act(() => root.unmount()); container.remove(); });

  it('finishes loading as a guest when no session is kept', async () => {
    expect(value.loading).toBe(true);
    await act(async () => undefined);
    expect(value.loading).toBe(false);
    expect(value.session).toBeNull();
  });

  it('reports a failed code request and a failed code check without inventing a session', async () => {
    await act(async () => undefined);
    authState.request.mockResolvedValueOnce({ error: new Error('unavailable') });
    await act(async () => { expect(await value.requestOtp('+919800000003')).toBe(false); });
    await act(async () => { expect(await value.verifyOtp('+919800000003', '000000')).toBe(false); });
    expect(value.session).toBeNull();
  });

  it('keeps the verified session in memory and drops it on logout', async () => {
    await act(async () => undefined);
    const session = { user: { id: '00000000-0000-4000-8000-000000000002' } };
    authState.verify.mockResolvedValueOnce({ data: { session }, error: null });
    await act(async () => { expect(await value.verifyOtp('+919800000003', '123456')).toBe(true); });
    expect(value.session).toEqual(session);
    await act(async () => { await value.logout(); });
    expect(authState.signOut).toHaveBeenCalledTimes(1);
    expect(value.session).toBeNull();
  });

  it('follows the auth client when it changes session', async () => {
    await act(async () => undefined);
    const session = { user: { id: '00000000-0000-4000-8000-000000000003' } };
    act(() => authState.listener?.('SIGNED_IN', session));
    expect(value.session).toEqual(session);
    act(() => authState.listener?.('SIGNED_OUT', null));
    expect(value.session).toBeNull();
  });
});
