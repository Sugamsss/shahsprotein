import { describe, expect, it } from 'vitest';
import { productsData } from '../data/products';
import { couponPriceKey, formatRupees, orderTotal, packPrice, parseCouponPrices } from './prices';

const product = (id: string) => productsData.find((p) => p.id === id)!;

describe('MRPs', () => {
  it('has an MRP for every pack size', () => {
    for (const p of productsData) {
      expect(Object.keys(p.mrp).sort()).toEqual([...p.weightOptions].sort());
    }
  });
});

describe('formatRupees', () => {
  it('uses the rupee sign and Indian grouping', () => {
    expect(formatRupees(165)).toBe('₹165');
    expect(formatRupees(1650)).toBe('₹1,650');
    expect(formatRupees(165000)).toBe('₹1,65,000');
  });
});

describe('parseCouponPrices', () => {
  it('keys whole prices by product and size', () => {
    expect(parseCouponPrices([{ product_id: 'muesli', size: '250 g', price: 250 }])).toEqual({ 'muesli|250 g': 250 });
  });

  it('skips bad rows and treats a missing list as none', () => {
    expect(parseCouponPrices(undefined)).toEqual({});
    expect(parseCouponPrices([null, { product_id: 'muesli', size: '250 g', price: 9.5 }, { size: '250 g', price: 5 }])).toEqual({});
  });
});

describe('packPrice', () => {
  const muesli = product('muesli');

  it('is the MRP without a coupon', () => {
    expect(packPrice(muesli, '500 g')).toEqual({ price: 550, mrp: 550 });
  });

  it("uses the coupon's price for that pack, else the MRP", () => {
    const prices = { [couponPriceKey('muesli', '250 g')]: 250 };
    expect(packPrice(muesli, '250 g', prices)).toEqual({ price: 250, mrp: 290 });
    expect(packPrice(muesli, '500 g', prices)).toEqual({ price: 550, mrp: 550 });
  });

  it('is null for a size with no MRP', () => {
    expect(packPrice(product('bites'), '500 g')).toBeNull();
  });
});

describe('orderTotal', () => {
  const lines = [
    { productId: 'raggi-jaggi', size: '500 g', quantity: 2 },
    { productId: 'muesli', size: '250 g', quantity: 1 },
  ];

  it('adds up packs at MRP', () => {
    expect(orderTotal(lines)).toEqual({ total: 940, mrpTotal: 940 });
  });

  it("uses a coupon's own prices and keeps the MRP total beside it", () => {
    expect(orderTotal(lines, { [couponPriceKey('muesli', '250 g')]: 250 })).toEqual({ total: 900, mrpTotal: 940 });
  });

  it('is null for nothing, or when a pack has no price', () => {
    expect(orderTotal([])).toBeNull();
    expect(orderTotal([...lines, { productId: 'bites', size: '500 g', quantity: 1 }])).toBeNull();
  });
});
