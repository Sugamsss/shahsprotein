// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomerLogin, safeReturnTo } from './CustomerLogin';
import { customerLoginCopy } from '../../data/customerAuthCopy';

const authState = vi.hoisted(() => ({
  session: null as { user: { id: string } } | null,
  request: vi.fn(),
  verify: vi.fn(),
}));

vi.mock('../../context/CustomerAuthContext', () => ({
  useCustomerAuth: () => ({
    session: authState.session,
    loading: false,
    requestOtp: (phone: string) => authState.request(phone),
    verifyOtp: (phone: string, code: string) => authState.verify(phone, code),
    logout: async () => undefined,
  }),
}));

describe('CustomerLogin', () => {
  let root: Root;
  let container: HTMLDivElement;
  let path = '';

  function LocationProbe() { const location = useLocation(); path = `${location.pathname}${location.search}${location.hash}`; return null; }

  const render = (entry = '/login?return=%2F%23products') => act(() => root.render(
    <MemoryRouter initialEntries={[entry]}>
      <CustomerLogin />
      <LocationProbe />
    </MemoryRouter>,
  ));
  const type = (element: HTMLInputElement, text: string) => act(() => {
    // The prototype setter bypasses React's value tracker, so onChange really fires.
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(element, text);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const submit = () => act(() => {
    const form = container.querySelector('form')!;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    authState.session = null;
    authState.request.mockReset().mockResolvedValue(true);
    authState.verify.mockReset().mockResolvedValue(true);
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => { act(() => root.unmount()); container.remove(); });

  it('sends the code to an Indian number in E.164 form', async () => {
    render();
    type(container.querySelector<HTMLInputElement>('input[type="tel"]')!, '98765 43210');
    await submit();
    expect(authState.request).toHaveBeenCalledWith('+919876543210');
    expect(container.querySelector('input[inputmode="numeric"]')).not.toBeNull();
  });

  it('says a wrong code did not work, and stays on the code step', async () => {
    authState.verify.mockResolvedValueOnce(false);
    render();
    type(container.querySelector<HTMLInputElement>('input[type="tel"]')!, '9876543210');
    await submit();
    type(container.querySelector<HTMLInputElement>('input[inputmode="numeric"]')!, '000000');
    await submit();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(customerLoginCopy.invalid);
    expect(path).toBe('/login?return=%2F%23products');
  });

  it('returns to the order popup after a verified login', async () => {
    render();
    type(container.querySelector<HTMLInputElement>('input[type="tel"]')!, '9876543210');
    await submit();
    type(container.querySelector<HTMLInputElement>('input[inputmode="numeric"]')!, '123456');
    authState.verify.mockResolvedValueOnce(true);
    authState.session = { user: { id: '00000000-0000-4000-8000-000000000002' } };
    await submit();
    render();
    expect(path).not.toContain('/login');
  });

  it('keeps a guest on the page and ignores a protocol-relative return path', async () => {
    render('/login?return=%2F%2Fevil.invalid');
    const guest = Array.from(container.querySelectorAll('a')).find((link) => link.textContent === customerLoginCopy.guest);
    expect(guest?.getAttribute('href')).toBe('/');
    expect(container.textContent).toContain(customerLoginCopy.body);
  });

  it.each([
    ['a backslash-escaped host', '/login?return=%2F%5Cevil.invalid'],
    ['a tab-joined host', '/login?return=%2F%09%2Fevil.invalid'],
    ['an absolute URL', '/login?return=https%3A%2F%2Fevil.invalid%2Forders'],
  ])('refuses %s in the return path', (_label, entry) => {
    render(entry);
    const guest = Array.from(container.querySelectorAll('a')).find((link) => link.textContent === customerLoginCopy.guest);
    expect(guest?.getAttribute('href')).toBe('/');
  });

  it('parses the return path the way the browser does', () => {
    const base = 'https://www.shahsnutrition.food';
    expect(safeReturnTo('/#products', base)).toBe('/#products');
    expect(safeReturnTo('/login?next=%2Fx', base)).toBe('/login?next=%2Fx');
    for (const raw of ['//evil.invalid', '/\\evil.invalid', '/\t/evil.invalid', 'https://evil.invalid/x', 'javascript:alert(1)', ''])
      expect(safeReturnTo(raw, base), raw).toBe('/');
  });
});
