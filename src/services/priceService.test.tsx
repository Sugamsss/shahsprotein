// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { productsData } from '../data/products';

// get_product_prices() feeds the MRPs: the answer replaces products.ts, is
// cached for the next visit, and anything else keeps products.ts.

const muesli = productsData.find((p) => p.id === 'muesli')!;
const answer = { schema_version: 1, status: 'ready', version: 'fixture-v1', server_time: '2026-11-09T00:00:00Z', expires_at: '2027-01-01T00:00:00Z', currency: 'INR', offer: { label: 'Guest', kind: 'guest' }, packs: [
  { product_id: 'muesli', size: '250 g', grams: 250, mrp: 399, price: 299 }, { product_id: 'muesli', size: '500 g', grams: 500, mrp: 699, price: 599 },
  { product_id: 'raggi-jaggi', size: '250 g', grams: 250, mrp: 249, price: 200 }, { product_id: 'raggi-jaggi', size: '500 g', grams: 500, mrp: 479, price: 400 }, { product_id: 'bites', size: '250 g', grams: 250, mrp: 319, price: 250 },
], delivery: { min_grams: 500, min_packs: null, up_to_250: 50, above_250: 70, cap: 70 } };

let root: Root | null = null;
let shown = '';
const storage = new Map<string, string>();
const localStorageMock = { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => { storage.set(key, value); }, removeItem: (key: string) => { storage.delete(key); }, clear: () => storage.clear() };

/** A fresh copy of the service (its fetch runs once per page), mounted in a component. */
const mount = async (respond: () => Promise<Response>) => {
  vi.stubGlobal('fetch', vi.fn(respond));
  vi.resetModules();
  const { usePrices } = await import('./priceService');
  const { mrpOf } = await import('../utils/prices');
  const container = document.createElement('div');
  root = createRoot(container);
  const Shown: React.FC = () => {
    usePrices();
    shown = String(mrpOf(muesli, '250 g'));
    return null;
  };
  await act(async () => { root!.render(<Shown />); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
};

beforeEach(() => {
  vi.stubGlobal('localStorage', localStorageMock);
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
  storage.clear();
  shown = '';
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('priceService', () => {
  it("shows the admin's price once it answers, and keeps it for the next visit", async () => {
    await mount(() => Promise.resolve(Response.json(answer)));
    expect(shown).toBe('399');
    expect(JSON.parse(localStorageMock.getItem('shahs-prices-v2')!).offer).toEqual(answer);
  });

  it('starts from the last answer on a repeat visit', async () => {
    localStorageMock.setItem('shahs-prices-v2', JSON.stringify({ schema_version: 1, fetched_at: Date.now(), offer: answer }));
    await mount(() => new Promise(() => undefined));
    expect(shown).toBe('399');
  });

  it('keeps products.ts on a failure, a missing function or an empty list', async () => {
    for (const respond of [
      () => Promise.reject(new Error('offline')),
      () => Promise.resolve(new Response(null, { status: 404 })),
      () => Promise.resolve(Response.json([])),
    ]) {
      await mount(respond);
      expect(shown).toBe(String(muesli.mrp['250 g']));
      act(() => root?.unmount());
      root = null;
    }
  });

  it('keeps products.ts when storage is blocked', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('blocked', 'SecurityError'); });
    await mount(() => new Promise(() => undefined));
    expect(shown).toBe(String(muesli.mrp['250 g']));
    vi.restoreAllMocks();
  });
});
