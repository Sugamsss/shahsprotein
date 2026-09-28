import { describe, expect, it } from 'vitest';
import type { Order, Payment } from '../types';
import { parseAmount, quickPicks, recount } from './payments';

// recount repeats the server's rule so a change shows at once. These are the same
// cases supabase/tests/07_part_payments.test.sql checks on the server.

const pay = (id: string, amount: number | null, day: string, method: Payment['method'] = 'upi'): Payment =>
  ({ id, amount, method, note: null, paid_at: `2026-09-${day}T10:00:00Z`, created_at: `2026-09-${day}T10:00:00Z`, by_name: null });
const order = (amount: number | null) => ({ amount, payments: [] }) as unknown as Order;
const money = (o: Order) =>
  [o.payment_state, o.amount_paid, o.amount_due, o.amount_extra, o.paid_at && o.paid_at.slice(8, 10), o.paid_method];

describe('recount', () => {
  it.each([
    ['nothing paid', 1000, [], ['not_paid', 0, 1000, 0, null, null]],
    ['part paid', 1000, [pay('a', 750, '24')], ['part_paid', 750, 250, 0, null, null]],
    ['paid by the payment that got there, in date order', 1000,
      [pay('b', 250, '27', 'cash'), pay('a', 750, '24')], ['paid', 1000, 0, 0, '27', 'cash']],
    ['extra keeps the covering payment', 1000,
      [pay('a', 750, '24'), pay('b', 250, '25', 'cash'), pay('c', 50, '26')], ['paid', 1050, 0, 50, '25', 'cash']],
    ['no total: any payment is paid in full', null, [pay('a', null, '24')], ['paid', 0, null, null, '24', 'upi']],
    ['a ₹0 order needs its one payment', 0, [pay('a', 0, '24')], ['paid', 0, 0, 0, '24', 'upi']],
  ] as const)('%s', (_, amount, payments, want) => {
    expect(money(recount(order(amount), [...payments]))).toEqual(want);
  });

  it('a ₹0 order with no payment is not paid', () => {
    expect(recount(order(0), []).payment_state).toBe('not_paid');
  });
});

describe('quick picks', () => {
  const at = (amount: number | null, due: number | null) => ({ amount, amount_due: due }) as Order;

  it('offers ¾, ½ and ¼ of the total, only below what is still due', () => {
    expect(quickPicks(at(1000, 1000))).toEqual([
      { label: '¾', amount: 750 }, { label: '½', amount: 500 }, { label: '¼', amount: 250 },
    ]);
    expect(quickPicks(at(1000, 600)).map((p) => p.label)).toEqual(['½', '¼']);
    expect(quickPicks(at(1000, 250))).toEqual([]);
  });

  it('rounds to the rupee, and offers nothing without a total', () => {
    expect(quickPicks(at(999, 999)).map((p) => p.amount)).toEqual([749, 500, 250]);
    expect(quickPicks(at(null, null))).toEqual([]);
  });
});

describe('a typed amount', () => {
  it('takes whole rupees with ₹ and commas, and nothing else', () => {
    expect(['500', '₹1,000', ' 750 ', '0', '12.5', '', 'abc', '10,00,001'].map(parseAmount))
      .toEqual([500, 1000, 750, null, null, null, null, null]);
  });
});
