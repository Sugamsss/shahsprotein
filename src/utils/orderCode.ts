// The short code on each order, e.g. SN-7KQ4M. It goes in the WhatsApp message and
// is saved with the order, so Sunit can match a chat to the order book.
// The server checks the same format (contract.md, `orders.code`).

/** No look-alikes: no 0/O, 1/I/L, and no U. */
export const ORDER_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';

const PREFIX = 'SN-';
const LENGTH = 5;

// 256 isn't a multiple of 30, so bytes 240 to 255 would favour the first 16
// characters. They're thrown away, and every character is equally likely.
const BYTE_LIMIT = 256 - (256 % ORDER_CODE_ALPHABET.length);

const ORDER_CODE = new RegExp(`^${PREFIX}[${ORDER_CODE_ALPHABET}]{${LENGTH}}$`);

/** A new random code, e.g. "SN-7KQ4M". */
export const makeOrderCode = (): string => {
  let code = '';
  while (code.length < LENGTH) {
    for (const byte of crypto.getRandomValues(new Uint8Array(8))) {
      if (byte >= BYTE_LIMIT) continue;
      code += ORDER_CODE_ALPHABET[byte % ORDER_CODE_ALPHABET.length];
      if (code.length === LENGTH) break;
    }
  }
  return PREFIX + code;
};

/** A code as the site makes it: upper case, no clash suffix. */
export const isOrderCode = (value: string): boolean => ORDER_CODE.test(value);
