/** One line in the order: a product in one pack size. productId + size is the key. */
export interface OrderLine {
  productId: string;
  /** A pack size exactly as it appears in the product's `weightOptions`, e.g. "250 g". */
  size: string;
  /** A whole number from 1 to `siteConfig.order.maxQuantity`. */
  quantity: number;
}

/** What happened when something was added: added (maybe clamped), already at the limit, or not a real product or size. */
export type AddResult = 'added' | 'limit' | 'invalid';

/**
 * The answer to a coupon check. `code` is the normalised code that was checked,
 * so the UI can ignore an answer for something the person has since changed.
 * `unavailable` covers no network, a timeout, the rate limit and a missing Supabase.
 */
export type CouponCheck =
  | { status: 'valid'; code: string; description: string }
  | { status: 'invalid'; code: string }
  | { status: 'unavailable'; code: string };

/** Everything the WhatsApp message needs. Name and pincode are never stored or tracked. */
export interface OrderMessageInput {
  lines: OrderLine[];
  name: string;
  pincode: string;
  /** Include only a code the person wants sent. Omit or leave empty for none. */
  coupon?: string;
}
