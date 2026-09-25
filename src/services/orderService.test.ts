import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveOrder } from './orderService';

// The request Send makes to the order book (contract.md, `submit_order`).

const order = {
  code: 'SN-7KQ4M',
  lines: [
    { productId: 'muesli', size: '250 g', quantity: 2 },
    { productId: 'bites', size: '250 g', quantity: 1 },
  ],
  name: '  Anjali  ',
  pincode: '415001',
  coupon: { code: 'EXAMPLE10', checked: false },
};

const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
  vi.stubEnv('VITE_TRACK_EVENTS', 'true');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  fetchMock.mockClear();
});

const sentBody = () => {
  const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  return JSON.parse(init.body as string);
};

describe('saveOrder', () => {
  it('posts the order with keepalive, in the shape submit_order takes', () => {
    saveOrder(order);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://example.supabase.co/rest/v1/rpc/submit_order');
    expect(init).toMatchObject({ method: 'POST', keepalive: true });
    expect(sentBody()).toEqual({
      p_code: 'SN-7KQ4M',
      p_lines: [
        { product_id: 'muesli', size: '250 g', quantity: 2 },
        { product_id: 'bites', size: '250 g', quantity: 1 },
      ],
      p_name: 'Anjali',
      p_pincode: '415001',
      p_coupon: 'EXAMPLE10',
    });
  });

  it('sends no coupon when the message has none', () => {
    saveOrder({ ...order, coupon: null });
    expect(sentBody()).not.toHaveProperty('p_coupon');
  });

  it('saves nothing off the live site', () => {
    vi.stubEnv('VITE_TRACK_EVENTS', 'false');
    saveOrder(order);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never throws, even when fetch does', () => {
    fetchMock.mockImplementationOnce(() => {
      throw new TypeError('Failed to fetch');
    });
    expect(() => saveOrder(order)).not.toThrow();
  });
});
