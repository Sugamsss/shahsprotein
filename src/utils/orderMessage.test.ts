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
    expect(buildOrderMessage({ code: 'SN-7KQ4M', lines, name: 'Anjali', pincode: '415001', coupon: { code: 'example10', checked: true } })).toBe(
      "Hi! I'm Anjali, and I'd like to place an order:\n"
      + '\n'
      + '• Raggi Jaggi 250 g × 1 · ₹165\n'
      + '• Muesli 250 g × 2 · ₹560\n'
      + '• Muesli 500 g × 1 · ₹550\n'
      + '• Date Bites 250 g × 1 · ₹220\n'
      + '\n'
      + 'Total: ₹1,495 (before delivery)\n'
      + '\n'
      + 'Coupon: EXAMPLE10\n'
      + 'Pincode: 415001\n'
      + 'Order code: SN-7KQ4M\n'
      + '\n'
      + 'Could you let me know the delivery charge and how to pay?',
    );
  });

  it("prices packs at a checked coupon's own prices, and the rest at MRP", () => {
    const coupon = { code: 'EXAMPLE10', checked: true, prices: { 'muesli|250 g': 250 } };
    expect(buildOrderMessage({ code: 'SN-7KQ4M', lines, name: 'Anjali', pincode: '415001', coupon })).toBe(
      "Hi! I'm Anjali, and I'd like to place an order:\n"
      + '\n'
      + '• Raggi Jaggi 250 g × 1 · ₹165\n'
      + '• Muesli 250 g × 2 · ₹500\n'
      + '• Muesli 500 g × 1 · ₹550\n'
      + '• Date Bites 250 g × 1 · ₹220\n'
      + '\n'
      + 'Total: ₹1,435 (before delivery)\n'
      + '\n'
      + 'Coupon: EXAMPLE10\n'
      + 'Pincode: 415001\n'
      + 'Order code: SN-7KQ4M\n'
      + '\n'
      + 'Could you let me know the delivery charge and how to pay?',
    );
  });

  it('leaves out the amount and the total when a pack has no price', () => {
    const odd = [{ productId: 'bites', size: '500 g', quantity: 1 }, { productId: 'muesli', size: '250 g', quantity: 1 }];
    expect(buildOrderMessage({ code: 'SN-7KQ4M', lines: odd, name: 'Anjali', pincode: '415001' })).toBe(
      "Hi! I'm Anjali, and I'd like to place an order:\n"
      + '\n'
      + '• Muesli 250 g × 1 · ₹280\n'
      + '• Date Bites 500 g × 1\n'
      + '\n'
      + 'Pincode: 415001\n'
      + 'Order code: SN-7KQ4M\n'
      + '\n'
      + 'Could you let me know the delivery charge and how to pay?',
    );
  });

  it('marks a coupon the server could not check, and leaves out no coupon at all', () => {
    const one = [{ productId: 'muesli', size: '250 g', quantity: 2 }];
    expect(buildOrderMessage({ code: 'SN-7KQ4M', lines: one, name: 'Anjali', pincode: '415001', coupon: { code: 'EXAMPLE10', checked: false } })).toBe(
      "Hi! I'm Anjali, and I'd like to place an order:\n"
      + '\n'
      + '• Muesli 250 g × 2 · ₹560\n'
      + '\n'
      + 'Total: ₹560 (before delivery)\n'
      + '\n'
      + 'Coupon: EXAMPLE10 (not checked yet)\n'
      + 'Pincode: 415001\n'
      + 'Order code: SN-7KQ4M\n'
      + '\n'
      + 'Could you let me know the delivery charge and how to pay?',
    );
    expect(buildOrderMessage({ code: 'SN-7KQ4M', lines: one, name: 'Anjali', pincode: '415001', coupon: null })).toBe(
      "Hi! I'm Anjali, and I'd like to place an order:\n"
      + '\n'
      + '• Muesli 250 g × 2 · ₹560\n'
      + '\n'
      + 'Total: ₹560 (before delivery)\n'
      + '\n'
      + 'Pincode: 415001\n'
      + 'Order code: SN-7KQ4M\n'
      + '\n'
      + 'Could you let me know the delivery charge and how to pay?',
    );
  });

  it('keeps a name or pincode with odd whitespace on one tidy line', () => {
    const message = buildOrderMessage({
      code: 'SN-7KQ4M',
      lines: [{ productId: 'muesli', size: '250 g', quantity: 2 }],
      name: '  Priya\n\tShah  ',
      pincode: ' 415001\n',
    });
    expect(message).toBe(
      "Hi! I'm Priya Shah, and I'd like to place an order:\n"
      + '\n'
      + '• Muesli 250 g × 2 · ₹560\n'
      + '\n'
      + 'Total: ₹560 (before delivery)\n'
      + '\n'
      + 'Pincode: 415001\n'
      + 'Order code: SN-7KQ4M\n'
      + '\n'
      + 'Could you let me know the delivery charge and how to pay?',
    );
  });
});

describe('orderMessageParts with blanks (the preview)', () => {
  it('matches the sent text once the blanks are filled in', () => {
    const input = { code: 'SN-7KQ4M', lines: [{ productId: 'bites', size: '250 g', quantity: 1 }], name: '', pincode: '' };
    const parts = orderMessageParts(input, { blanks: true });

    expect(parts.filter((part) => part.blank).map((part) => [part.blank, part.text])).toEqual([
      ['name', 'your name'],
      ['pincode', 'your pincode'],
    ]);
    const filled = parts.map((part) => (part.blank === 'name' ? 'Anjali' : part.blank === 'pincode' ? '415001' : part.text)).join('');
    expect(filled).toBe(buildOrderMessage({ ...input, name: 'Anjali', pincode: '415001' }));
  });
});
