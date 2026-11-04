import { describe, expect, it } from 'vitest';
import type { Kitchen, KitchenProduct, Order, OrderKitchen } from '../types';
import { batchesText } from '../orders/model';
import { batchChoices, batchDates, canChangeBatch, hasBatchNumbers, labelDate, orderBatches, shelfOf } from './batches';
import { outcomesOf } from './model';

const product = (p: Partial<KitchenProduct> & { product_id: string }): KitchenProduct => ({
  sample_grams: 20, shelf_life: { amount: 6, unit: 'months' }, to_cook: 0, waiting_packs: [], queue: [], spare: 0, spare_batches: [], ...p,
});

const kitchen = (spare: KitchenProduct['spare_batches']): Kitchen => ({
  can_write_off: true,
  today: '2026-11-04',
  products: [product({ product_id: 'raggi-jaggi', spare_batches: spare })],
  batches: [],
});

const order = (status: Order['status'], k: Partial<OrderKitchen> = {}): Order => ({
  id: 'o1', code: 'SN-ABCDE', status,
  kitchen: [{
    product_id: 'raggi-jaggi', need: 500, covered: 500, by_hand: 0, waiting: false,
    batches: [{ batch_id: 'r1', code: 'R301026', made_on: '2026-10-30', expires_on: '2027-04-30', grams: 500 }],
    ...k,
  }],
} as unknown as Order);

const shelf = (batch_id: string, code: string, made_on: string, grams: number, state: 'fresh' | 'near' | 'past' = 'fresh') =>
  ({ batch_id, code, made_on, grams, expires_on: '2027-05-04', days_left: 181, state });

describe('labelDate and batchDates', () => {
  it('reads like a pack', () => {
    expect(labelDate('2026-11-04')).toBe('4 Nov 2026');
    expect(labelDate('2027-01-31')).toBe('31 Jan 2027');
  });

  it('Exp is the last good day: the day before the batch is past', () => {
    expect(batchDates({ made_on: '2026-11-04', expires_on: '2027-05-04' })).toEqual({ mfg: '4 Nov 2026', exp: '3 May 2027' });
    expect(batchDates({ made_on: '2026-11-04', expires_on: '2026-11-19' }).exp).toBe('18 Nov 2026');
  });

  it('no Exp when the product never expires', () => {
    expect(batchDates({ made_on: '2026-11-04', expires_on: null }).exp).toBeNull();
    expect(batchDates({ made_on: '2026-11-04' }).exp).toBeNull();
  });
});

describe('hasBatchNumbers and orderBatches', () => {
  it('on only when the database sends numbers', () => {
    expect(hasBatchNumbers(order('packing'))).toBe(true);
    expect(hasBatchNumbers(order('packing', { batches: [{ made_on: '2026-10-30', grams: 500 }] }))).toBe(false);
    expect(orderBatches(order('packing', { batches: [{ made_on: '2026-10-30', grams: 500 }] }), 'raggi-jaggi')).toEqual([]);
  });

  it('lists a product\'s batches, oldest first as sent', () => {
    expect(orderBatches(order('packing'), 'raggi-jaggi').map((b) => b.code)).toEqual(['R301026']);
    expect(orderBatches(order('packing'), 'muesli')).toEqual([]);
  });
});

describe('canChangeBatch', () => {
  it('ready products only, never a cancelled order', () => {
    expect(canChangeBatch(order('packing'), 'raggi-jaggi')).toBe(true);
    expect(canChangeBatch(order('delivered'), 'raggi-jaggi')).toBe(true);
    expect(canChangeBatch(order('cooking'), 'raggi-jaggi')).toBe(true);
    expect(canChangeBatch(order('cooking', { waiting: true, covered: 200 }), 'raggi-jaggi')).toBe(false);
    expect(canChangeBatch(order('cancelled'), 'raggi-jaggi')).toBe(false);
    expect(canChangeBatch(order('packing'), 'muesli')).toBe(false);
  });
});

