import type { DeliveryRule, QuoteLines, QuoteResult, WebsiteOffer, WebsiteQuote } from '../types/offer';
import { getPublicRpc } from './publicRpc';

const TIMEOUT_MS = 5000;
const packKeys = ['muesli|250 g', 'muesli|500 g', 'raggi-jaggi|250 g', 'raggi-jaggi|500 g', 'bites|250 g'];
const isWhole = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value > 0;
const isTime = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));

const parseDelivery = (raw: unknown): DeliveryRule | null => {
  if (!raw || typeof raw !== 'object') return null;
  const rule = raw as Partial<DeliveryRule>;
  const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0;
  const isThreshold = (value: unknown): value is number | null => value === null || isCount(value);
  const upTo = rule.up_to_250;
  const above = rule.above_250;
  const cap = rule.cap;
  if (!isThreshold(rule.min_grams) || !isThreshold(rule.min_packs)) return null;
  if (rule.min_grams == null && rule.min_packs == null) return null;
  if (!isCount(upTo) || !isCount(above) || !isCount(cap)) return null;
  if (above < upTo || cap < above) return null;
  return {
    min_grams: rule.min_grams ?? null,
    min_packs: rule.min_packs ?? null,
    up_to_250: upTo,
    above_250: above,
    cap,
  };
};

export const parseWebsiteOffer = (raw: unknown): WebsiteOffer | null => {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Partial<WebsiteOffer>;
  if (value.schema_version !== 1 || value.status !== 'ready' || value.currency !== 'INR' || !value.version || !isTime(value.expires_at) || Date.parse(value.expires_at) <= Date.now() || !Array.isArray(value.packs) || value.packs.length !== 5) return null;
  const delivery = parseDelivery(value.delivery);
  if (!delivery) return null;
  const keys = new Set<string>();
  for (const pack of value.packs) {
    if (!pack || typeof pack.product_id !== 'string' || typeof pack.size !== 'string' || !isWhole(pack.grams) || !isWhole(pack.mrp) || !isWhole(pack.price) || pack.price > pack.mrp) return null;
    keys.add(`${pack.product_id}|${pack.size}`);
  }
  return packKeys.every((key) => keys.has(key)) ? { ...value, delivery } as WebsiteOffer : null;
};

export const getWebsiteOffer = async (): Promise<WebsiteOffer | null> => parseWebsiteOffer(await getPublicRpc('get_website_offer', { timeoutMs: TIMEOUT_MS }));

/** A complete, internally consistent quote, or null so the caller shows the unpriced path. */
export const parseWebsiteQuote = (raw: unknown, lineCount: number): WebsiteQuote | null => {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Partial<WebsiteQuote>;
  if (typeof value.quote_id !== 'string' || !value.quote_id || !isTime(value.expires_at) || Date.parse(value.expires_at) <= Date.now()) return null;
  if (value.currency !== 'INR' || !Array.isArray(value.lines) || value.lines.length !== lineCount || !Array.isArray(value.catalogue) || value.catalogue.length !== 5) return null;
  if (!['guest', 'first', 'second', 'third_plus', 'coupon', 'mrp'].includes(value.offer_kind ?? '')) return null;
  const rule = parseDelivery(value.free_delivery_rule);
  if (!rule) return null;
  const catalogue = new Set<string>();
  for (const pack of value.catalogue) {
    if (!pack || typeof pack.product_id !== 'string' || typeof pack.size !== 'string' || !isWhole(pack.mrp) || !isWhole(pack.unit_price) || pack.unit_price > pack.mrp) return null;
    catalogue.add(`${pack.product_id}|${pack.size}`);
  }
  if (!packKeys.every((key) => catalogue.has(key))) return null;
  for (const line of value.lines) {
    if (!line || typeof line.product_id !== 'string' || typeof line.size !== 'string' || !isWhole(line.quantity) || !isWhole(line.mrp) || !isWhole(line.unit_price) || !isWhole(line.line_total)) return null;
    if (line.line_total !== line.unit_price * line.quantity) return null;
  }
  const sums = ['mrp_total', 'items_total', 'savings', 'grams', 'packs', 'delivery_base', 'delivery_fee', 'total'] as const;
  if (sums.some((key) => typeof value[key] !== 'number' || !Number.isInteger(value[key]) || (value[key] as number) < 0)) return null;
  if (value.delivery_fee !== (value.delivery_waived ? 0 : value.delivery_base)) return null;
  if (value.total !== (value.items_total as number) + (value.delivery_fee as number)) return null;
  return { ...value, free_delivery_rule: rule } as WebsiteQuote;
};

/** Authenticated quotes are invoked through the dedicated customer client transport. */
export const quoteWebsiteOrder = async (lines: QuoteLines, code: string, coupon: string | null = null): Promise<QuoteResult> => {
  try {
    const { quoteWithCustomerSession } = await import('./customerAuthClient');
    return await quoteWithCustomerSession(lines, code, coupon);
  } catch {
    return { status: 'unavailable', message: 'Offer could not be confirmed.' };
  }
};
