import { describe, expect, it } from 'vitest';
import type { KitchenEffects, Order, OrderKitchen, OrderLine, Payment, UpdatedOrder } from '../types';
import {
  applyLocal, cleanPastedPhone, contactNumbers, effectsText, isPartlyCooked, laneOf, lineState, linesFirst, moneyByMethod,
  namesOneOrder, nextOf, packsOf, packsText, productStates, paidByText, paymentsByText, phoneInText, pileOf, plainPhone, productFilter,
  reverseOf, searchFor, sortLines, undoPlanOf,
} from './model';

// The kitchen flow's stages: which lane an order is in, and its one-tap next step.

const staged = (status: Order['status'], extra: Partial<Order> = {}) => ({ status, paid: false, free_sample: false, ...extra }) as Order;

describe('laneOf and nextOf', () => {
  it.each([
    [staged('cooking'), 'cooking', null],
    [staged('packing'), 'packing', 'ready'],
    [staged('ready'), 'ready', 'delivered'],
    [staged('delivered'), 'collect', null],
    [staged('delivered', { paid: true }), 'done', null],
    // A free sample has nothing to collect: delivered is done.
    [staged('delivered', { free_sample: true }), 'done', null],
    [staged('cancelled'), 'done', null],
  ] as const)('%o is in %s, next status %s', (order, lane, nextStatus) => {
    expect(laneOf(order)).toBe(lane);
    expect(nextOf(order)?.changes.status ?? null).toBe(nextStatus);
  });

  it('Cooking has no next step (it moves on by itself); To collect asks to be paid', () => {
    expect(nextOf(staged('cooking'))).toBeNull();
    expect(nextOf(staged('delivered'))?.changes).toEqual({ paid: true });
  });
});

// Undo: a move that changed the kitchen goes back through undo_admin_kitchen; the rest by reverse keys.

const effects = (orders: KitchenEffects['orders'], action_id: string | null = 'act-1') =>
  ({ preview: false, action_id, batches: [], orders, kitchen: {} }) as unknown as KitchenEffects;
const answer = (order: Order, kitchen_effects: KitchenEffects | null) => ({ ...order, kitchen_effects }) as UpdatedOrder;

describe('undoPlanOf', () => {
  const asha = { ...staged('cooking'), id: 'o-asha', name: 'Asha Patil' } as Order;

  it('undoes a kitchen move with its action, not by moving the status back', () => {
    const saved = answer({ ...asha, status: 'cancelled' }, effects([]));
    expect(undoPlanOf(asha, { status: 'cancelled' }, saved)).toEqual({ kitchen: 'act-1' });
  });

  it('sends the reverse keys when the kitchen did not change, or the save has not answered', () => {
    const packed = staged('packing');
    expect(undoPlanOf(packed, { status: 'ready' }, answer({ ...packed, status: 'ready' }, null))).toEqual({ changes: { status: 'packing' } });
    expect(undoPlanOf(packed, { status: 'ready' }, null)).toEqual({ changes: { status: 'packing' } });
  });
});

describe('effectsText', () => {
  const asha = { id: 'o-asha', name: 'Asha Patil', code: 'SN-A2B3C' } as Order;

  it("says what came back as spare and who moved on because of it", () => {
    const e = effects([
      { id: 'o-asha', code: 'SN-A2B3C', name: 'Asha Patil', from: 'cooking', to: 'cancelled', grams: [{ product_id: 'bites', change: -500 }], waiting: [] },
      { id: 'o-meera', code: 'SN-K8M9N', name: 'Meera Kulkarni', from: 'cooking', to: 'packing', grams: [{ product_id: 'bites', change: 500 }], waiting: [] },
    ]);
    expect(effectsText(asha, e)).toBe("500 g Date Bites back as spare. Meera's order moved to Packing.");
  });

  it('says nothing more when the kitchen only covered this order by hand', () => {
    const e = effects([{ id: 'o-asha', code: 'SN-A2B3C', name: 'Asha Patil', from: 'cooking', to: 'packing', grams: [], waiting: [] }]);
    expect(effectsText(asha, e)).toBe('');
    expect(effectsText(asha, null)).toBe('');
  });
});

// Per product in the kitchen: waiting, or ready with the days its food was made.

const k = (product_id: string, waiting: boolean, made: string[] = []): OrderKitchen =>
  ({ product_id, need: 500, covered: waiting ? 0 : 500, by_hand: 0, waiting, batches: made.map((made_on) => ({ made_on, grams: 250 })) });

describe('line states on a Cooking order', () => {
  const partly = staged('cooking', { kitchen: [k('bites', false, ['2026-09-17', '2026-09-17', '2026-09-19']), k('raggi-jaggi', true)] });

  it('marks a card only when some products are ready and some are not', () => {
    expect(isPartlyCooked(partly)).toBe(true);
    expect(isPartlyCooked(staged('cooking', { kitchen: [k('raggi-jaggi', true)] }))).toBe(false);
    expect(isPartlyCooked({ ...partly, status: 'packing' })).toBe(false);
  });

  it('lists every product in the site\'s order with its state', () => {
    const o = { ...partly, lines: [line('bites', '250 g', 2), line('raggi-jaggi', '500 g', 1)] } as Order;
    expect(productStates(o)).toEqual([
      { product_id: 'raggi-jaggi', ready: false, madeOn: [] },
      { product_id: 'bites', ready: true, madeOn: ['2026-09-17', '2026-09-19'] },
    ]);
  });

  it('gives each ready product its made-on days once, and none when covered by hand', () => {
    expect(lineState(partly, 'bites')).toEqual({ ready: true, madeOn: ['2026-09-17', '2026-09-19'] });
    expect(lineState(partly, 'raggi-jaggi')).toEqual({ ready: false });
    expect(lineState(staged('cooking', { kitchen: [k('muesli', false)] }), 'muesli')).toEqual({ ready: true, madeOn: [] });
  });
});

