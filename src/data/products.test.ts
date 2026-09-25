import { describe, expect, it } from 'vitest';
import { productsData } from './products';

// Orders and stock are saved per product and pack size, and the server only accepts
// these shapes (contract.md, `order_lines` and `product_stock`). A product or size
// that doesn't match would make every order with it fail to save.
const SERVER_PRODUCT_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const SERVER_SIZE = /^[0-9]{1,5} ?(g|kg)$/;

describe('products the order book can store', () => {
  it.each(productsData.map((product) => [product.id, product] as const))('%s', (_id, product) => {
    expect(product.id).toMatch(SERVER_PRODUCT_ID);
    expect(product.weightOptions.length).toBeGreaterThan(0);
    product.weightOptions.forEach((size) => expect(size).toMatch(SERVER_SIZE));
  });
});
