/** One line in the order: a product in one pack size. productId + size is the key. */
export interface OrderLine {
  productId: string;
  /** A pack size exactly as it appears in the product's `weightOptions`, e.g. "250 g". */
  size: string;
  /** A whole number from 1 to `siteConfig.order.maxQuantity`. */
  quantity: number;
}

/**
 * What happened when something was added: `added` in full, `capped` when the line hit
 * the limit and couldn't take all of it (including when it was already at the limit),
 * or `invalid` for a product or size that doesn't exist.
 */
export type AddResult = 'added' | 'capped' | 'invalid';

/**
 * The answer to a coupon check. `code` is the normalised code that was checked,
 * so the UI can ignore an answer for something the person has since changed.
 * `unavailable` covers no network, a timeout, the rate limit and a missing Supabase.
 */
/** A coupon's prices in whole rupees, keyed by `couponPriceKey(productId, size)`. */
export type CouponPrices = Record<string, number>;

export type CouponCheck =
  /** `prices`: the coupon's own price per pack (`couponPriceKey`); a pack not in it costs its MRP. */
  | { status: 'valid'; code: string; description: string; prices: CouponPrices }
  | { status: 'invalid'; code: string }
  | { status: 'unavailable'; code: string };

/**
 * A coupon as it goes in the message. `checked: false` is a code the server couldn't
 * check (or hadn't answered yet), so the message marks it "not checked yet".
 * Codes the server said are not valid are left out, so they never get here.
 */
export interface MessageCoupon {
  code: string;
  checked: boolean;
  /** A checked coupon's own prices (check_coupon), used for the line amounts and the total. */
  prices?: CouponPrices;
}

/**
 * Everything the WhatsApp message needs, and what's saved to the order book on Send.
 * Name and pincode are never put in storage or tracked.
 */
export interface OrderMessageInput {
  /** The order code, e.g. "SN-7KQ4M" (utils/orderCode). */
  code: string;
  lines: OrderLine[];
  name: string;
  pincode: string;
  coupon?: MessageCoupon | null;
}

/** One piece of the message. `blank` pieces only appear in the preview, where a value is still missing. */
export interface MessagePart {
  text: string;
  blank?: 'name' | 'pincode';
}
