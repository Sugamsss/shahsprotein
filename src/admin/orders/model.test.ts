import { describe, expect, it } from 'vitest';
import type { Order, OrderLine } from '../types';
import { applyLocal, linesFirst, moneyByMethod, namesOneOrder, packsOf, paidByText, pileOf, productFilter, reverseOf, searchFor } from './model';

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

// Paid with a method (UPI, Cash, Bank transfer, Other + note). Undo must send what the server accepts.

const paidOrder = (paid_method: Order['paid_method'], paid_note: string | null = null) =>
  ({ paid: true, paid_at: '2026-09-26T10:00:00Z', paid_method, paid_note } as Order);
const unpaidOrder = { paid: false, paid_at: null, paid_method: null, paid_note: null } as Order;

describe('paying with a method', () => {
  it('undoing Not paid puts the method and note back', () => {
    expect(reverseOf(paidOrder('upi'), { paid: false })).toEqual({ paid: true, paid_method: 'upi' });
    expect(reverseOf(paidOrder('bank'), { paid: false })).toEqual({ paid: true, paid_method: 'bank' });
    expect(reverseOf(paidOrder('other', 'bank transfer'), { paid: false }))
      .toEqual({ paid: true, paid_method: 'other', paid_note: 'bank transfer' });
  });

  it('undoing Not paid on an old order sends no method, so it stays with none', () => {
    expect(reverseOf(paidOrder(null), { paid: false })).toEqual({ paid: true });
  });

  it('undoing Paid just marks it not paid, which clears the method', () => {
    expect(reverseOf(unpaidOrder, { paid: true, paid_method: 'cash' })).toEqual({ paid: false });
  });

  it('shows the method at once, and clears it on Not paid', () => {
    const paid = applyLocal(unpaidOrder, { paid: true, paid_method: 'other', paid_note: 'bank transfer' });
    expect([paid.paid, paid.paid_method, paid.paid_note]).toEqual([true, 'other', 'bank transfer']);
    const unpaid = applyLocal(paidOrder('other', 'bank transfer'), { paid: false });
    expect([unpaid.paid, unpaid.paid_at, unpaid.paid_method, unpaid.paid_note]).toEqual([false, null, null, null]);
  });

  it('reads as UPI, Cash, Bank transfer or Other with its note, and nothing for an old order', () => {
    expect(paidByText(paidOrder('upi'))).toBe('UPI');
    expect(paidByText(paidOrder('cash'))).toBe('Cash');
    expect(paidByText(paidOrder('bank'))).toBe('Bank transfer');
    expect(paidByText(paidOrder('other', 'bank transfer'))).toBe('Other: bank transfer');
    expect(paidByText(paidOrder(null))).toBeNull();
  });
});

// Home's ₹ came in, by how it was paid. The sums are the server's; this only orders, labels and hides zeros.

describe('money by method', () => {
  const none = { upi: 0, cash: 0, bank: 0, other: 0, not_recorded: 0 };

  it('lists UPI, Cash, Bank, Other, then Not recorded, with the server amounts', () => {
    expect(moneyByMethod({ upi: 800, cash: 200, bank: 1000, other: 150, not_recorded: 400 })).toEqual([
      { key: 'upi', label: 'UPI', amount: 800 },
      { key: 'cash', label: 'Cash', amount: 200 },
      { key: 'bank', label: 'Bank', amount: 1000 },
      { key: 'other', label: 'Other', amount: 150 },
      { key: 'not_recorded', label: 'Not recorded', amount: 400 },
    ]);
  });

  it('leaves out zeros, so one method is one line and Not recorded only shows while it has money', () => {
    expect(moneyByMethod({ ...none, cash: 500 })).toEqual([{ key: 'cash', label: 'Cash', amount: 500 }]);
    expect(moneyByMethod({ ...none, upi: 300, not_recorded: 100 }).map((r) => r.key)).toEqual(['upi', 'not_recorded']);
  });

  it('shows nothing when no money came in, or on a database without the split', () => {
    expect(moneyByMethod(none)).toEqual([]);
    expect(moneyByMethod(undefined)).toEqual([]);
  });
});
