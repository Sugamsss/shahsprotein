import { productsData } from '../data/products';
import { siteConfig } from '../data/siteConfig';
import type { Product } from '../types/product';
import type { OrderMessageInput } from '../types/order';
import { whatsappUrl } from './contact';

// Builds the WhatsApp order message. Pure: the words live in siteConfig.order.message.
// No prices, totals or delivery here, by the founder's choice.

const NAME_MAX_LENGTH = 60;

// Line breaks, tabs and other control characters (C0, DEL, C1, and the Unicode
// line/paragraph separators) would break the message layout, so they become spaces.
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g;

/** One line of plain text: control characters become spaces, runs of spaces collapse. */
const toOneLine = (raw: string): string =>
  raw.replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim();

/** The name as it goes in the message: one line, single spaces, at most 60 characters. */
export const cleanName = (raw: string): string =>
  // Array.from counts characters, not UTF-16 units, so an emoji is never cut in half.
  Array.from(toOneLine(raw)).slice(0, NAME_MAX_LENGTH).join('').trim();

/** An Indian PIN code: 6 digits, not starting with 0. */
export const isValidPincode = (raw: string): boolean => /^[1-9][0-9]{5}$/.test(raw.trim());

export const buildOrderMessage = (
  input: OrderMessageInput,
  products: readonly Product[] = productsData,
): string => {
  const words = siteConfig.order.message;
  const name = cleanName(input.name);
  const coupon = toOneLine(input.coupon ?? '').toUpperCase();
  const pincode = toOneLine(input.pincode);

  const items = input.lines.flatMap((line) => {
    const product = products.find((p) => p.id === line.productId);
    return product ? [words.line(product.name, line.size, line.quantity)] : [];
  });
  const details = [
    ...(coupon ? [words.coupon(coupon)] : []),
    ...(pincode ? [words.pincode(pincode)] : []),
  ];

  // Blocks are separated by a blank line; an empty block is left out entirely.
  return [
    [name ? words.greeting(name) : words.greetingNoName],
    items,
    details,
    [words.closing],
  ]
    .filter((block) => block.length > 0)
    .map((block) => block.join('\n'))
    .join('\n\n');
};

/** The wa.me link to the order number with the message filled in. */
export const orderMessageUrl = (input: OrderMessageInput): string =>
  whatsappUrl(siteConfig.contact.order.number, buildOrderMessage(input));