describe('samples in an order', () => {
  it('sort after the packs of their product', () => {
    const lines = [line('bites', 'sample', 1), line('muesli', '250 g', 1), line('bites', '250 g', 2)];
    expect(sortLines(lines).map((l) => `${l.product_id} ${l.size}`)).toEqual(['muesli 250 g', 'bites 250 g', 'bites sample']);
  });

  it('count apart from packs', () => {
    expect(packsText({ packs: 3, samples: 0 })).toBe('3 packs');
    expect(packsText({ packs: 1, samples: 1 })).toBe('1 pack · 1 sample');
    expect(packsText({ packs: 0, samples: 2 })).toBe('2 samples');
  });
});

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

describe('paid in parts, in the CSV', () => {
  const pay = (method: Payment['method'], note: string | null = null) => ({ method, note }) as Payment;

  it("lists each method once, oldest first, with Other's note, and skips payments with no method", () => {
    expect(paymentsByText({ payments: [pay('upi'), pay(null), pay('cash'), pay('upi'), pay('other', 'a friend')] }))
      .toBe('UPI + Cash + Other: a friend');
    expect(paymentsByText({ payments: [pay(null)] })).toBeNull();
    expect(paymentsByText({ payments: [] })).toBeNull();
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

// "Add from contacts": a phone's address book keeps numbers every which way.

describe('contactNumbers', () => {
  it('reads the usual ways a mobile is saved as the same number', () => {
    expect(contactNumbers(['+91 98765 43210'])).toEqual(['919876543210']);
    expect(contactNumbers(['098765-43210'])).toEqual(['919876543210']);
    expect(contactNumbers(['(987) 654-3210'])).toEqual(['919876543210']);
    expect(contactNumbers(['0091 98765 43210'])).toEqual(['919876543210']);
    expect(contactNumbers(['+91 (0) 98765 43210'])).toEqual(['919876543210']);
    expect(contactNumbers(['+91-098765-43210'])).toEqual(['919876543210']);
  });

  it('keeps each number once, in the phone\'s order', () => {
    expect(contactNumbers(['98765 43210', '+44 7700 900123', '+919876543210'])).toEqual(['919876543210', '447700900123']);
  });

  it('leaves out what cannot be a phone', () => {
    expect(contactNumbers(['', '12345', 'none'])).toEqual([]);
  });
});

// Add order shows numbers plainly: 10 digits for India, + and digits otherwise.

describe('plainPhone', () => {
  it.each(['+91 98765 43210', '098765 43210', '0091 98765 43210', '98765-43210', '919876543210', '9876543210'])('%s shows as 9876543210', (raw) => {
    expect(plainPhone(raw)).toBe('9876543210');
  });

  it('keeps + and the digits for a foreign number', () => {
    expect(plainPhone('+44 7700 900456')).toBe('+447700900456');
    expect(plainPhone('447700900456')).toBe('+447700900456');
  });

  it('is null for what cannot be a phone', () => {
    expect(plainPhone('12345')).toBeNull();
  });
});

describe('phoneInText', () => {
  it('finds the number in a sentence', () => {
    expect(phoneInText('Call me on +91 98765-43210, thanks')).toBe('919876543210');
    expect(phoneInText('Order code: SN-7KQ4M. Number 98765 43210.')).toBe('919876543210');
  });

  it('is null with no number, or two different ones', () => {
    expect(phoneInText('Pincode 415001, see you 28-09')).toBeNull();
    expect(phoneInText('98765 43210 or 98000 00011')).toBeNull();
  });
});

describe('cleanPastedPhone', () => {
  it('cleans a paste, a keyboard chip or a drop', () => {
    expect(cleanPastedPhone('', '+91 98765 43210', 'insertFromPaste')).toBe('9876543210');
    expect(cleanPastedPhone('', 'Call me on +91 98765-43210', 'insertFromPaste')).toBe('9876543210');
    expect(cleanPastedPhone('98', '+91 98765 43210', 'insertReplacementText')).toBe('9876543210');
    expect(cleanPastedPhone('', '+44 7700 900456', 'insertFromDrop')).toBe('+447700900456');
  });

  it('cleans several characters arriving at once, whatever the input type', () => {
    expect(cleanPastedPhone('', '098765 43210', 'insertText')).toBe('9876543210');
  });

  it('leaves key-by-key typing alone, even when it makes a whole number', () => {
    expect(cleanPastedPhone('+91 98765 4321', '+91 98765 43210', 'insertText')).toBeNull();
  });

  it('leaves a paste it cannot read, so the error can show', () => {
    expect(cleanPastedPhone('', 'call me', 'insertFromPaste')).toBeNull();
  });
});
