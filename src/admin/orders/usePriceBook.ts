import { useCallback, useEffect, useState } from 'react';
import { getCoupons, getPrices } from '../api';
import type { Coupon, OrderLine, Prices } from '../types';
import { quote, type Quote } from './quote';

export interface PriceBook {
  /** Null until loaded, and for good if the call fails. */
  coupons: Coupon[] | null;
  /** The worked-out total, or null when prices aren't loaded (or aren't on this database yet). */
  workOut: (lines: OrderLine[], couponCode: string | null) => Quote | null;
}

/** Runs `load` each time `enabled` turns on. A failure leaves null: nothing to show, nothing to say. */
const useQuiet = <T,>(load: () => Promise<T>, enabled: boolean): T | null => {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    load().then((value) => { if (live) setData(value); }, () => {});
    return () => { live = false; };
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps
  return data;
};

/**
 * Prices and coupons for the worked-out total, each in its own quiet call. They
 * never share a call with stock: on a database without the prices migration
 * (or on any failure) the price bits just don't show, with no toast or error.
 */
export const usePriceBook = (enabled = true): PriceBook => {
  const prices = useQuiet<Prices>(getPrices, enabled);
  const coupons = useQuiet<Coupon[]>(getCoupons, enabled);
  const workOut = useCallback(
    (lines: OrderLine[], couponCode: string | null) =>
      // Without the coupon list, a total with a coupon can't be trusted; one without still can.
      prices && (coupons || !couponCode) ? quote(lines, couponCode, coupons ?? [], prices, new Date()) : null,
    [prices, coupons],
  );
  return { coupons, workOut };
};
