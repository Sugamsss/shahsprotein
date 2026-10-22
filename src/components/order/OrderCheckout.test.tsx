// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OrderProvider, useOrder, type OrderContextType } from '../../context/OrderContext';
import { OrderCheckout } from './OrderCheckout';

const { saveOrder, trackOrderSend } = vi.hoisted(() => ({ saveOrder: vi.fn(), trackOrderSend: vi.fn() }));
vi.mock('../../services/orderService', () => ({ saveOrder }));
vi.mock('../../utils/contact', async (original) => ({ ...await original<typeof import('../../utils/contact')>(), trackOrderSend }));
vi.mock('../../services/stockService', () => ({ useStock: () => ({ isOut: () => false }), firstInStockSize: () => '250 g' }));
vi.mock('../../services/placesAddress', () => ({ loadPlaces: () => new Promise(() => {}), searchPlaces: vi.fn(), selectedAddress: vi.fn() }));

describe('checkout lifecycle', () => {
  let root: Root; let host: HTMLDivElement; let order: OrderContextType;
  function Capture() { order = useOrder(); return <OrderCheckout />; }
  const update = (fn: (value: OrderContextType) => void) => act(() => fn(order));
  const setAddress = (value: Partial<OrderContextType['address']>) => update((o) => o.setAddress({ ...o.address, ...value }));
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); saveOrder.mockReset(); trackOrderSend.mockReset();
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
    HTMLElement.prototype.scrollIntoView = () => {};
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
    act(() => root.render(<OrderProvider><Capture /></OrderProvider>));
    update((o) => { o.addItem('muesli', '250 g'); o.setName('Asha'); o.setPhone('9876543210'); });
  });
  afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); });

  it('preserves multiword typing and derives one pincode field from address', () => {
    const input = host.querySelector<HTMLInputElement>('#delivery-premises')!;
    for (const char of 'Flat 4B') {
      act(() => { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!; setter.call(input, input.value + char); input.dispatchEvent(new Event('input', { bubbles: true })); });
    }
    expect(order.address.premises).toBe('Flat 4B');
    expect(host.querySelectorAll('input[name="postal-code"]')).toHaveLength(1);
  });

  it('shows per-field errors and focuses the first invalid required address field on Continue', () => {
    const button = [...host.querySelectorAll('button')].find((item) => item.textContent?.includes('Continue'))!;
    act(() => button.click());
    expect(host.querySelectorAll('.delivery-fields [aria-invalid="true"]')).toHaveLength(5);
    expect(host.querySelector('#delivery-premises')).toBe(document.activeElement);
    expect(saveOrder).not.toHaveBeenCalled();
    expect(host.querySelector('input[aria-invalid="true"]')).toBeTruthy();
  });

  it('opens the native WhatsApp link synchronously and saves the same complete snapshot', () => {
    setAddress({ premises: 'Flat 4B', area: 'Shivaji Nagar', city: 'Satara', state: 'Maharashtra', pincode: '415001' });
    const link = host.querySelector<HTMLAnchorElement>('.order-send a')!;
    expect(link.href).toContain('wa.me');
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(saveOrder).toHaveBeenCalledWith(expect.objectContaining({ phone: '919876543210', pincode: '415001', address: expect.objectContaining({ premises: 'Flat 4B' }) }));
    expect(trackOrderSend).toHaveBeenCalledTimes(1);
  });
});
