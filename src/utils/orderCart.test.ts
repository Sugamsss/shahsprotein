import { describe, expect, it } from 'vitest';
import { addLine, parseStoredCart } from './orderCart';

// Uses the real product list: Muesli comes in 250 g and 500 g, Date Bites in 250 g only.
// The limit is siteConfig.order.maxQuantity (10 packs per line).

describe('addLine', () => {
  it('merges the same product and size into one line, and keeps other sizes apart', () => {
    let { lines } = addLine([], 'muesli', '250 g', 2);
    ({ lines } = addLine(lines, 'muesli', '500 g'));
    ({ lines } = addLine(lines, 'muesli', '250 g', 3));

    expect(lines).toEqual([
      { productId: 'muesli', size: '250 g', quantity: 5 },
      { productId: 'muesli', size: '500 g', quantity: 1 },
    ]);
  });

  it('stops a line at 10 packs', () => {
    const nine = [{ productId: 'bites', size: '250 g', quantity: 9 }];

    const clamped = addLine(nine, 'bites', '250 g', 3);
    expect(clamped.result).toBe('added');
    expect(clamped.lines).toEqual([{ productId: 'bites', size: '250 g', quantity: 10 }]);

    const full = addLine(clamped.lines, 'bites', '250 g');
    expect(full.result).toBe('limit');
    expect(full.lines).toEqual([{ productId: 'bites', size: '250 g', quantity: 10 }]);
  });
});

describe('parseStoredCart', () => {
  it('drops lines whose product or pack size is gone, and merges duplicates', () => {
    const saved = JSON.stringify({
      v: 1,
      lines: [
        { productId: 'muesli', size: '250 g', quantity: 6 },
        { productId: 'bites', size: '500 g', quantity: 1 },
        { productId: 'protein-bar', size: '250 g', quantity: 2 },
        { productId: 'muesli', size: '250 g', quantity: 6 },
      ],
    });

    expect(parseStoredCart(saved)).toEqual({
      lines: [{ productId: 'muesli', size: '250 g', quantity: 10 }],
      dropped: 2,
    });
  });

  it('treats unreadable saved data as an empty cart', () => {
    expect(parseStoredCart('{not json')).toEqual({ lines: [], dropped: 0 });
    expect(parseStoredCart(JSON.stringify({ lines: 'nope' }))).toEqual({ lines: [], dropped: 0 });
  });
});
