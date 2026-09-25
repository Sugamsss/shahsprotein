import { productsData } from '../data/products';
import { siteConfig } from '../data/siteConfig';
import type { Product } from '../types/product';
import type { MessagePart, OrderMessageInput } from '../types/order';
import { whatsappUrl } from './contact';
import { sortLines } from './orderCart';

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

/** A name long enough to know who's ordering (2+ characters once cleaned). */
export const isValidName = (raw: string): boolean => Array.from(cleanName(raw)).length >= 2;

/** An Indian PIN code: 6 digits, not starting with 0. */
export const isValidPincode = (raw: string): boolean => /^[1-9][0-9]{5}$/.test(raw.trim());

// Stands in for a missing value while a template is filled, then is cut back out,
// so a blank sits exactly where the value would go, whatever the wording.
const SLOT = '\u0000';

/** Fills a one-value template, or leaves a blank part where a missing value will go. */
const fill = (
  template: (value: string) => string,
  value: string,
  blank: 'name' | 'pincode',
  blankText: string,
): MessagePart[] => {
  if (value) return [{ text: template(value) }];
  const [before, after = ''] = template(SLOT).split(SLOT);
  return [{ text: before }, { text: blankText, blank }, { text: after }].filter((part) => part.text);
};

/**
 * The message as parts. Without `blanks` it's exactly what's sent (no name means the
 * fallback greeting, no pincode means no pincode line). With `blanks`, for the preview,
 * a missing name or pincode shows as a blank part where the value will go.
 */
export const orderMessageParts = (
  input: OrderMessageInput,
  options: { blanks?: boolean } = {},
  products: readonly Product[] = productsData,
): MessagePart[] => {
  const words = siteConfig.order.message;
  const { previewBlankName, previewBlankPincode } = siteConfig.order;
  const name = cleanName(input.name);
  const pincode = toOneLine(input.pincode);
  const couponCode = toOneLine(input.coupon?.code ?? '').toUpperCase();

  const greeting: MessagePart[] = name || options.blanks
    ? fill(words.greeting, name, 'name', previewBlankName)
    : [{ text: words.greetingNoName }];

  const items = sortLines(input.lines, products).flatMap((line) => {
    const product = products.find((p) => p.id === line.productId);
    return product ? [words.line(product.name, line.size, line.quantity)] : [];
  });

  const details: MessagePart[][] = [];
  if (couponCode) {
    const checked = input.coupon?.checked ?? false;
    details.push([{ text: checked ? words.coupon(couponCode) : words.couponUnchecked(couponCode) }]);
  }
  if (pincode || options.blanks) {
    details.push(fill(words.pincode, pincode, 'pincode', previewBlankPincode));
  }

  // Blocks are separated by a blank line; an empty block is left out entirely.
  const blocks: MessagePart[][] = [
    greeting,
    items.length ? [{ text: items.join('\n') }] : [],
    details.flatMap((line, i) => (i === 0 ? line : [{ text: '\n' }, ...line])),
    [{ text: words.closing }],
  ].filter((block) => block.length > 0);

  return blocks.flatMap((block, i) => (i === 0 ? block : [{ text: '\n\n' }, ...block]));
};

/** The exact text sent to WhatsApp. */
export const buildOrderMessage = (
  input: OrderMessageInput,
  products: readonly Product[] = productsData,
): string => orderMessageParts(input, {}, products).map((part) => part.text).join('');

/** The wa.me link to the order number with the message filled in. */
export const orderMessageUrl = (input: OrderMessageInput): string =>
  whatsappUrl(siteConfig.contact.order.number, buildOrderMessage(input));
