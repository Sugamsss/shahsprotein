import { describe, expect, it } from 'vitest';
import { buildOrderMessage } from './orderMessage';

// The exact text the customer sends and Pranjali reads. When the wording in
// siteConfig.order.message changes on purpose, update these strings with it.

const lines = [
  { productId: 'muesli', size: '250 g', quantity: 2 },
  { productId: 'raggi-jaggi', size: '500 g', quantity: 3 },
  { productId: 'bites', size: '250 g', quantity: 1 },
];

describe('buildOrderMessage', () => {
  it('writes the full order with a coupon', () => {
    expect(buildOrderMessage({ lines, name: 'Anon', pincode: '415001', coupon: ' example10 ' })).toBe(
      "Hi! I'm Anon, and I'd like to place an order:\n"
      + '\n'
      + '• Muesli 250 g × 2\n'
      + '• Raggi Jaggi 500 g × 3\n'
      + '• Date Bites 250 g × 1\n'
      + '\n'
      + 'Coupon: EXAMPLE10\n'
      + 'Pincode: 415001\n'
      + '\n'
      + 'Could you send me the total?',
    );
  });

  it('leaves the coupon line out when there is no coupon', () => {
    expect(buildOrderMessage({ lines: lines.slice(0, 1), name: 'Anon', pincode: '415001', coupon: '' })).toBe(
      "Hi! I'm Anon, and I'd like to place an order:\n"
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
      lines: lines.slice(0, 1),
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
