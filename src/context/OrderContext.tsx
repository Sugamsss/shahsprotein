import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { siteConfig } from '../data/siteConfig';
import { productsData } from '../data/products';
import type { AddResult, CouponCheck, MessageCoupon, OrderLine, OrderMessageInput } from '../types/order';
import type { OrderPopupOpener } from '../utils/contact';
import {
  addLine,
  changeLineSize,
  countItems,
  inStockLines,
  parseStoredCart,
  removeLine,
  serializeCart,
  setLineQuantity,
  sortLines,
} from '../utils/orderCart';
import { cleanName, orderMessageUrl } from '../utils/orderMessage';
import { makeOrderCode } from '../utils/orderCode';
import { checkCoupon, looksLikeCouponCode, normalizeCouponCode } from '../services/couponService';
import { firstInStockSize, useStock } from '../services/stockService';

// Everything behind the "Your order" popup.
//
// Only the cart is saved (localStorage), so a reload doesn't lose it. Name, pincode,
// the coupon, the order code and the sent snapshot are personal or short-lived: they live in memory
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

/**
 * What was sent (and saved), kept in memory after Send so the sent panel and
 * "Try again" work. "Try again" reopens `url` and saves the same order again.
 */
export interface SentOrder extends OrderMessageInput {
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
  /** Packs that will be sent (out-of-stock lines don't count), for the header count. */
  itemCount: number;
  maxQuantity: number;
  /** No size means the product's first pack size that's in stock. Drops a sent snapshot first. */
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
  /** This order's code, e.g. "SN-7KQ4M". Memory only. A new one comes with each new order. */
  code: string;
  /** The lines that go in the message and the save: in stock, in display order. */
  sendLines: OrderLine[];
  /** The order as it would be sent right now. */
  currentOrder: () => OrderMessageInput;
  /** The finished wa.me link for `currentOrder()`. */
  currentUrl: () => string;
  /** Call once the Send link has opened: keeps the snapshot, clears the cart and the coupon. */
  markSent: (order: OrderMessageInput, url: string) => void;
  sent: SentOrder | null;
  /** Drops the snapshot and starts a new code. Name and pincode stay. */
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
  const [code, setCode] = useState(makeOrderCode);
  const stock = useStock();

  // Refs hold the latest values, so actions answer synchronously and two quick
  // clicks in the same tick both count (the second sees the first's result).
  const linesRef = useRef(storedLines);
  const couponInputRef = useRef(couponInput);
  const couponRef = useRef(coupon);
  const sentRef = useRef(sent);
  const stockRef = useRef(stock);
  stockRef.current = stock;

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

  /** A sent order is finished: drop it, and the next order gets a new code. */
  const finishSent = useCallback(() => {
    if (!sentRef.current) return;
    updateSent(null);
    setCode(makeOrderCode());
  }, [updateSent]);

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
    const product = productsData.find((p) => p.id === productId);
    const packSize = size ?? (product && firstInStockSize(product, stockRef.current));
    if (!packSize) return 'invalid';
    // Anything added after a sent order starts the next one.
    finishSent();
    const { lines: next, result } = addLine(linesRef.current, productId, packSize, quantity);
    commit(next);
    if (result !== 'invalid') {
      setLastAdd({ productId, size: packSize, result, at: Date.now() });
    }
    return result;
  }, [commit, finishSent]);

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

  const sendLines = useMemo(() => inStockLines(storedLines, stock.isOut), [storedLines, stock]);

  // Built from the refs at call time, so a click right after a change sends what's on screen.
  const currentOrder = useCallback((): OrderMessageInput => ({
    code,
    lines: inStockLines(linesRef.current, stockRef.current.isOut),
    name: cleanName(name),
    pincode,
    coupon: messageCoupon,
  }), [code, name, pincode, messageCoupon]);

  const currentUrl = useCallback(() => orderMessageUrl(currentOrder()), [currentOrder]);

  const markSent = useCallback((order: OrderMessageInput, url: string) => {
    updateSent({ ...order, url });
    commit([]);
    removeCoupon();
    setCouponOpen(false);
  }, [commit, removeCoupon, updateSent]);

  const startNewOrder = finishSent;

  const value = useMemo<OrderContextType>(() => ({
    lines,
    itemCount: countItems(sendLines),
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
    code,
    sendLines,
    currentOrder,
    currentUrl,
    markSent,
    sent,
    startNewOrder,
  }), [
    lines, sendLines, addItem, setQuantity, changeSize, removeItem, clear, lastAdd, droppedOnLoad,
    name, pincode, setPincode, couponOpen, couponInput, setCouponInput, coupon, applyCoupon,
    removeCoupon, messageCoupon, isOpen, openedFrom, openOrder, closeOrder, code, sendLines,
    currentOrder, currentUrl, markSent, sent, startNewOrder,
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
