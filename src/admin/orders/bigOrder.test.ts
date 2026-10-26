import { describe, expect, it } from 'vitest';
import { fromDrafts, hypeLevel, isCustomSize, packGrams, sizeFor, sizeGrams, toDrafts, typedNumber, type Draft } from './bigOrder';

// Made-up prices only: the repo is public.

const draft = (over: Partial<Draft>): Draft => ({ id: 1, productId: 'raggi-jaggi', size: '250 g', grams: '', qty: '1', price: '', ...over });

describe('sizes and weights', () => {
  it('reads sizes the way the server does', () => {
    expect(sizeGrams('250 g')).toBe(250);
    expect(sizeGrams('1 kg')).toBe(1000);
    expect(sizeGrams('750g')).toBe(750);
    expect(sizeGrams('sample')).toBeNull();
  });

  it("keeps the product's own spelling, and writes other weights as kilos or grams", () => {
    expect(sizeFor('raggi-jaggi', 500)).toBe('500 g');
    expect(sizeFor('raggi-jaggi', 1000)).toBe('1 kg');
    expect(sizeFor('raggi-jaggi', 1500)).toBe('1500 g');
    expect(sizeFor('bites', 500)).toBe('500 g');
  });

  it('knows a custom weight from a size the site sells', () => {
    expect(isCustomSize('muesli', '500 g')).toBe(false);
    expect(isCustomSize('muesli', '1 kg')).toBe(true);
    expect(isCustomSize('bites', '500 g')).toBe(true);
    expect(isCustomSize('bites', 'sample')).toBe(false);
  });

  it('weighs the packs and leaves samples out', () => {
    expect(packGrams([
      { product_id: 'raggi-jaggi', size: '250 g', quantity: 700 },
      { product_id: 'muesli', size: '1 kg', quantity: 2 },
      { product_id: 'bites', size: 'sample', quantity: 3 },
    ])).toBe(177_000);
  });
});

describe('hypeLevel', () => {
  it.each([[0, 0], [99, 0], [100, 1], [499, 1], [500, 2], [999, 2], [1000, 3], [9999, 3]])('%i packs is level %i', (packs, level) => {
    expect(hypeLevel(packs)).toBe(level);
  });
});

describe('typedNumber', () => {
  it('keeps the digits and ignores the rest', () => {
    expect(typedNumber('₹1,05,000')).toBe(105000);
    expect(typedNumber(' 700 ')).toBe(700);
    expect(typedNumber('')).toBeNull();
    expect(typedNumber('abc')).toBeNull();
  });
});

describe('Advanced edit drafts', () => {
  it('lists the packs in the site order with their typed prices, and leaves samples out', () => {
    const drafts = toDrafts(
      { 'muesli|500 g': 1, 'raggi-jaggi|1 kg': 3, 'raggi-jaggi|250 g': 2, 'bites|sample': 1, 'muesli|250 g': 0 },
      { 'raggi-jaggi|1 kg': 600 },
    );
    expect(drafts.map(({ productId, size, grams, qty, price }) => [productId, size, grams, qty, price])).toEqual([
      ['raggi-jaggi', '250 g', '', '2', ''],
      ['raggi-jaggi', 'other', '1000', '3', '600'],
      ['muesli', '500 g', '', '1', ''],
    ]);
  });

  it('turns drafts back into lines, a typed weight into its size, and keeps only typed prices', () => {
    const { qty, rates, errors } = fromDrafts([
      draft({ id: 1, size: 'other', grams: '1000', qty: '3', price: '600' }),
      draft({ id: 2, productId: 'muesli', size: '500 g', qty: '1', price: '' }),
    ]);
    expect(errors).toEqual({});
    expect(qty).toEqual({ 'raggi-jaggi|1 kg': 3, 'muesli|500 g': 1 });
    expect(rates).toEqual({ 'raggi-jaggi|1 kg': 600 });
  });

  it('joins two drafts that end up the same product and weight', () => {
    const { qty } = fromDrafts([
      draft({ id: 1, size: '500 g', qty: '2' }),
      draft({ id: 2, size: 'other', grams: '500', qty: '3' }),
    ]);
    expect(qty).toEqual({ 'raggi-jaggi|500 g': 5 });
  });

  it('names each draft that does not check out', () => {
    const { errors, qty } = fromDrafts([
      draft({ id: 1, size: 'other', grams: '' }),
      draft({ id: 2, size: 'other', grams: '20000' }),
      draft({ id: 3, qty: '0' }),
      draft({ id: 4, qty: '10000' }),
      draft({ id: 5, price: '0' }),
      draft({ id: 6, size: '500 g', qty: '4' }),
    ]);
    expect(errors).toEqual({ 1: 'weight', 2: 'weight', 3: 'quantity', 4: 'quantity', 5: 'price' });
    expect(qty).toEqual({ 'raggi-jaggi|500 g': 4 });
  });
});
