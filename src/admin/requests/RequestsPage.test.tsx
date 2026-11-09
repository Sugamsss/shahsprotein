// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RequestsPage from './RequestsPage';
import type { WebsiteRequest, WebsiteRequestPage } from '../types';
import type { OrderQuoteSnapshot } from '../../types/offer';

const api = vi.hoisted(() => ({
  getWebsiteRequests: vi.fn(), getWebsiteRequest: vi.fn(),
  confirmWebsiteRequest: vi.fn(), dismissWebsiteRequest: vi.fn(), getAdminWebsiteQuote: vi.fn(), navigate: vi.fn(),
}));
const toast = vi.hoisted(() => ({ show: vi.fn(), error: vi.fn() }));
vi.mock('../api', () => api);
vi.mock('react-router-dom', async (original) => ({
  ...await original<typeof import('react-router-dom')>(),
  useNavigate: () => api.navigate,
}));
vi.mock('../AdminSheet', () => ({ AdminSheet: ({ isOpen, title, children, bar, onClose }: React.PropsWithChildren<any>) => isOpen ? <section role="dialog" aria-label={title}><button aria-label="Close" onClick={onClose}>Close</button>{children}{bar}</section> : null }));
vi.mock('../parts', () => ({ LoadError: ({ onRetry }: { onRetry: () => void }) => <button onClick={onRetry}>Retry</button>, Skeleton: () => <p>Loading list</p> }));
vi.mock('../toast', () => ({
  ToastSlot: () => <div data-testid="toast-slot" />,
  useToast: () => toast,
}));
vi.mock('../unsavedWork', () => ({ useUnsavedWork: () => undefined }));

const address = { premises: '12 A', area: 'Main road', city: 'Satara', state: 'Maharashtra', pincode: '415001', landmark: '' };
const request = (id: string, overrides: Partial<WebsiteRequest> = {}): WebsiteRequest => ({
  id, code: `SN-${id}`, message_code: 'm', name: `Name ${id}`, phone: '9876543210', delivery_address: address,
  lines: [{ product_id: 'raggi-jaggi', size: '250 g', quantity: 1 }], coupon_code: null,
  created_at: '2026-10-22T10:00:00Z', state: 'pending', ...overrides,
});
const page = (requests: WebsiteRequest[], next_before: string | null = null, next_before_id?: string): WebsiteRequestPage => ({ requests, next_before, next_before_id });

