import { describe, expect, it } from 'vitest';
import { buildOrderMessage, orderMessageParts } from './orderMessage';
import { cleanDeliveryAddress, cleanPhone, isValidDeliveryAddress } from './deliveryAddress';

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
    expect(buildOrderMessage({ code: 'SN-7KQ4M', lines, name: 'Anjali', pincode: '415001', phone: '919876543210', address: { premises:'Flat 4B', area:'Shivaji Nagar', city:'Satara', state:'Maharashtra', pincode:'415001' }, coupon: { code: 'example10', checked: true } })).toBe(
      "Hi! I'm Anjali, and I'd like to place an order:\n"
      + '\n'
      + '• Raggi Jaggi 250 g × 1 · ₹175\n'
      + '• Muesli 250 g × 2 · ₹580\n'
      + '• Muesli 500 g × 1 · ₹550\n'
      + '• Date Bites 250 g × 1 · ₹225\n'
      + '\n'
      + 'Total: ₹1,530 (before delivery)\n'
      + '\n'
      + 'Coupon: EXAMPLE10\n'
      + 'Phone: 9876543210\n'
      + 'Deliver to: Flat 4B, Shivaji Nagar, Satara, Maharashtra, 415001\n'
      + 'Order code: SN-7KQ4M\n'
      + '\n'
      + 'Could you confirm my order, and let me know the delivery charge and how to pay?',
    );
  });

  it("prices packs at a checked coupon's own prices, and the rest at MRP", () => {
    const coupon = { code: 'EXAMPLE10', checked: true, prices: { 'muesli|250 g': 250 } };
    expect(buildOrderMessage({ code: 'SN-7KQ4M', lines, name: 'Anjali', pincode: '415001', phone: '919876543210', address: { premises:'Flat 4B', area:'Shivaji Nagar', city:'Satara', state:'Maharashtra', pincode:'415001' }, coupon })).toBe(
      "Hi! I'm Anjali, and I'd like to place an order:\n"
      + '\n'
      + '• Raggi Jaggi 250 g × 1 · ₹175\n'
      + '• Muesli 250 g × 2 · ₹500\n'
      + '• Muesli 500 g × 1 · ₹550\n'
      + '• Date Bites 250 g × 1 · ₹225\n'
      + '\n'
      + 'Total: ₹1,450 (before delivery)\n'
      + '\n'
      + 'Coupon: EXAMPLE10\n'
      + 'Phone: 9876543210\n'
      + 'Deliver to: Flat 4B, Shivaji Nagar, Satara, Maharashtra, 415001\n'
      + 'Order code: SN-7KQ4M\n'
      + '\n'
      + 'Could you confirm my order, and let me know the delivery charge and how to pay?',
    );
  });

  it('leaves out the amount and the total when a pack has no price', () => {
    const odd = [{ productId: 'bites', size: '500 g', quantity: 1 }, { productId: 'muesli', size: '250 g', quantity: 1 }];
    expect(buildOrderMessage({ code: 'SN-7KQ4M', lines: odd, name: 'Anjali', pincode: '415001', phone: '919876543210', address: { premises:'Flat 4B', area:'Shivaji Nagar', city:'Satara', state:'Maharashtra', pincode:'415001' } })).toBe(
      "Hi! I'm Anjali, and I'd like to place an order:\n"
      + '\n'
      + '• Muesli 250 g × 1 · ₹290\n'
      + '• Date Bites 500 g × 1\n'
      + '\n'
      + 'Phone: 9876543210\n'
      + 'Deliver to: Flat 4B, Shivaji Nagar, Satara, Maharashtra, 415001\n'
      + 'Order code: SN-7KQ4M\n'
      + '\n'
      + 'Could you confirm my order, and let me know the delivery charge and how to pay?',
    );
  });

  it('marks a coupon the server could not check, and leaves out no coupon at all', () => {
    const one = [{ productId: 'muesli', size: '250 g', quantity: 2 }];
    expect(buildOrderMessage({ code: 'SN-7KQ4M', lines: one, name: 'Anjali', pincode: '415001', phone: '919876543210', address: { premises:'Flat 4B', area:'Shivaji Nagar', city:'Satara', state:'Maharashtra', pincode:'415001' }, coupon: { code: 'EXAMPLE10', checked: false } })).toBe(
      "Hi! I'm Anjali, and I'd like to place an order:\n"
      + '\n'
      + '• Muesli 250 g × 2 · ₹580\n'
      + '\n'
      + 'Total: ₹580 (before delivery)\n'
      + '\n'
      + 'Coupon: EXAMPLE10 (not checked yet)\n'
      + 'Phone: 9876543210\n'
      + 'Deliver to: Flat 4B, Shivaji Nagar, Satara, Maharashtra, 415001\n'
      + 'Order code: SN-7KQ4M\n'
      + '\n'
      + 'Could you confirm my order, and let me know the delivery charge and how to pay?',
    );
    expect(buildOrderMessage({ code: 'SN-7KQ4M', lines: one, name: 'Anjali', pincode: '415001', phone:'919876543210', address:{premises:'Flat 4B',area:'Shivaji Nagar',city:'Satara',state:'Maharashtra',pincode:'415001'}, coupon: null })).toBe(
      "Hi! I'm Anjali, and I'd like to place an order:\n"
      + '\n'
      + '• Muesli 250 g × 2 · ₹580\n'
      + '\n'
      + 'Total: ₹580 (before delivery)\n'
      + '\n'
      + 'Phone: 9876543210\n'
      + 'Deliver to: Flat 4B, Shivaji Nagar, Satara, Maharashtra, 415001\n'
      + 'Order code: SN-7KQ4M\n'
      + '\n'
      + 'Could you confirm my order, and let me know the delivery charge and how to pay?',
    );
  });

  it('keeps a name or pincode with odd whitespace on one tidy line', () => {
    const message = buildOrderMessage({
      code: 'SN-7KQ4M',
      lines: [{ productId: 'muesli', size: '250 g', quantity: 2 }],
      name: '  Priya\n\tShah  ',
      pincode: ' 415001\n',
      phone: '98765 43210', address: { premises:'Flat 4B',area:'Shivaji Nagar',city:'Satara',state:'Maharashtra',pincode:'415001' },
    });
    expect(message).toBe(
      "Hi! I'm Priya Shah, and I'd like to place an order:\n"
      + '\n'
      + '• Muesli 250 g × 2 · ₹580\n'
      + '\n'
      + 'Total: ₹580 (before delivery)\n'
      + '\n'
      + 'Phone: 9876543210\n'
      + 'Deliver to: Flat 4B, Shivaji Nagar, Satara, Maharashtra, 415001\n'
      + 'Order code: SN-7KQ4M\n'
      + '\n'
      + 'Could you confirm my order, and let me know the delivery charge and how to pay?',
    );
  });
});

