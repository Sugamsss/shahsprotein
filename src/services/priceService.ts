import { useSyncExternalStore } from 'react';
import { getLiveMrps, parseCouponPrices, setLiveMrps } from '../utils/prices';
import type { CouponPrices } from '../types/order';
import { getPublicRpc } from './publicRpc';

// The MRPs follow the admin: get_product_prices() answers the base price per
// product and pack size set on the admin Products page. Fetched once, on the
// first use. It fails open to the copy in products.ts: no answer, an error, a
// database without the function yet (404) or an empty list all keep those.
// The last answer is cached (prices aren't personal), so a repeat visit shows
// the admin's prices straight away. Every storage access is guarded.

const STORAGE_KEY = 'shahs-prices-v1';
const TIMEOUT_MS = 5000;

/** The admin's prices, or null when there's nothing usable (keep products.ts). */
const toMrps = (data: unknown): CouponPrices | null => {
  const mrps = parseCouponPrices(data);
  return Object.keys(mrps).length > 0 ? mrps : null;
};

const readCache = (): CouponPrices | null => {
  try {
    return toMrps(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]'));
  } catch {
    return null;
  }
};

const writeCache = (data: unknown): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Blocked or full storage: next visit just asks again.
  }
};

let started = false;
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  if (!started) {
    started = true;
    void getPublicRpc('get_product_prices', { timeoutMs: TIMEOUT_MS }).then((data) => {
      const mrps = toMrps(data);
      if (!mrps) return;
      writeCache(data);
      setLiveMrps(mrps);
      listeners.forEach((notify) => notify());
    });
  }
  return () => {
    listeners.delete(listener);
  };
};

// Before the first render, so nothing shows the old prices first.
if (typeof window !== 'undefined') setLiveMrps(readCache());

/**
 * Call it in any component that shows a price, so it redraws when the admin's
 * prices arrive. Prices are read with `mrpOf`, `packPrice` and `orderTotal`.
 */
export const usePrices = (): Readonly<CouponPrices> | null => useSyncExternalStore(subscribe, getLiveMrps);