/** One Muesli 250 g at the guest rate: ₹359 + ₹50 delivery = ₹409, ₹40 off the MRP. */
const quote: OrderQuoteSnapshot = {
  quote_id: 'q-1', expires_at: '2026-10-22T10:15:00Z', version: 'v1', offer_kind: 'guest', coupon_code: null,
  free_delivery_rule: { min_grams: 500, min_packs: null, up_to_250: 50, above_250: 70, cap: 70 },
  lines: [{ product_id: 'muesli', size: '250 g', quantity: 1, grams: 250, mrp: 399, unit_price: 359, line_total: 359 }],
  catalogue: [{ product_id: 'muesli', size: '250 g', mrp: 399, unit_price: 359 }],
  mrp_total: 399, items_total: 359, savings: 40, grams: 250, packs: 1,
  delivery_base: 50, delivery_waived: false, delivery_fee: 50, total: 409, currency: 'INR',
};
const deferred = <T,>() => { let resolve!: (v: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; };
const flush = async () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

describe('website requests owner flow', () => {
  let root: Root; let container: HTMLDivElement;
  const render = () => act(() => root.render(<MemoryRouter><RequestsPage /></MemoryRouter>));
  const button = (label: string) => [...container.querySelectorAll('button')].find((b) => b.textContent?.includes(label)) as HTMLButtonElement;
  const input = (label: string) => [...container.querySelectorAll('label')].find((l) => l.textContent?.includes(label))?.querySelector('input') as HTMLInputElement;
  const change = (el: HTMLInputElement, value: string) => act(() => { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!; setter.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); });
  beforeEach(async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    api.getWebsiteRequests.mockReset().mockResolvedValue(page([request('A'), request('B')], 'cursor-1', 'B'));
    api.getWebsiteRequest.mockReset().mockImplementation(async (id: string) => request(id));
    api.confirmWebsiteRequest.mockReset(); api.dismissWebsiteRequest.mockReset(); api.navigate.mockReset(); toast.show.mockReset();
    api.getAdminWebsiteQuote.mockReset();
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); render(); await flush();
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); });

  it('ignores a detail response after the owner closes its sheet', async () => {
    const pending = deferred<WebsiteRequest | null>(); api.getWebsiteRequest.mockReturnValueOnce(pending.promise);
    act(() => button('SN-A').click()); await flush();
    act(() => button('Close').click());
    await act(async () => { pending.resolve(request('A', { name: 'Late detail' })); await pending.promise; });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('keeps B selected when A detail resolves after B', async () => {
    const a = deferred<WebsiteRequest | null>();
    api.getWebsiteRequest.mockImplementation((id: string) => id === 'A' ? a.promise : Promise.resolve(request('B')));
    act(() => button('SN-A').click()); act(() => button('SN-B').click());
    await flush();
    change(input('Name'), 'B detail');
    await act(async () => { a.resolve(request('A', { name: 'A late detail' })); await a.promise; });
    expect(input('Name').value).toBe('B detail');
  });

  it('does not allow details still loading to replace owner edits', async () => {
    const pending = deferred<WebsiteRequest | null>(); api.getWebsiteRequest.mockReturnValueOnce(pending.promise);
    act(() => button('SN-A').click()); await flush();
    expect(input('Name').closest('fieldset')?.disabled).toBe(true);
    await act(async () => { pending.resolve(request('A', { name: 'Server detail' })); await pending.promise; });
    change(input('Name'), 'Corrected name');
    expect(input('Name').value).toBe('Corrected name');
  });

  it('requires a valid phone, complete delivery address and receipt acknowledgement before confirming', async () => {
    const invalid = request('A', { phone: null, delivery_address: null, pincode: null });
    api.getWebsiteRequests.mockResolvedValue(page([invalid]));
    act(() => root.unmount());
    api.getWebsiteRequests.mockReset().mockResolvedValue(page([invalid]));
    api.getWebsiteRequest.mockReset().mockResolvedValue(invalid);
    root = createRoot(container); render(); await flush();
    act(() => button('SN-A').click()); await flush();
    expect(input('Phone').value).toBe('');
    const pinned = button('Confirm order');
    expect(pinned.disabled).toBe(true);
    change(input('Phone'), '9876543210');
    change(input('House, flat or building'), '12 A');
    change(input('Street and area'), 'Main road');
    change(input('City'), 'Satara'); change(input('State'), 'Maharashtra'); change(input('Pincode'), '415001');
    expect(button('Confirm order').disabled).toBe(false);
    act(() => button('Confirm order').click());
    const final = button('Confirm order');
    expect(final.disabled).toBe(true);
    const receipt = [...container.querySelectorAll('label')].find((l) => l.textContent?.includes('WhatsApp message has arrived'))?.querySelector('input') as HTMLInputElement;
    act(() => receipt.click());
    expect(button('Confirm order').disabled).toBe(false);
    change(input('Phone'), '123');
    expect(button('Confirm order').disabled).toBe(true);
  });

  it('dismissal closes without navigating; confirmation navigates once to the returned order', async () => {
    act(() => button('SN-A').click()); await flush();
    api.dismissWebsiteRequest.mockResolvedValue({ state: 'dismissed' });
    act(() => button('Dismiss request').click()); await flush();
    expect(container.querySelector('[role="dialog"]')).toBeNull(); expect(api.navigate).not.toHaveBeenCalled();

    act(() => button('SN-B').click()); await flush();
    act(() => button('Confirm order').click());
    const check = [...container.querySelectorAll('label')].find((l) => l.textContent?.includes('WhatsApp message has arrived'))?.querySelector('input') as HTMLInputElement;
    act(() => { check.click(); });
    api.confirmWebsiteRequest.mockResolvedValue({ state: 'confirmed', order: { code: 'SN-ORDER' } });
    act(() => button('Confirm order').click()); await flush();
    expect(api.confirmWebsiteRequest).toHaveBeenCalledTimes(1);
    expect(api.navigate).toHaveBeenCalledWith('/admin/orders/SN-ORDER');
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('asks the owner to honour or adjust when the promised tier moved', async () => {
    act(() => button('SN-A').click()); await flush();
    act(() => button('Confirm order').click());
    const receipt = [...container.querySelectorAll('label')].find((l) => l.textContent?.includes('WhatsApp message has arrived'))?.querySelector('input') as HTMLInputElement;
    act(() => receipt.click());
    api.confirmWebsiteRequest.mockResolvedValue({ state: 'conflict', order: null, promised: 'first', current: 'second' });
    act(() => button('Confirm order').click()); await flush();
    const dialog = container.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.textContent).toContain('Their price has moved since');
    expect(dialog.textContent).toContain('First order offer');
    expect(dialog.textContent).toContain('Second order offer');
    expect(api.navigate).not.toHaveBeenCalled();

    api.confirmWebsiteRequest.mockResolvedValue({ state: 'confirmed', order: { code: 'SN-ORDER' } });
    act(() => button('Honour the quoted price').click()); await flush();
    expect(api.confirmWebsiteRequest).toHaveBeenLastCalledWith('A', expect.objectContaining({ tier_decision: 'honour' }));
    expect(api.navigate).toHaveBeenCalledWith('/admin/orders/SN-ORDER');

    act(() => button('SN-B').click()); await flush();
    act(() => button('Confirm order').click());
    const secondReceipt = [...container.querySelectorAll('label')].find((l) => l.textContent?.includes('WhatsApp message has arrived'))?.querySelector('input') as HTMLInputElement;
    act(() => secondReceipt.click());
    api.confirmWebsiteRequest.mockResolvedValueOnce({ state: 'conflict', order: null, promised: 'first', current: 'second' });
    act(() => button('Confirm order').click()); await flush();
    api.confirmWebsiteRequest.mockResolvedValueOnce({ state: 'confirmed', order: { code: 'SN-ORDER-2' } });
    act(() => button('Use today’s price').click()); await flush();
    expect(api.confirmWebsiteRequest).toHaveBeenLastCalledWith('B', expect.objectContaining({ tier_decision: 'adjust' }));
  });

  it('keeps confirmation recovery in the sheet and reports server validation text', async () => {
    act(() => button('SN-A').click()); await flush();
    act(() => button('Confirm order').click());
    const receipt = [...container.querySelectorAll('label')].find((l) => l.textContent?.includes('WhatsApp message has arrived'))?.querySelector('input') as HTMLInputElement;
    act(() => receipt.click());
    api.confirmWebsiteRequest.mockRejectedValue(new Error('Name must contain at least two characters'));
    act(() => button('Confirm order').click()); await flush();
    expect(container.querySelector('[role="dialog"] [data-testid="toast-slot"]')).not.toBeNull();
    expect(toast.show).toHaveBeenCalledWith({ text: 'Name must contain at least two characters' });
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it('makes terminal request details read-only and labels the actual state', async () => {
    const confirmed = request('A', { state: 'confirmed' });
    api.getWebsiteRequests.mockResolvedValue(page([confirmed]));
    act(() => root.unmount());
    api.getWebsiteRequests.mockReset().mockResolvedValue(page([confirmed]));
    api.getWebsiteRequest.mockReset().mockResolvedValue(confirmed);
    root = createRoot(container); render(); await flush();
    act(() => button('SN-A').click()); await flush();
    expect(input('Name').closest('fieldset')?.disabled).toBe(true);
    expect(container.textContent).toContain('Confirmed');
  });

  it('resets the cursor on search and requests the next page using the returned tuple', async () => {
    const search = [...container.querySelectorAll('label')].find((l) => l.textContent?.includes('Search name'))?.querySelector('input') as HTMLInputElement;
    act(() => button('Load older requests').click());
    await flush();
    expect(api.getWebsiteRequests).toHaveBeenLastCalledWith(expect.objectContaining({ before: 'cursor-1', before_id: 'B' }));
    change(search, 'Meera'); await new Promise((resolve) => setTimeout(resolve, 320)); await flush();
    expect(api.getWebsiteRequests).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'Meera', limit: 100 }));
    expect(api.getWebsiteRequests).not.toHaveBeenLastCalledWith(expect.objectContaining({ before: 'cursor-1' }));
  });

  it('shows the saved quote, its rates and its total in a request that has one', async () => {
    const quoted = request('A', { quote });
    api.getWebsiteRequests.mockResolvedValue(page([quoted]));
    api.getWebsiteRequest.mockResolvedValue(quoted);
    act(() => root.unmount());
    root = createRoot(container); render(); await flush();
    act(() => button('SN-A').click()); await flush();
    const dialog = container.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.textContent).toContain('Saved quote');
    expect(dialog.textContent).toContain('Guest offer');
    expect(dialog.textContent).toContain('₹359 each');
    expect(dialog.textContent).toContain('₹50');
    expect(dialog.textContent).toContain('₹40');
    expect(dialog.textContent).toContain('₹409');
  });

  it('leaves a request without a quote quiet', async () => {
    act(() => button('SN-A').click()); await flush();
    const dialog = container.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.textContent).not.toContain('Saved quote');
  });

  it('finds a request by its code and opens it', async () => {
    api.getAdminWebsiteQuote.mockResolvedValue({
      code: 'SN-AB234', quote: null,
      request: { id: 'A', code: 'SN-A', state: 'pending', name: 'Name A', phone: null, created_at: '2026-10-22T10:00:00Z' },
      order: null,
    });
    change(input('Order code'), 'SN-AB234');
    act(() => button('Find').click()); await flush(); await flush();
    expect(api.getAdminWebsiteQuote).toHaveBeenCalledWith('SN-AB234');
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(input('Name').value).toBe('Name A');
  });

  it('shows a quote whose request never saved, with the way to add it by hand', async () => {
    api.getAdminWebsiteQuote.mockResolvedValue({ code: 'SN-AB234', quote, request: null, order: null });
    change(input('Order code'), 'SN-AB234');
    act(() => button('Find').click()); await flush();
    expect(container.textContent).toContain('never reached me');
    expect(container.textContent).toContain('₹359 each');
    expect(container.textContent).toContain('₹409');
    let added: HTMLButtonElement | undefined;
    act(() => { added = button('Add the order by hand'); added.click(); });
    expect(api.navigate).toHaveBeenCalledWith('/admin/orders/new?code=AB234');
  });

  it('announces a find that fails or matches nothing', async () => {
    api.getAdminWebsiteQuote.mockRejectedValue(new Error('Offers are not configured.'));
    change(input('Order code'), 'SN-AB234');
    act(() => button('Find').click()); await flush();
    expect(toast.show).toHaveBeenCalledWith({ text: 'Offers are not configured.' });

    api.getAdminWebsiteQuote.mockResolvedValue({ code: 'SN-ZZZZZ', quote: null, request: null, order: null });
    change(input('Order code'), 'SN-ZZZZZ');
    act(() => button('Find').click()); await flush();
    expect(toast.show).toHaveBeenCalledWith({ text: 'Nothing matches SN-ZZZZZ. Check the code in their message.' });
  });
});
