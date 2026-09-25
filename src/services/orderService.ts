import type { OrderMessageInput } from '../types/order';
import { cleanName } from '../utils/orderMessage';
import { isLiveSite, postPublicRpc } from './publicRpc';

/**
 * Saves the order to the order book (`submit_order`), exactly as the message has it.
 * Called from Send's click and from "Try again". It returns straight away and never
 * throws, so nothing waits before WhatsApp opens (that's what keeps iOS and in-app
 * browsers working). A failed save is fine: the WhatsApp message still goes, and
 * Sunit adds the order by hand with the code from the chat. Saving the same order
 * again does nothing on the server. Only the live site saves (see `isLiveSite`).
 */
export const saveOrder = ({ code, lines, name, pincode, coupon }: OrderMessageInput): void => {
  if (!isLiveSite() || lines.length === 0) return;
  postPublicRpc('submit_order', {
    p_code: code,
    p_lines: lines.map((line) => ({ product_id: line.productId, size: line.size, quantity: line.quantity })),
    p_name: cleanName(name),
    p_pincode: pincode.trim(),
    // Only when the message carries a coupon.
    ...(coupon ? { p_coupon: coupon.code } : {}),
  });
};
