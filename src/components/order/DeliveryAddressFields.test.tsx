// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OrderProvider, useOrder } from '../../context/OrderContext';
import { DeliveryAddressFields } from './DeliveryAddressFields';

const { loadPlaces, searchPlaces, selectedAddress } = vi.hoisted(() => ({ loadPlaces: vi.fn(), searchPlaces: vi.fn(), selectedAddress: vi.fn() }));
vi.mock('../../services/placesAddress', () => ({ loadPlaces, searchPlaces, selectedAddress }));
vi.mock('../../services/stockService', () => ({ useStock: () => ({ isOut: () => false }), firstInStockSize: () => '250 g' }));

describe('delivery address suggestion lifecycle', () => {
  let root: Root; let host: HTMLDivElement; let order: ReturnType<typeof useOrder>;
  function Capture() { order = useOrder(); return <><DeliveryAddressFields /><button type="button" onClick={() => {}}>Outside</button></>; }
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); loadPlaces.mockReset(); searchPlaces.mockReset(); selectedAddress.mockReset();
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key');
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
    loadPlaces.mockResolvedValue({ AutocompleteSessionToken: class {} }); searchPlaces.mockResolvedValue([]);
    act(() => root.render(<OrderProvider><Capture /></OrderProvider>));
  });
  afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });
  const type = (input: HTMLInputElement, value: string) => act(() => { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!; setter.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); });

  it('does not overwrite newer manual edits when selection details resolve', async () => {
    let resolve!: (v: any) => void;
    selectedAddress.mockReturnValue(new Promise((done) => { resolve = done; }));
    // Render a prediction through the actual combobox interaction.
    const searchBox = host.querySelector<HTMLInputElement>('#delivery-search')!;
    searchPlaces.mockResolvedValue([{ label: 'Satara', place: {} }]);
    type(searchBox, 'Satara town'); await act(async () => { await new Promise((r) => setTimeout(r, 280)); });
    await act(async () => { host.querySelector<HTMLButtonElement>('[role="option"] button')?.click(); });
    type(host.querySelector<HTMLInputElement>('#delivery-city')!, 'My own city');
    await act(async () => resolve({ city: 'Provider city', state: 'Maharashtra' }));
    expect(order.address.city).toBe('My own city');
    expect(order.address.state).toBe('');
  });

  it('Escape dismisses open suggestions and prevents the modal close handler', async () => {
    searchPlaces.mockResolvedValue([{ label: 'Satara', place: {} }]);
    const searchBox = host.querySelector<HTMLInputElement>('#delivery-search')!;
    type(searchBox, 'Satara town'); await act(async () => { await new Promise((r) => setTimeout(r, 270)); });
    let modalClosed = false;
    // Dialog-level handler intentionally only closes on an unhandled Escape.
    host.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !event.defaultPrevented) modalClosed = true; });
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    act(() => searchBox.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(true); expect(modalClosed).toBe(false);
    expect(host.querySelector('[role="option"]')).toBeNull();
  });

  it('Escape with no suggestions open is left for the popup to close', () => {
    const searchBox = host.querySelector<HTMLInputElement>('#delivery-search')!;
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    act(() => searchBox.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(false);
  });

  it('a search with no match says so and keeps the search box', async () => {
    const searchBox = host.querySelector<HTMLInputElement>('#delivery-search')!;
    type(searchBox, 'Nowhere at all'); await act(async () => { await new Promise((r) => setTimeout(r, 270)); });
    expect(host.textContent).toContain('No match for that');
    expect(host.querySelector('#delivery-search')).toBeTruthy();
  });

  it('shows no search without a Places key; the address is typed in', () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', '');
    act(() => root.render(<OrderProvider><Capture /></OrderProvider>));
    expect(host.querySelector('#delivery-search')).toBeNull();
    expect(host.querySelector('#delivery-premises')).toBeTruthy();
  });

  it('manual fields remain usable when Places cannot load', async () => {
    loadPlaces.mockRejectedValueOnce(new Error('blocked'));
    const searchBox = host.querySelector<HTMLInputElement>('#delivery-search')!;
    await act(async () => { type(searchBox, 'Sat'); await new Promise((r) => setTimeout(r, 270)); });
    expect(host.textContent).toContain("Address search isn't working right now");
    expect(host.querySelector('#delivery-premises')).toBeTruthy();
  });

  it('ignores a late details result after unmount and a fresh checkout mount', async () => {
    let resolve!: (v: any) => void;
    selectedAddress.mockReturnValue(new Promise((done) => { resolve = done; }));
    searchPlaces.mockResolvedValue([{ label: 'Satara', place: {} }]);
    const searchBox = host.querySelector<HTMLInputElement>('#delivery-search')!;
    type(searchBox, 'Satara town'); await act(async () => { await new Promise((r) => setTimeout(r, 270)); });
    await act(async () => { host.querySelector<HTMLButtonElement>('[role="option"] button')?.click(); });
    act(() => root.unmount());
    root = createRoot(host);
    act(() => root.render(<OrderProvider><Capture /></OrderProvider>));
    await act(async () => resolve({ city: 'Stale city', pincode: '415001' }));
    expect(order.address.city).toBe('');
    expect(order.address.pincode).toBe('');
  });

  it('resets active keyboard selection when a new query starts', async () => {
    searchPlaces.mockResolvedValue([{ label: 'One', place: {} }, { label: 'Two', place: {} }]);
    const searchBox = host.querySelector<HTMLInputElement>('#delivery-search')!;
    type(searchBox, 'Satara town'); await act(async () => { await new Promise((r) => setTimeout(r, 270)); });
    act(() => searchBox.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
    expect(searchBox.getAttribute('aria-activedescendant')).toBe('delivery-option-0');
    type(searchBox, 'New query');
    expect(searchBox.hasAttribute('aria-activedescendant')).toBe(false);
  });
});
