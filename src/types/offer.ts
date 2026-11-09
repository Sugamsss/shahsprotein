import type { OrderLine } from './order';
import type { CouponPrices } from './order';

/** Who a price list belongs to. The server decides it; the client only displays it. */
export type OfferKind = 'guest' | 'first' | 'second' | 'third_plus' | 'coupon' | 'mrp';

/** When delivery is free, and what it costs otherwise. Amounts in whole rupees. */
export interface DeliveryRule {
  min_grams: number | null;
  min_packs: number | null;
  up_to_250: number;
  above_250: number;
  cap: number;
}

export interface WebsiteOffer {
  schema_version: 1; status: 'ready'; version: string; server_time: string; expires_at: string;
  currency: 'INR'; offer: { label: string; kind: OfferKind };
  packs: Array<{ product_id: string; size: string; grams: number; mrp: number; price: number }>;
  delivery: DeliveryRule;
}

export interface QuoteLine {
  product_id: string;
  size: string;
  quantity: number;
  grams: number;
  mrp: number;
  /** Whole rupees for one pack. */
  unit_price: number;
  line_total: number;
}

/** One pack at the chosen candidate's rate, so cards and the popup show the same list as the cart. */
export interface QuoteCataloguePack {
  product_id: string;
  size: string;
  mrp: number;
  unit_price: number;
}

export interface WebsiteQuote {
  quote_id: string;
  expires_at: string;
  version: string;
  offer_kind: OfferKind;
  /** The coupon this quote was priced with, when the coupon candidate won. */
  coupon_code: string | null;
  free_delivery_rule: DeliveryRule;
  lines: QuoteLine[];
  /** All five packs at the chosen candidate's rates; `lines` carries only what's in the cart. */
  catalogue: QuoteCataloguePack[];
  mrp_total: number;
  items_total: number;
  savings: number;
  grams: number;
  packs: number;
  delivery_base: number;
  delivery_waived: boolean;
  delivery_fee: number;
  /** What the customer pays: items_total + delivery_fee. */
  total: number;
  currency: 'INR';
}

/** The quote as saved on a request or an order; the same amounts, frozen at Send. */
export type OrderQuoteSnapshot = WebsiteQuote;

export type QuoteResult = { status: 'ready'; quote: WebsiteQuote; prices: CouponPrices } | { status: 'unavailable'; message: string };
export type QuoteLines = readonly Pick<OrderLine, 'productId' | 'size' | 'quantity'>[];
