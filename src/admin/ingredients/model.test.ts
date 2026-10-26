import { describe, expect, it } from 'vitest';
import type { Ingredient } from '../types';
import { batchesLeft, fillShare, formatAmount, fromField, productIngredientNames, splitLow, toField } from './model';

const ing = (over: Partial<Ingredient> = {}): Ingredient => ({
  id: 'i', name: 'Dates', kind: 'food', unit: 'g', low_at: 1500, stock: 1200, counted_at: null, last_bought_on: null,
  low: true, uses: [], buying: null, ...over,
});

describe('formatAmount', () => {
  it('says food in kitchen weights and packaging in pieces, never below nothing', () => {
    expect(formatAmount(1500, 'g')).toBe('1½ kg');
    expect(formatAmount(-200, 'g')).toBe('0 g');
    expect(formatAmount(140, 'pieces')).toBe('140 pieces');
    expect(formatAmount(1, 'pieces')).toBe('1 piece');
  });
});

describe('batchesLeft', () => {
  it('counts whole usual batches for the product it runs out on first', () => {
    const dates = ing({ stock: 1200, uses: [{ product_id: 'bites', per_kg: 300 }, { product_id: 'muesli', per_kg: 50 }] });
    // Bites: a 2 kg batch needs 600 g → 2. Muesli: 3 kg needs 150 g → 8.
    expect(batchesLeft(dates, [{ product_id: 'bites', grams: 2000 }, { product_id: 'muesli', grams: 3000 }]))
      .toEqual({ productId: 'bites', batches: 2 });
  });
  it('has nothing to say without stock, amounts or batches', () => {
    expect(batchesLeft(ing({ stock: null, uses: [{ product_id: 'bites', per_kg: 300 }] }), [{ product_id: 'bites', grams: 2000 }])).toBeNull();
    expect(batchesLeft(ing({ uses: [] }), [{ product_id: 'bites', grams: 2000 }])).toBeNull();
    expect(batchesLeft(ing({ uses: [{ product_id: 'bites', per_kg: 300 }] }), [])).toBeNull();
  });
});

describe('the bar and the lists', () => {
  it('fills against four times the low mark', () => {
    expect(fillShare({ stock: 1500, low_at: 1500 })).toBe(25);
    expect(fillShare({ stock: 9000, low_at: 1500 })).toBe(100);
    expect(fillShare({ stock: 500, low_at: null })).toBe(100);
    expect(fillShare({ stock: null, low_at: 1500 })).toBe(0);
  });
  it('puts the low ones first, least left first', () => {
    const { low, rest } = splitLow([ing({ id: 'a', stock: 1000 }), ing({ id: 'b', low: false }), ing({ id: 'c', stock: 200 })]);
    expect(low.map((i) => i.id)).toEqual(['c', 'a']);
    expect(rest.map((i) => i.id)).toEqual(['b']);
  });
});

describe('fields', () => {
  it('reads kilos as grams for food and whole pieces for packaging', () => {
    expect(fromField('1.25', 'g')).toBe(1250);
    expect(fromField('1,500', 'pieces')).toBe(1500);
    expect(fromField('abc', 'g')).toBeNull();
    expect(toField(1250, 'g')).toBe('1.25');
    expect(toField(null, 'g')).toBe('');
  });
  it("lists the products' ingredients once each", () => {
    expect(productIngredientNames([['Ragi', 'Jaggery', 'Ghee'], ['Dates', 'Ghee', ' ragi ']])).toEqual(['Ragi', 'Jaggery', 'Ghee', 'Dates']);
  });
});
