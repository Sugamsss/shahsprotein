import { describe, expect, it } from 'vitest';
import { buildOrderMessage, orderMessageParts } from './orderMessage';

// The exact text the customer sends and Sunit reads. When the wording in
// siteConfig.order.message changes on purpose, update these strings with it.

// Deliberately out of order: the message lists products in catalogue order
// (Raggi Jaggi, Muesli, Date Bites), smaller pack first.
const lines = [
  { productId: 'muesli', size: '500 g', quantity: 1 },
  { productId: 'bites', size: '250 g', quantity: 1 },
  { productId: 'muesli', size: '250 g', quantity: 2 },
  { productId: 'raggi-jaggi', size: '250 g', quantity: 1 },
];

describe('buildOrderMessage', () => {
  it('writes the full order in catalogue order, with a checked coupon', () => {
    expect(buildOrderMessage({ lines, name: 'Anjali', pincode: '415001', coupon: { code: 'example10', checked: true } })).toBe(
      "Hi! I'm Anjali, and I'd like to place an order:\n"
      + '\n'
      + '• Raggi Jaggi 250 g × 1\n'
      + '• Muesli 250 g × 2\n'
      + '• Muesli 500 g × 1\n'
      + '• Date Bites 250 g × 1\n'
      + '\n'
      + 'Coupon: EXAMPLE10\n'
      + 'Pincode: 415001\n'
      + '\n'
      + 'Could you send me the total?',
    );
  });

  it('marks a coupon the server could not check, and leaves out no coupon at all', () => {
    const one = [{ productId: 'muesli', size: '250 g', quantity: 2 }];
    expect(buildOrderMessage({ lines: one, name: 'Anjali', pincode: '415001', coupon: { code: 'EXAMPLE10', checked: false } })).toBe(
      "Hi! I'm Anjali, and I'd like to place an order:\n"
      + '\n'
      + '• Muesli 250 g × 2\n'
      + '\n'
      + 'Coupon: EXAMPLE10 (not checked yet)\n'
      + 'Pincode: 415001\n'
      + '\n'
      + 'Could you send me the total?',
    );
    expect(buildOrderMessage({ lines: one, name: 'Anjali', pincode: '415001', coupon: null })).toBe(
      "Hi! I'm Anjali, and I'd like to place an order:\n"
      + '\n'
      + '• Muesli 250 g × 2\n'
      + '\n'
      + 'Pincode: 415001\n'
      + '\n'
      + 'Could you send me the total?',
    );
  });

  it('keeps a name or pincode with odd whitespace on one tidy line', () => {
    const message = buildOrderMessage({
      lines: [{ productId: 'muesli', size: '250 g', quantity: 2 }],
      name: '  Priya\n\tShah  ',
      pincode: ' 415001\n',
    });
    expect(message).toBe(
      "Hi! I'm Priya Shah, and I'd like to place an order:\n"
      + '\n'
      + '• Muesli 250 g × 2\n'
      + '\n'
      + 'Pincode: 415001\n'
      + '\n'
      + 'Could you send me the total?',
    );
  });
});

describe('orderMessageParts with blanks (the preview)', () => {
  it('matches the sent text once the blanks are filled in', () => {
    const input = { lines: [{ productId: 'bites', size: '250 g', quantity: 1 }], name: '', pincode: '' };
    const parts = orderMessageParts(input, { blanks: true });

    expect(parts.filter((part) => part.blank).map((part) => [part.blank, part.text])).toEqual([
      ['name', 'your name'],
      ['pincode', 'your pincode'],
    ]);
    const filled = parts.map((part) => (part.blank === 'name' ? 'Anjali' : part.blank === 'pincode' ? '415001' : part.text)).join('');
    expect(filled).toBe(buildOrderMessage({ ...input, name: 'Anjali', pincode: '415001' }));
  });
});
