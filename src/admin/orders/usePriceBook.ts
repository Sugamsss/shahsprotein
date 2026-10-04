import { useCallback, useEffect, useState } from 'react';
import { getCoupons, getPrices } from '../api';
import type { Coupon, OrderLine, Prices } from '../types';
import { quote, type Quote } from './quote';

export interface PriceBook {
  /**
   * Null until loaded, and for good if the call fails: on a database without the
   * prices migration (or any failure) every price bit stays hidden.
   */
  prices: Prices | null;
  /** In Coupons page order. Null until loaded, or if that call fails. */
  coupons: Coupon[] | null;
  /** Both loaded: the coupon picker and the worked-out total can show. */
  ready: boolean;
  /** Both calls have answered, loaded or failed: nothing more is coming. */
  settled: boolean;
  /** The worked-out total, or null when prices aren't loaded. */
  workOut: (lines: OrderLine[], couponCode: string | null) => Quote | null;
  /** Puts a save's answer (setPrices returns the whole list) on screen. */
  showPrices: (prices: Prices) => void;
}

/** Runs `load` each time `enabled` turns on. A failure leaves null: nothing to show, nothing to say. */
const useQuiet = <T,>(load: () => Promise<T>, enabled: boolean) => {
  const [data, setData] = useState<T | null>(null);
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    load().then((value) => { if (live) setData(value); }, () => {}).finally(() => { if (live) setDone(true); });
    return () => { live = false; };
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps
  return [data, setData, done] as const;
};

/**
 * Prices and coupons for the worked-out total, each in its own quiet call. They
 * never share a call with stock: on a database without the prices migration
 * (or on any failure) the price bits just don't show, with no toast or error.
 */
export const usePriceBook = (enabled = true): PriceBook => {
  const [prices, showPrices, pricesDone] = useQuiet<Prices>(getPrices, enabled);
  const [coupons, , couponsDone] = useQuiet<Coupon[]>(getCoupons, enabled);
  const workOut = useCallback(
    (lines: OrderLine[], couponCode: string | null) =>
      // Without the coupon list, a total with a coupon can't be trusted; one without still can.
      prices && (coupons || !couponCode) ? quote(lines, couponCode, coupons ?? [], prices, new Date()) : null,
    [prices, coupons],
  );
  return { prices, coupons, ready: !!prices && !!coupons, settled: pricesDone && couponsDone, workOut, showPrices };
};
