import { useSyncExternalStore } from 'react';
import { productsData } from '../data/products';
import type { Product } from '../types/product';
import { getPublicRpc } from './publicRpc';

// Which pack sizes are out of stock ("Back soon"). Fetched once, on the first
// use. It fails open: if the check fails or times out, everything is orderable.
// The last answer is cached (stock isn't personal), so a repeat visit doesn't
// flash "Add" before "Back soon". Every storage access is guarded.

const STORAGE_KEY = 'shahs-stock-v1';
const TIMEOUT_MS = 5000;

export interface Stock {
  isOut: (productId: string, size: string) => boolean;
  /** Every pack size of the product is out. */
  isProductOut: (productId: string) => boolean;
}

const keyOf = (productId: string, size: string) => `${productId}|${size}`;

/** Only well-formed `{ product_id, size }` rows count. Anything else means nothing is out. */
const parseOut = (data: unknown): string[] =>
  Array.isArray(data)
    ? data.flatMap((row) => (typeof row?.product_id === 'string' && typeof row?.size === 'string'
      ? [keyOf(row.product_id, row.size)]
      : []))
    : [];

const makeStock = (outKeys: string[]): Stock => {
  const out = new Set(outKeys);
  const isOut = (productId: string, size: string) => out.has(keyOf(productId, size));
  return {
    isOut,
    isProductOut: (productId) => {
      const sizes = productsData.find((p) => p.id === productId)?.weightOptions ?? [];
      return sizes.length > 0 && sizes.every((size) => isOut(productId, size));
    },
  };
};

const readCache = (): string[] => {
  try {
    return parseOut(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]'));
  } catch {
    return [];
  }
};

const writeCache = (data: unknown): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Blocked or full storage: next visit just checks again.
  }
};

let stock: Stock | null = null;
let fetched = false;
const listeners = new Set<() => void>();

const getStock = (): Stock => {
  stock ??= makeStock(readCache());
  return stock;
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  if (!fetched) {
    fetched = true;
    void getPublicRpc('get_product_stock', { timeoutMs: TIMEOUT_MS }).then((data) => {
      const answered = Array.isArray(data);
      if (answered) writeCache(data);
      // No answer: fail open, everything orderable.
      stock = makeStock(answered ? parseOut(data) : []);
      listeners.forEach((notify) => notify());
    });
  }
  return () => {
    listeners.delete(listener);
  };
};

export const useStock = (): Stock => useSyncExternalStore(subscribe, getStock);

/** The first pack size that's in stock, for "Add" buttons that don't ask for a size. */
export const firstInStockSize = (product: Product, stock: Stock): string | undefined =>
  product.weightOptions.find((size) => !stock.isOut(product.id, size));
