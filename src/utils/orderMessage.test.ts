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
      + '• Raggi Jaggi 250 g × 1 · ₹249\n'
      + '• Muesli 250 g × 2 · ₹798\n'
      + '• Muesli 500 g × 1 · ₹699\n'
      + '• Date Bites 250 g × 1 · ₹319\n'
      + '\n'
      + 'Total: ₹2,065\n'
      + '\n'
      + 'Delivery: Free\n'
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
      + '• Raggi Jaggi 250 g × 1 · ₹249\n'
      + '• Muesli 250 g × 2 · ₹500\n'
      + '• Muesli 500 g × 1 · ₹699\n'
      + '• Date Bites 250 g × 1 · ₹319\n'
      + '\n'
      + 'Total: ₹1,767\n' + '\n' + 'Delivery: Free\n'
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
      + '• Muesli 250 g × 1 · ₹399\n'
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
      + '• Muesli 250 g × 2 · ₹798\n'
      + '\n'
      + 'Total: ₹798\n'
      + '\n'
      + 'Delivery: Free\n'
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
      + '• Muesli 250 g × 2 · ₹798\n'
      + '\n'
      + 'Total: ₹798\n'
      + '\n'
      + 'Delivery: Free\n'
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
      + '• Muesli 250 g × 2 · ₹798\n'
      + '\n'
      + 'Total: ₹798\n'
      + '\n'
      + 'Delivery: Free\n'
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

describe('Slice A frozen quote messages', () => {
  const details = { code: 'SN-7KQ4M', lines: [{ productId: 'muesli', size: '250 g', quantity: 1 }], name: 'Asha', pincode: '415001', phone: '919876543210', address: { premises:'Flat 4B', area:'Shivaji Nagar', city:'Satara', state:'Maharashtra', pincode:'415001' } };
  const quote = { quote_id:'00000000-0000-0000-0000-000000000001', expires_at:'2099-01-01T00:00:00Z', version:'fixture', offer_kind:'guest' as const, coupon_code:null, free_delivery_rule:{min_grams:500,min_packs:null,up_to_250:50,above_250:70,cap:70}, lines:[{product_id:'muesli',size:'250 g',quantity:1,grams:250,mrp:399,unit_price:359,line_total:359}], catalogue:[{product_id:'muesli',size:'250 g',mrp:399,unit_price:359}], mrp_total:399,items_total:359,savings:40,grams:250,packs:1,delivery_base:50,delivery_waived:false,delivery_fee:50,total:409,currency:'INR' as const };
  it('shows the quote total once, including delivery: ₹359 + ₹50 = ₹409', () => {
    expect(buildOrderMessage({ ...details, quote })).toContain('Total: ₹409');
    expect(buildOrderMessage({ ...details, quote })).toContain('Delivery: ₹50');
  });
  it('keeps the second-tier one-500 g order at ₹489 + ₹70 = ₹559', () => {
    const fiveHundred = {
      ...quote,
      offer_kind: 'second' as const,
      free_delivery_rule: { min_grams: null, min_packs: 2, up_to_250: 50, above_250: 70, cap: 70 },
      lines: [{ product_id: 'muesli', size: '500 g', quantity: 1, grams: 500, mrp: 699, unit_price: 489, line_total: 489 }],
      catalogue: [{ product_id: 'muesli', size: '500 g', mrp: 699, unit_price: 489 }],
      mrp_total: 699, items_total: 489, savings: 210, grams: 500, packs: 1,
      delivery_base: 70, delivery_waived: false, delivery_fee: 70, total: 559,
    };
    const message = buildOrderMessage({ ...details, lines: [{ productId: 'muesli', size: '500 g', quantity: 1 }], quote: fiveHundred });
    expect(message).toContain('• Muesli 500 g × 1 · ₹489');
    expect(message).toContain('Total: ₹559');
    expect(message).toContain('Delivery: ₹70');
  });
  it('omits every payable amount for an explicitly unpriced order', () => {
    const message = buildOrderMessage({ ...details, unpriced: true });
    expect(message).not.toMatch(/₹\\d|Total:|Delivery:/);
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
