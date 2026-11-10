import type { OrderMessageInput } from '../types/order';
import { cleanName } from '../utils/orderMessage';
import { isLiveSite, postPublicRpc } from './publicRpc';
import { markSliceAMissing } from './sliceA';

/**
 * Saves the order as a website request, exactly as the message has it: a pending
 * request Sunit confirms in the admin once the WhatsApp message comes, never an
 * active order. Called from Send's click and from "Try again". It returns
 * straight away and never throws, so nothing waits before WhatsApp opens (that's
 * what keeps iOS and in-app browsers working). A failed save is fine: the
 * WhatsApp message still goes, and Sunit adds the order by hand with the code
 * from the chat. Saving the same request again does nothing on the server.
 *
 * A frozen Slice A quote saves through `submit_website_request_v2`, which keeps
 * the snapshot. Without a quote (the old priced path, or an explicitly unpriced
 * message) it is the legacy `submit_website_request`, which falls back to
 * `submit_order` while migration 20261022000001 is not live. A v2 answer of 404
 * means the Slice A migration is not applied: that same legacy save runs, so a
 * Send never loses its request. Only the live site saves (see `isLiveSite`).
 */
export const saveOrder = ({ code, lines, name, phone, address, coupon, quote }: OrderMessageInput): void => {
  if (!isLiveSite() || lines.length === 0 || !address) return;
  const body = {
    p_code: code,
    p_lines: lines.map((line) => ({ product_id: line.productId, size: line.size, quantity: line.quantity })),
    p_name: cleanName(name),
    // Only when the message carries a coupon.
    ...(coupon ? { p_coupon: coupon.code } : {}),
  };
  const legacySave = () => postPublicRpc('submit_website_request', {
    ...body,
    p_phone: phone,
    p_address: {
      premises: address.premises,
      area: address.area,
      city: address.city,
      state: address.state,
      pincode: address.pincode,
      landmark: address.landmark ?? '',
    },
  }, () => postPublicRpc('submit_order', { ...body, p_pincode: address.pincode }));
  if (quote) {
    void import('./customerAuthClient').then(({ postCustomerQuote }) => postCustomerQuote(quote.quote_id, code, { name: cleanName(name), phone, address }, () => {
      markSliceAMissing();
      legacySave();
    }));
    return;
  }
  legacySave();
};
