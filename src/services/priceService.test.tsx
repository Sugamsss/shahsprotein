// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { productsData } from '../data/products';

// get_product_prices() feeds the MRPs: the answer replaces products.ts, is
// cached for the next visit, and anything else keeps products.ts.

const muesli = productsData.find((p) => p.id === 'muesli')!;
const answer = [{ product_id: 'muesli', size: '250 g', price: 299 }];

let root: Root | null = null;
let shown = '';

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
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
  window.localStorage.clear();
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
    expect(shown).toBe('299');
    expect(JSON.parse(window.localStorage.getItem('shahs-prices-v1')!)).toEqual(answer);
  });

  it('starts from the last answer on a repeat visit', async () => {
    window.localStorage.setItem('shahs-prices-v1', JSON.stringify(answer));
    await mount(() => new Promise(() => undefined));
    expect(shown).toBe('299');
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