describe('orderMessageParts with blanks (the preview)', () => {
  it('matches the sent text once the blanks are filled in', () => {
    const input = { code: 'SN-7KQ4M', lines: [{ productId: 'bites', size: '250 g', quantity: 1 }], name: '', pincode: '', phone:'', address:{premises:'',area:'',city:'',state:'',pincode:''} };
    const parts = orderMessageParts(input, { blanks: true });

    expect(parts.filter((part) => part.blank).map((part) => [part.blank, part.text])).toEqual([
      ['name', 'your name'],
      ['phone', 'your phone'], ['address', 'your address'],
    ]);
    const filled = parts.map((part) => (part.blank === 'name' ? 'Anjali' : part.blank === 'phone' ? '9876543210' : part.blank === 'address' ? 'Flat, Area, City, State, 415001' : part.text)).join('');
    expect(filled).toBe(buildOrderMessage({ ...input, name: 'Anjali', phone:'919876543210', address:{premises:'Flat',area:'Area',city:'City',state:'State',pincode:'415001'} }));
  });
});

describe('delivery details', () => {
  it('normalizes Indian phone input and cleans bounded address text', () => {
    expect(cleanPhone('+91 98765-43210')).toBe('919876543210');
    expect(cleanDeliveryAddress({ premises:'  Flat\n  2 ', area:' Main Road ', city:'Satara', state:'MH', pincode:'415001', landmark:'Near  temple' }))
      .toEqual({ premises:'Flat 2', area:'Main Road', city:'Satara', state:'MH', pincode:'415001', landmark:'Near temple' });
  });
  it('requires complete editable delivery fields and a valid pincode', () => {
    expect(isValidDeliveryAddress({ premises:'House', area:'Village', city:'Town', state:'State', pincode:'415001' })).toBe(true);
    expect(isValidDeliveryAddress({ premises:'', area:'Village', city:'Town', state:'State', pincode:'415001' })).toBe(false);
    expect(isValidDeliveryAddress({ premises:'House', area:'Village', city:'Town', state:'State', pincode:'015001' })).toBe(false);
  });
});
