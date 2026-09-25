import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { siteConfig } from '../data/siteConfig';
import type { AddResult, OrderLine } from '../types/order';
import {
  addLine,
  changeLineSize,
  countItems,
  parseStoredCart,
  removeLine,
  serializeCart,
  setLineQuantity,
} from '../utils/orderCart';

// The cart for the "Your order" popup, kept in localStorage so a reload doesn't lose it.
// Only the cart is saved: name, pincode and coupon are personal and live in the popup.
// Storage can be missing, blocked, full or throw on access, so every touch is guarded
// and the cart simply lives in memory when it can't be saved.

const STORAGE_KEY = 'shahs-order-v1';
const MAX_QUANTITY = siteConfig.order.maxQuantity;

export interface OrderContextType {
  /** Lines in the order they were added. */
  lines: OrderLine[];
  /** Total packs, for the header count. */
  itemCount: number;
  maxQuantity: number;
  /** No size means the product's first pack size. Returns straight away, for "Added" feedback. */
  addItem: (productId: string, size?: string, quantity?: number) => AddResult;
  /** Clamped to 1..maxQuantity. Use `removeItem` to remove. */
  setQuantity: (productId: string, size: string, quantity: number) => void;
  /** Merges into the line for `to` if there is one. */
  changeSize: (productId: string, from: string, to: string) => void;
  removeItem: (productId: string, size: string) => void;
  clear: () => void;
  /** Saved lines thrown away on load because the product or pack size is gone. */
  droppedOnLoad: number;
}

const OrderContext = createContext<OrderContextType | undefined>(undefined);

/** Even reading `window.localStorage` can throw (blocked cookies, some private modes). */
const getStorage = (): Storage | null => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
};

const loadCart = (): { lines: OrderLine[]; dropped: number } => {
  let raw: string | null = null;
  try {
    raw = getStorage()?.getItem(STORAGE_KEY) ?? null;
  } catch {
    // Unreadable storage is an empty cart.
  }
  return parseStoredCart(raw);
};

const saveCart = (lines: OrderLine[]): void => {
  try {
    const storage = getStorage();
    if (!storage) return;
    if (lines.length === 0) {
      storage.removeItem(STORAGE_KEY);
      return;
    }
    const value = serializeCart(lines);
    // Skipping an unchanged write stops two tabs echoing the same cart back and forth.
    if (storage.getItem(STORAGE_KEY) !== value) storage.setItem(STORAGE_KEY, value);
  } catch {
    // Full or blocked storage: the cart stays in memory for this visit.
  }
};

export const OrderProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [initial] = useState(loadCart);
  const [lines, setLines] = useState<OrderLine[]>(initial.lines);

  // The ref is always the latest cart, so an action can answer synchronously and two
  // quick clicks in the same tick both count (the second sees the first's result).
  const linesRef = useRef(lines);
  const commit = useCallback((next: OrderLine[]) => {
    if (next === linesRef.current) return;
    linesRef.current = next;
    setLines(next);
  }, []);

  useEffect(() => {
    saveCart(lines);
  }, [lines]);

  // Another tab changed the cart (or cleared all storage, where `key` is null).
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== STORAGE_KEY) return;
      commit(parseStoredCart(event.newValue).lines);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [commit]);

  const addItem = useCallback((productId: string, size?: string, quantity = 1): AddResult => {
    const { lines: next, result } = addLine(linesRef.current, productId, size, quantity);
    commit(next);
    return result;
  }, [commit]);

  const setQuantity = useCallback((productId: string, size: string, quantity: number) => {
    commit(setLineQuantity(linesRef.current, productId, size, quantity));
  }, [commit]);

  const changeSize = useCallback((productId: string, from: string, to: string) => {
    commit(changeLineSize(linesRef.current, productId, from, to));
  }, [commit]);

  const removeItem = useCallback((productId: string, size: string) => {
    commit(removeLine(linesRef.current, productId, size));
  }, [commit]);

  const clear = useCallback(() => {
    if (linesRef.current.length > 0) commit([]);
  }, [commit]);

  const value = useMemo<OrderContextType>(() => ({
    lines,
    itemCount: countItems(lines),
    maxQuantity: MAX_QUANTITY,
    addItem,
    setQuantity,
    changeSize,
    removeItem,
    clear,
    droppedOnLoad: initial.dropped,
  }), [lines, addItem, setQuantity, changeSize, removeItem, clear, initial.dropped]);

  return <OrderContext.Provider value={value}>{children}</OrderContext.Provider>;
};

export const useOrder = (): OrderContextType => {
  const context = useContext(OrderContext);
  if (!context) {
    throw new Error('useOrder must be used within an OrderProvider');
  }
  return context;
};
