import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { siteConfig } from '../data/siteConfig';
import type { AddResult, CouponCheck, MessageCoupon, OrderLine } from '../types/order';
import type { OrderPopupOpener } from '../utils/contact';
import {
  addLine,
  changeLineSize,
  countItems,
  parseStoredCart,
  removeLine,
  serializeCart,
  setLineQuantity,
  sortLines,
} from '../utils/orderCart';
import { cleanName, orderMessageUrl } from '../utils/orderMessage';
import { checkCoupon, looksLikeCouponCode, normalizeCouponCode } from '../services/couponService';

// Everything behind the "Your order" popup.
//
// Only the cart is saved (localStorage), so a reload doesn't lose it. Name, pincode,
// the coupon and the sent snapshot are personal or short-lived: they live in memory
// for this visit, so they survive closing and reopening the popup, and never touch
// storage. Storage can be missing, blocked, full or throw on access, so every touch
// is guarded and the cart simply lives in memory when it can't be saved.

const STORAGE_KEY = 'shahs-order-v1';
const MAX_QUANTITY = siteConfig.order.maxQuantity;

/** The coupon field's server answer. `idle` means nothing has been checked for what's typed. */
export type CouponState =
  | { status: 'idle' }
  | { status: 'checking'; code: string }
  | CouponCheck;

/** What was sent, kept in memory after Send so the sent panel and "Try again" work. */
export interface SentOrder {
  lines: OrderLine[];
  name: string;
  pincode: string;
  coupon: MessageCoupon | null;
  url: string;
}

/** The last add, so the popup can flash that line and announce it. `at` makes each add unique. */
export interface LastAdd {
  productId: string;
  size: string;
  result: AddResult;
  at: number;
}

export interface OrderContextType {
  /** Lines in display order: product order, then pack-size order. */
  lines: OrderLine[];
  /** Total packs, for the header count. */
  itemCount: number;
  maxQuantity: number;
  /** No size means the product's first pack size. Drops a sent snapshot first. */
  addItem: (productId: string, size?: string, quantity?: number) => AddResult;
  /** Clamped to 1..maxQuantity. Use `removeItem` to remove. */
  setQuantity: (productId: string, size: string, quantity: number) => void;
  /** Merges into the line for `to` if there is one (clamped). */
  changeSize: (productId: string, from: string, to: string) => void;
  removeItem: (productId: string, size: string) => void;
  clear: () => void;
  lastAdd: LastAdd | null;

  /** Saved lines thrown away on load because the product or pack size is gone. Cleared when the popup closes. */
  droppedOnLoad: number;

  // Details (memory only)
  name: string;
  setName: (value: string) => void;
  pincode: string;
  /** Keeps digits only, at most 6. */
  setPincode: (value: string) => void;

  // Coupon (memory only)
  couponOpen: boolean;
  setCouponOpen: (open: boolean) => void;
  /** Upper case, no spaces, at most 24 characters. */
  couponInput: string;
  /** Typing clears any earlier answer. */
  setCouponInput: (value: string) => void;
  coupon: CouponState;
  /** Checks what's typed. Does nothing if it's empty, or already checked or checking. */
  applyCoupon: () => void;
  /** Clears the field and any answer. */
  removeCoupon: () => void;
  /** The coupon as it goes in the message: checked, not checked yet, or none. */
  messageCoupon: MessageCoupon | null;

  // The popup
  isOpen: boolean;
  /** Which button opened the popup, for `trackOrderSend`. */
  openedFrom: OrderPopupOpener | undefined;
  openOrder: (from: OrderPopupOpener) => void;
  closeOrder: () => void;

  // Send
  /** The finished wa.me link for what's in the popup right now. */
  currentUrl: () => string;
  /** Call once the Send link has opened: keeps a snapshot, clears the cart and the coupon. */
  markSent: (url: string) => void;
  sent: SentOrder | null;
  /** Drops the snapshot. Name and pincode stay. */
  startNewOrder: () => void;
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
  const [storedLines, setStoredLines] = useState<OrderLine[]>(initial.lines);
  const [droppedOnLoad, setDroppedOnLoad] = useState(initial.dropped);
  const [lastAdd, setLastAdd] = useState<LastAdd | null>(null);
  const [name, setName] = useState('');
  const [pincode, setPincodeState] = useState('');
  const [couponOpen, setCouponOpen] = useState(false);
  const [couponInput, setCouponInputState] = useState('');
  const [coupon, setCoupon] = useState<CouponState>({ status: 'idle' });
  const [isOpen, setIsOpen] = useState(false);
  const [openedFrom, setOpenedFrom] = useState<OrderPopupOpener | undefined>(undefined);
  const [sent, setSent] = useState<SentOrder | null>(null);

  // Refs hold the latest values, so actions answer synchronously and two quick
  // clicks in the same tick both count (the second sees the first's result).
  const linesRef = useRef(storedLines);
  const couponInputRef = useRef(couponInput);
  const couponRef = useRef(coupon);
  const sentRef = useRef(sent);

