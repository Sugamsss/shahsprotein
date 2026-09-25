import { afterEach, describe, expect, it, vi } from 'vitest';
import { ORDER_CODE_ALPHABET, isOrderCode, makeOrderCode } from './orderCode';

// The server only accepts SN- plus 5 characters from this alphabet
// (contract.md, `orders.code`), so a code the site makes must always pass it.
const SERVER_CODE_PATTERN = /^SN-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{5}$/;

afterEach(() => {
  vi.restoreAllMocks();
});

/** Makes crypto.getRandomValues hand out these bytes, in order. */
const feedBytes = (bytes: number[]) => {
  const queue = [...bytes];
  vi.spyOn(crypto, 'getRandomValues').mockImplementation(<T extends ArrayBufferView | null>(array: T): T => {
    const view = array as unknown as Uint8Array;
    for (let i = 0; i < view.length; i += 1) view[i] = queue.shift() ?? 0;
    return array;
  });
};

describe('makeOrderCode', () => {
  it('makes codes the server accepts, using only the look-alike-free alphabet', () => {
    expect(ORDER_CODE_ALPHABET).toHaveLength(30);
    expect(ORDER_CODE_ALPHABET).not.toMatch(/[01ILOU]/);
    for (let i = 0; i < 500; i += 1) {
      const code = makeOrderCode();
      expect(code).toMatch(SERVER_CODE_PATTERN);
      expect(isOrderCode(code)).toBe(true);
    }
  });

  it('throws away bytes 240 and up, so no character is favoured', () => {
    // 240..255 are skipped; 239 is the last usable byte (the last character),
    // then 0, 30 and 60 all map to the first character, and 29 to the last.
    feedBytes([255, 240, 248, 239, 0, 30, 60, 29]);
    expect(makeOrderCode()).toBe('SN-Z222Z');
  });

  it('keeps asking for bytes until it has five usable ones', () => {
    feedBytes([...Array(20).fill(250), 1, 2, 3, 4, 5]);
    expect(makeOrderCode()).toBe('SN-34567');
  });
});

describe('isOrderCode', () => {
  it.each([
    ['SN-7KQ4M', true],
    ['sn-7kq4m', false], // the site always makes upper case
    ['SN-7KQ4O', false], // O isn't in the alphabet
    ['SN-7KQ4', false],
    ['SN-7KQ4MM', false],
    ['SN-7KQ4M-2', false], // clash suffixes are the server's, never the site's
    ['7KQ4M', false],
  ])('%s -> %s', (value, expected) => {
    expect(isOrderCode(value)).toBe(expected);
  });
});