describe('batchChoices', () => {
  it('oldest first, the current one marked, enough spare or not', () => {
    const choices = batchChoices(
      kitchen([shelf('r2', 'R041126', '2026-11-04', 600), shelf('r3', 'R041126-2', '2026-11-04', 300)]),
      order('packing'),
      'raggi-jaggi',
    );
    expect(choices.map((c) => [c.code, c.current, c.enough, c.oldest])).toEqual([
      ['R301026', true, true, true],
      ['R041126', false, true, false],
      ['R041126-2', false, false, false],
    ]);
  });

  it('what the order already has from a batch counts towards enough', () => {
    const o = order('packing', {
      batches: [
        { batch_id: 'r1', code: 'R301026', made_on: '2026-10-30', expires_on: '2027-04-30', grams: 300 },
        { batch_id: 'r2', code: 'R041126', made_on: '2026-11-04', expires_on: '2027-05-04', grams: 200 },
      ],
    });
    const choices = batchChoices(kitchen([shelf('r2', 'R041126', '2026-11-04', 300)]), o, 'raggi-jaggi');
    // R301026 has nothing left on the shelf: 300 g isn't the whole 500 g.
    expect(choices.map((c) => [c.code, c.current, c.enough])).toEqual([
      ['R301026', false, false],
      ['R041126', false, true],
    ]);
  });

  it('past batches: refused for an order going out, fine for a delivered one', () => {
    const k = kitchen([shelf('bp', 'R011026', '2026-10-01', 900, 'past')]);
    expect(batchChoices(k, order('packing'), 'raggi-jaggi')[0]).toMatchObject({ code: 'R011026', past: true });
    expect(batchChoices(k, order('delivered'), 'raggi-jaggi')[0]).toMatchObject({ code: 'R011026', past: false });
  });

  it('by hand: no batch yet, every batch with enough spare is a choice', () => {
    const o = order('ready', { batches: [], by_hand: 500 });
    const choices = batchChoices(kitchen([shelf('r2', 'R041126', '2026-11-04', 600)]), o, 'raggi-jaggi');
    expect(choices.map((c) => [c.code, c.current, c.enough])).toEqual([['R041126', false, true]]);
  });
});

describe('shelfOf', () => {
  it('none once nothing is left, else the state', () => {
    expect(shelfOf({ spare: 0, state: 'fresh' })).toBe('none');
    expect(shelfOf({ spare: 10, state: 'near' })).toBe('near');
  });
});

describe('the batch number in a log preview, and the CSV column', () => {
  const effects = (code: string | undefined) => ({
    preview: true, action_id: null, orders: [],
    batches: [{ id: 'new', code, expires_on: '2027-05-04', product_id: 'raggi-jaggi', grams: 3000, made_on: '2026-11-04', to_orders: 0, spare: 3000, written_off: 0, deleted: false }],
    kitchen: kitchen([]),
  });

  it('a log says the number it gets, with Mfg and Exp, first', () => {
    const out = outcomesOf(effects('R041126'), kitchen([]), 'log');
    expect(out[0]).toEqual({ kind: 'batchNumber', product_id: 'raggi-jaggi', code: 'R041126', made_on: '2026-11-04', expires_on: '2027-05-04', changed: false });
  });

  it('nothing about numbers before the database sends them', () => {
    expect(outcomesOf(effects(undefined), kitchen([]), 'log').some((o) => o.kind === 'batchNumber')).toBe(false);
  });

  it('a fix of the day says the new number; a fix that keeps it says nothing about it', () => {
    const before = { ...kitchen([]), batches: [{ id: 'new', code: 'R031126', product_id: 'raggi-jaggi', grams: 3000, made_on: '2026-11-03', created_at: '', by_name: null, to_orders: 0, orders: 0, spare: 3000, written_off: 0 }] };
    expect(outcomesOf(effects('R041126'), before, 'fix')[0]).toMatchObject({ kind: 'batchNumber', code: 'R041126', changed: true });
    expect(outcomesOf(effects('R031126'), before, 'fix').some((o) => o.kind === 'batchNumber')).toBe(false);
  });

  it('the CSV lists every number, in the site\'s product order', () => {
    const o = {
      kitchen: [
        { product_id: 'muesli', need: 500, covered: 500, by_hand: 0, waiting: false, batches: [{ code: 'M041126', made_on: '2026-11-04', grams: 500 }] },
        { product_id: 'raggi-jaggi', need: 500, covered: 500, by_hand: 0, waiting: false, batches: [
          { code: 'R301026', made_on: '2026-10-30', grams: 300 }, { code: 'R041126', made_on: '2026-11-04', grams: 200 }] },
        { product_id: 'bites', need: 500, covered: 500, by_hand: 500, waiting: false, batches: [] },
      ],
    } as unknown as Order;
    expect(batchesText(o)).toBe('R301026, R041126, M041126');
  });
});
