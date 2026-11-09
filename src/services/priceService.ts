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
const readCache = (): void => {
  try {
    const envelope = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null') as PriceEnvelope | null;
    if (envelope?.schema_version === 1 && Date.now() - envelope.fetched_at < CACHE_TTL_MS) {
      const parsed = fromOffer(envelope.offer);
      if (parsed) { currentOffer = parsed.offer; currentPrices = parsed.prices; setLiveMrps(Object.fromEntries(parsed.offer.packs.map((pack) => [couponPriceKey(pack.product_id, pack.size), pack.mrp]))); setLiveOfferPrices(parsed.prices); }
    }
  } catch { /* Blocked or malformed storage means fetch current prices. */ }
};
const refresh = async (): Promise<void> => {
  const data = await getPublicRpc('get_website_offer', { timeoutMs: TIMEOUT_MS });
  const parsed = fromOffer(data);
  if (!parsed) return;
  currentOffer = parsed.offer;
  currentPrices = parsed.prices;
  setLiveMrps(Object.fromEntries(parsed.offer.packs.map((pack) => [couponPriceKey(pack.product_id, pack.size), pack.mrp])));
  setLiveOfferPrices(parsed.prices);
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ schema_version: 1, fetched_at: Date.now(), offer: data } satisfies PriceEnvelope)); } catch { /* Storage is optional. */ }
  notify();
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
export const refreshPrices = (): void => { started = false; start(); };
export const usePrices = (): Readonly<CouponPrices> | null => useSyncExternalStore(subscribe, () => currentPrices);
export const useWebsiteOffer = () => useSyncExternalStore(subscribe, () => currentOffer);
