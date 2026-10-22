import type { OrderMessageInput } from '../types/order';
import { cleanName } from '../utils/orderMessage';
import { isLiveSite, postPublicRpc } from './publicRpc';

/**
 * Saves the order as a website request (`submit_website_request`), exactly as the
 * message has it: a pending request Sunit confirms in the admin once the WhatsApp
 * message comes, never an active order. Called from Send's click and from "Try
 * again". It returns straight away and never throws, so nothing waits before
 * WhatsApp opens (that's what keeps iOS and in-app browsers working). A failed save
 * is fine: the WhatsApp message still goes, and Sunit adds the order by hand with
 * the code from the chat. Saving the same request again does nothing on the server.
 * Until migration 20261022000001 is live, the database has no
 * `submit_website_request`, so it falls back to `submit_order` (name and pincode).
 * Only the live site saves (see `isLiveSite`).
 */
export const saveOrder = ({ code, lines, name, phone, address, coupon }: OrderMessageInput): void => {
  if (!isLiveSite() || lines.length === 0 || !address) return;
  const common = {
    p_code: code,
    p_lines: lines.map((line) => ({ product_id: line.productId, size: line.size, quantity: line.quantity })),
    p_name: cleanName(name),
    // Only when the message carries a coupon.
    ...(coupon ? { p_coupon: coupon.code } : {}),
  };
  postPublicRpc('submit_website_request', {
    ...common,
    p_phone: phone,
    p_address: {
      premises: address.premises,
      area: address.area,
      city: address.city,
      state: address.state,
      pincode: address.pincode,
      landmark: address.landmark ?? '',
    },
  }, () => postPublicRpc('submit_order', { ...common, p_pincode: address.pincode }));
};
