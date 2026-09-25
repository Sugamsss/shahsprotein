import { describe, expect, it } from 'vitest';
import { addLine, countItems, inStockLines, parseStoredCart } from './orderCart';

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

  it('stops a line at 10 packs and says it was capped', () => {
    const nine = [{ productId: 'bites', size: '250 g', quantity: 9 }];

    const toTen = addLine(nine, 'bites', '250 g');
    expect(toTen.result).toBe('added');
    expect(toTen.lines).toEqual([{ productId: 'bites', size: '250 g', quantity: 10 }]);

    const over = addLine(nine, 'bites', '250 g', 3);
    expect(over.result).toBe('capped');
    expect(over.lines).toEqual([{ productId: 'bites', size: '250 g', quantity: 10 }]);

    const full = addLine(toTen.lines, 'bites', '250 g');
    expect(full.result).toBe('capped');
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

describe('inStockLines (what the message and the save carry)', () => {
  it('leaves out lines that are out of stock, and keeps the rest in catalogue order', () => {
    const cart = [
      { productId: 'bites', size: '250 g', quantity: 1 },
      { productId: 'muesli', size: '500 g', quantity: 2 },
      { productId: 'muesli', size: '250 g', quantity: 1 },
    ];
    const isOut = (productId: string, size: string) => productId === 'muesli' && size === '500 g';

    expect(inStockLines(cart, isOut)).toEqual([
      { productId: 'muesli', size: '250 g', quantity: 1 },
      { productId: 'bites', size: '250 g', quantity: 1 },
    ]);
    expect(inStockLines(cart, () => true)).toEqual([]);
  });

  it('gives the header count only the packs that will be sent', () => {
    // Raggi Jaggi 1 + Muesli 2 in stock, Date Bites 1 out: the header says 3, not 4.
    const cart = [
      { productId: 'raggi-jaggi', size: '250 g', quantity: 1 },
      { productId: 'muesli', size: '500 g', quantity: 2 },
      { productId: 'bites', size: '250 g', quantity: 1 },
    ];
    const isOut = (productId: string) => productId === 'bites';

    expect(countItems(cart)).toBe(4);
    expect(countItems(inStockLines(cart, isOut))).toBe(3);
  });
});
