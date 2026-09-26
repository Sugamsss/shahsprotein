import { describe, expect, it } from 'vitest';
import type { Order, OrderLine } from '../types';
import { linesFirst, namesOneOrder, packsOf, pileOf, productFilter, searchFor } from './model';

// "Find an order": a pasted WhatsApp message searches just its code.

describe('searchFor', () => {
  it('pulls the code out of a pasted order message', () => {
    const message = "Hi! I'm Anjali, and I'd like to place an order:\n\n• Muesli 250 g × 2\n\nPincode: 415001\nOrder code: sn-7kq4m\n\nCould you send me the total?";
    expect(searchFor(message)).toBe('SN-7KQ4M');
  });

  it('keeps a clash suffix', () => {
    expect(searchFor('about SN-7KQ4M-2 please')).toBe('SN-7KQ4M-2');
  });

  it('leaves names, phone digits and partial codes as typed', () => {
    expect(searchFor('Anjali')).toBe('Anjali');
    expect(searchFor('98000')).toBe('98000');
    expect(searchFor('7KQ4')).toBe('7KQ4');
    // Look-alike letters (O, I, L, U) never make a code.
    expect(searchFor('SN-7KQ4O')).toBe('SN-7KQ4O');
  });
});

describe('namesOneOrder', () => {
  it('is true for a whole code or a whole phone number', () => {
    expect(namesOneOrder('SN-7KQ4M')).toBe(true);
    expect(namesOneOrder('+91 98000 00001')).toBe(true);
  });

  it('is false for a name or a partial code, so typing never jumps away', () => {
    expect(namesOneOrder('Anjali')).toBe(false);
    expect(namesOneOrder('SN-7KQ')).toBe(false);
  });
});

// Orders filtered to one product (/admin/orders?product=raggi-jaggi).

const line = (product_id: string, size: string, quantity: number): OrderLine => ({ product_id, size, quantity });
const withLines = (...lines: OrderLine[]) => ({ lines } as Order);

describe('productFilter', () => {
  it('keeps one of our product ids and ignores anything else', () => {
    expect(productFilter('raggi-jaggi')).toBe('raggi-jaggi');
    expect(productFilter('ragi')).toBeNull();
    expect(productFilter(null)).toBeNull();
  });
});

describe('packsOf', () => {
  it('adds up one product across orders, sizes by weight, other products left out', () => {
    const orders = [
      withLines(line('raggi-jaggi', '500 g', 2), line('muesli', '250 g', 4)),
      withLines(line('raggi-jaggi', '1 kg', 1), line('raggi-jaggi', '250 g', 3)),
      withLines(line('raggi-jaggi', '250 g', 3), line('raggi-jaggi', '500 g', 1)),
    ];
    expect(packsOf(orders, 'raggi-jaggi')).toEqual({ packs: 10, sizes: [['250 g', 6], ['500 g', 3], ['1 kg', 1]] });
  });

  it('is empty when no order has the product', () => {
    expect(packsOf([withLines(line('muesli', '250 g', 1))], 'raggi-jaggi')).toEqual({ packs: 0, sizes: [] });
  });
});

describe('a card on a filtered board', () => {
  const lines = [line('bites', '250 g', 1), line('raggi-jaggi', '500 g', 1), line('muesli', '250 g', 2), line('raggi-jaggi', '250 g', 2)];

  it('lists the filtered product first, then the rest in site order', () => {
    expect(linesFirst(lines, 'bites').map((l) => `${l.product_id} ${l.size}`))
      .toEqual(['bites 250 g', 'raggi-jaggi 250 g', 'raggi-jaggi 500 g', 'muesli 250 g']);
    expect(linesFirst(lines).map((l) => l.product_id)).toEqual(['raggi-jaggi', 'raggi-jaggi', 'muesli', 'bites']);
  });

  it('puts the filtered product last in the pile, which draws it on top', () => {
    expect(pileOf(lines, 'bites')).toEqual(['raggi-jaggi', 'bites']);
    expect(pileOf(lines, 'raggi-jaggi')).toEqual(['muesli', 'raggi-jaggi']);
    expect(pileOf(lines)).toEqual(['raggi-jaggi', 'muesli']);
  });
});
