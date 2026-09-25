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
export type CouponCheck =
  | { status: 'valid'; code: string; description: string }
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
}

/** Everything the WhatsApp message needs. Name and pincode are never stored or tracked. */
export interface OrderMessageInput {
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
