import { useSyncExternalStore } from 'react';
import { productsData } from '../data/products';
import type { CouponPrices } from '../types/order';
import { getPublicRpc } from './publicRpc';
import { parseWebsiteOffer } from './offerService';
import { couponPriceKey, setLiveMrps, setLiveOfferPrices } from '../utils/prices';

const STORAGE_KEY = 'shahs-prices-v2';
const CACHE_TTL_MS = 5 * 60 * 1000;
const TIMEOUT_MS = 5000;
interface PriceEnvelope { schema_version: 1; fetched_at: number; offer: unknown }
let currentOffer: ReturnType<typeof parseWebsiteOffer> = null;
let currentPrices: Readonly<CouponPrices> | null = null;
let started = false;
let expiryTimer: ReturnType<typeof setTimeout> | undefined;
let refreshGeneration = 0;
const listeners = new Set<() => void>();

const fromOffer = (raw: unknown): { offer: NonNullable<typeof currentOffer>; prices: CouponPrices } | null => {
  const offer = parseWebsiteOffer(raw);
  if (!offer || Date.parse(offer.expires_at) <= Date.now()) return null;
  const prices: CouponPrices = {};
  for (const pack of offer.packs) prices[couponPriceKey(pack.product_id, pack.size)] = pack.price;
  if (productsData.some((product) => product.weightOptions.some((size) => prices[couponPriceKey(product.id, size)] == null))) return null;
  return { offer, prices };
};

const notify = () => listeners.forEach((listener) => listener());

/** Drop the guest list now: the cards fall back to plain MRPs, never to an expired price. */
const clear = (): void => {
  clearTimeout(expiryTimer);
  expiryTimer = undefined;
  if (!currentOffer && !currentPrices) return;
  currentOffer = null;
  currentPrices = null;
  setLiveOfferPrices(null);
  notify();
};

const MAX_TIMER_MS = 2_147_000_000;

/** Re-arm at the offer's expiry; long-lived offers wait in chunks a timer can hold. */
const scheduleExpiry = (offer: NonNullable<typeof currentOffer>): void => {
  clearTimeout(expiryTimer);
  const delay = Math.max(0, Date.parse(offer.expires_at) - Date.now()) + 1000;
  if (delay > MAX_TIMER_MS) {
    expiryTimer = setTimeout(() => {
      if (currentOffer === offer) scheduleExpiry(offer);
    }, MAX_TIMER_MS);
    return;
  }
  expiryTimer = setTimeout(() => {
    clear();
    void refresh();
  }, delay);
};

/**
 * Show one complete offer until its expiry, then ask for the next version. A
 * successful refresh replaces it early; a failed one leaves a still-valid offer
 * alone and clears an expired one.
 */
const apply = (offer: NonNullable<typeof currentOffer>, prices: CouponPrices, raw: unknown): void => {
  currentOffer = offer;
  currentPrices = prices;
  setLiveMrps(Object.fromEntries(offer.packs.map((pack) => [couponPriceKey(pack.product_id, pack.size), pack.mrp])));
  setLiveOfferPrices(prices);
  scheduleExpiry(offer);
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ schema_version: 1, fetched_at: Date.now(), offer: raw } satisfies PriceEnvelope)); } catch { /* Storage is optional. */ }
  notify();
};

const readCache = (): void => {
  try {
    const envelope = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null') as PriceEnvelope | null;
    if (envelope?.schema_version === 1 && Date.now() - envelope.fetched_at < CACHE_TTL_MS) {
      const parsed = fromOffer(envelope.offer);
      if (parsed) apply(parsed.offer, parsed.prices, envelope.offer);
    }
  } catch { /* Blocked or malformed storage means fetch current prices. */ }
};

const refresh = async (): Promise<void> => {
  const generation = ++refreshGeneration;
  try {
    const data = await getPublicRpc('get_website_offer', { timeoutMs: TIMEOUT_MS });
    if (generation !== refreshGeneration) return; // a newer read already won
    const parsed = fromOffer(data);
    if (parsed) { apply(parsed.offer, parsed.prices, data); return; }
    if (currentOffer && Date.parse(currentOffer.expires_at) <= Date.now()) clear();
  } catch {
    if (generation !== refreshGeneration) return;
    // Offline or failed: keep a list that is still valid; never keep an expired one.
    if (currentOffer && Date.parse(currentOffer.expires_at) <= Date.now()) clear();
  }
};

const start = () => {
  if (started) return;
  started = true;
  readCache();
  void refresh();
  window.addEventListener('focus', () => void refresh());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void refresh(); });
};
const subscribe = (listener: () => void) => { listeners.add(listener); start(); return () => listeners.delete(listener); };
export const usePrices = (): Readonly<CouponPrices> | null => useSyncExternalStore(subscribe, () => currentPrices);
export const useWebsiteOffer = () => useSyncExternalStore(subscribe, () => currentOffer);