  const commit = useCallback((next: OrderLine[]) => {
    if (next === linesRef.current) return;
    linesRef.current = next;
    setStoredLines(next);
  }, []);

  const updateCoupon = useCallback((next: CouponState) => {
    couponRef.current = next;
    setCoupon(next);
  }, []);

  const updateSent = useCallback((next: SentOrder | null) => {
    sentRef.current = next;
    setSent(next);
  }, []);

  useEffect(() => {
    saveCart(storedLines);
  }, [storedLines]);

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
    // A sent order is finished: anything added starts the next one.
    if (sentRef.current) updateSent(null);
    const { lines: next, result } = addLine(linesRef.current, productId, size, quantity);
    commit(next);
    if (result !== 'invalid') {
      const line = next.find((l) => l.productId === productId && (size === undefined || l.size === size));
      if (line) setLastAdd({ productId, size: line.size, result, at: Date.now() });
    }
    return result;
  }, [commit, updateSent]);

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

  const setPincode = useCallback((value: string) => setPincodeState(value.replace(/\D/g, '').slice(0, 6)), []);

  const setCouponInput = useCallback((value: string) => {
    const next = value.replace(/\s/g, '').toUpperCase().slice(0, 24);
    couponInputRef.current = next;
    setCouponInputState(next);
    // A new value needs a new check; an answer for the old one no longer applies.
    const current = couponRef.current;
    if (current.status !== 'idle' && current.code !== next) updateCoupon({ status: 'idle' });
  }, [updateCoupon]);

  const applyCoupon = useCallback(() => {
    const code = normalizeCouponCode(couponInputRef.current);
    const current = couponRef.current;
    if (!code || (current.status !== 'idle' && current.code === code)) return;
    updateCoupon({ status: 'checking', code });
    void checkCoupon(code).then((result) => {
      // Ignore an answer for a code the person has since changed.
      if (normalizeCouponCode(couponInputRef.current) !== result.code) return;
      updateCoupon(result);
    });
  }, [updateCoupon]);

  const removeCoupon = useCallback(() => {
    couponInputRef.current = '';
    setCouponInputState('');
    updateCoupon({ status: 'idle' });
  }, [updateCoupon]);

  const messageCoupon = useMemo<MessageCoupon | null>(() => {
    const code = normalizeCouponCode(couponInput);
    if (!code) return null;
    switch (coupon.status) {
      case 'valid':
        return { code: coupon.code, checked: true };
      case 'invalid':
        return null;
      case 'checking':
      case 'unavailable':
        return { code: coupon.code, checked: false };
      default:
        // Typed but not checked yet (Send pressed straight from the field).
        return looksLikeCouponCode(code) ? { code, checked: false } : null;
    }
  }, [couponInput, coupon]);

  const openOrder = useCallback((from: OrderPopupOpener) => {
    setOpenedFrom(from);
    setIsOpen(true);
  }, []);

  const closeOrder = useCallback(() => {
    setIsOpen(false);
    // The notice about dropped pack sizes shows once.
    setDroppedOnLoad(0);
  }, []);

  const lines = useMemo(() => sortLines(storedLines), [storedLines]);

  const currentUrl = useCallback(
    () => orderMessageUrl({ lines: linesRef.current, name, pincode, coupon: messageCoupon }),
    [name, pincode, messageCoupon],
  );

  const markSent = useCallback((url: string) => {
    updateSent({
      lines: sortLines(linesRef.current),
      name: cleanName(name),
      pincode,
      coupon: messageCoupon,
      url,
    });
    commit([]);
    removeCoupon();
    setCouponOpen(false);
  }, [name, pincode, messageCoupon, commit, removeCoupon, updateSent]);

  const startNewOrder = useCallback(() => updateSent(null), [updateSent]);

  const value = useMemo<OrderContextType>(() => ({
    lines,
    itemCount: countItems(lines),
    maxQuantity: MAX_QUANTITY,
    addItem,
    setQuantity,
    changeSize,
    removeItem,
    clear,
    lastAdd,
    droppedOnLoad,
    name,
    setName,
    pincode,
    setPincode,
    couponOpen,
    setCouponOpen,
    couponInput,
    setCouponInput,
    coupon,
    applyCoupon,
    removeCoupon,
    messageCoupon,
    isOpen,
    openedFrom,
    openOrder,
    closeOrder,
    currentUrl,
    markSent,
    sent,
    startNewOrder,
  }), [
    lines, addItem, setQuantity, changeSize, removeItem, clear, lastAdd, droppedOnLoad,
    name, pincode, setPincode, couponOpen, couponInput, setCouponInput, coupon, applyCoupon,
    removeCoupon, messageCoupon, isOpen, openedFrom, openOrder, closeOrder, currentUrl,
    markSent, sent, startNewOrder,
  ]);

  return <OrderContext.Provider value={value}>{children}</OrderContext.Provider>;
};

export const useOrder = (): OrderContextType => {
  const context = useContext(OrderContext);
  if (!context) {
    throw new Error('useOrder must be used within an OrderProvider');
  }
  return context;
};
