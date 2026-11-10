import { describe, expect, it } from 'vitest';
import { productsData } from './products';

// Orders and stock are saved per product and pack size, and the server only accepts
// these shapes (contract.md, `order_lines` and `product_stock`). A product or size
// that doesn't match would make every order with it fail to save.
const SERVER_PRODUCT_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const SERVER_SIZE = /^[0-9]{1,5} ?(g|kg)$/;

describe('pack prices', () => {
  // The printed MRP is founder-locked (docs/slice-a-pricing.md); the sticker
  // page prints these, so a wrong number here reaches a real label.
  it('keeps the founder-locked printed MRP for all five packs', () => {
    expect(Object.fromEntries(productsData.flatMap((p) => Object.entries(p.labelMrp).map(([size, price]) => [`${p.id}|${size}`, price])))).toEqual({
      'muesli|250 g': 399, 'muesli|500 g': 699,
      'raggi-jaggi|250 g': 249, 'raggi-jaggi|500 g': 479,
      'bites|250 g': 319,
    });
  });

  // The site fallback (what shows before the price book answers) stays on the
  // live price book's values, so a cold load never flashes another MRP.
  it('keeps the site fallback on the live price book', () => {
    expect(Object.fromEntries(productsData.flatMap((p) => Object.entries(p.mrp).map(([size, price]) => [`${p.id}|${size}`, price])))).toEqual({
      'muesli|250 g': 290, 'muesli|500 g': 550,
      'raggi-jaggi|250 g': 175, 'raggi-jaggi|500 g': 325,
      'bites|250 g': 225,
    });
  });
});

describe('products the order book can store', () => {
  it.each(productsData.map((product) => [product.id, product] as const))('%s', (_id, product) => {
    expect(product.id).toMatch(SERVER_PRODUCT_ID);
    expect(product.weightOptions.length).toBeGreaterThan(0);
    product.weightOptions.forEach((size) => expect(size).toMatch(SERVER_SIZE));
  });
});
