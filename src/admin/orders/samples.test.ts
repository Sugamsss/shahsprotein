import { describe, expect, it } from 'vitest';
import type { Order } from '../types';
import { isSamplesOnly, keepChanges, keepDraft, moneyInput, sampleGroups } from './samples';

// Made-up codes only: the repo is public.

const form = { total: 480, coupon: 'EXAMPLE10', paid: true, paidMethod: 'upi' as const, paidNote: '' };

describe('a samples-only order sends no money', () => {
  it('counts only lines with packs in them', () => {
    expect(isSamplesOnly([{ size: 'sample', quantity: 1 }, { size: '250 g', quantity: 0 }])).toBe(true);
    expect(isSamplesOnly([{ size: 'sample', quantity: 1 }, { size: '250 g', quantity: 1 }])).toBe(false);
    expect(isSamplesOnly([])).toBe(false);
  });

  it('leaves out total, coupon and paid on a new free sample order', () => {
    expect(moneyInput({ ...form, samplesOnly: true, editing: false })).toEqual({ amount: null });
  });

  it('clears the total and coupon when an edit leaves only samples', () => {
    expect(moneyInput({ ...form, samplesOnly: true, editing: true })).toEqual({ amount: null, coupon: null });
  });

  it('sends the money as typed when there is a pack', () => {
    expect(moneyInput({ ...form, samplesOnly: false, editing: false }))
      .toEqual({ amount: 480, coupon: 'EXAMPLE10', paid: true, paid_method: 'upi' });
    expect(moneyInput({ ...form, coupon: '', samplesOnly: false, editing: true })).toEqual({ amount: 480, coupon: null });
  });
});

describe('the product sheet sends only what changed', () => {
  const before = { sample_grams: 20, shelf_life: { amount: 6, unit: 'months' as const } };
  const draft = keepDraft(20, before.shelf_life);

  it.each([
    ['nothing changed', {}, { settings: null }],
    ['a new sample weight', { sample: '25' }, { settings: { sample_grams: 25 } }],
    ['months switched to days', { unit: 'days' }, { settings: { shelf_life: { amount: 6, unit: 'days' } } }],
    ['a new amount', { amount: ' 4 ' }, { settings: { shelf_life: { amount: 4, unit: 'months' } } }],
    ['a sample that isn’t a number', { sample: '20g' }, { bad: 'sample' }],
    ['an emptied shelf life', { amount: '' }, { bad: 'shelf' }],
    ['a shelf life that isn’t a number', { amount: 'six' }, { bad: 'shelf' }],
  ] as const)('%s', (_, change, expected) => {
    expect(keepChanges(before, { ...draft, ...change })).toEqual(expected);
  });

  it('lets a product without a shelf life stay without one', () => {
    const none = { sample_grams: 15, shelf_life: null };
    expect(keepChanges(none, keepDraft(15, null))).toEqual({ settings: null });
    expect(keepChanges(none, { ...keepDraft(15, null), amount: '15', unit: 'days' }))
      .toEqual({ settings: { shelf_life: { amount: 15, unit: 'days' } } });
  });
});

describe('the Free samples list', () => {
  const order = (id: string, status: Order['status'], created_at: string) => ({ id, status, created_at });

  it('puts orders not delivered yet first, then the rest by day, newest first as sent', () => {
    const orders = [
      order('a', 'ready', '2026-09-28T10:00:00Z'),
      order('b', 'delivered', '2026-09-25T10:00:00Z'),
      order('c', 'cooking', '2026-09-24T10:00:00Z'),
      order('d', 'delivered', '2026-09-23T12:00:00Z'),
      order('e', 'cancelled', '2026-09-23T09:00:00Z'),
    ];
    const groups = sampleGroups(orders, (iso) => iso.slice(0, 10));
    expect(groups.map((g) => [g.day, g.orders.map((o) => o.id)])).toEqual([
      [null, ['a', 'c']],
      ['2026-09-25', ['b']],
      ['2026-09-23', ['d', 'e']],
    ]);
  });
});
