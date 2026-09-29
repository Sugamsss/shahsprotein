import { describe, expect, it } from 'vitest';
import { adminCopy } from '../../data/adminCopy';
import type { Kitchen, KitchenEffects, KitchenProduct } from '../types';
import {
  gOptions, keepsOf, loggedThisWeek, outcomesOf, partOptions, partStart, prefill, spareWarnings, toCook,
} from './model';

// The demo seed's kitchen (supabase/seeds/local-demo.sql), trimmed: Raggi Jaggi 2 kg for
// Meera (priority), Asha, Neha and Sameer; Muesli 750 g for Ravi and Neha; Date Bites
// nothing to cook, 285 g near its date and 150 g fresh on the shelf. The RPC lists
// products by id, so Date Bites comes first and Raggi Jaggi last.

const q = (order_id: string, name: string, short: number, extra: Partial<KitchenProduct['queue'][number]> = {}) => ({
  order_id, code: `SN-${order_id}`, name, created_at: '2026-09-27T05:00:00Z', priority: false, short, also_waiting: [], covered: [], ...extra,
});

const product = (p: Partial<KitchenProduct> & { product_id: string }): KitchenProduct => ({
  sample_grams: 20, shelf_life: { amount: 6, unit: 'months' }, to_cook: 0, waiting_packs: [], queue: [], spare: 0, spare_batches: [], ...p,
});

const seed = (): Kitchen => ({
  can_write_off: true,
  today: '2026-09-29',
  products: [
    product({
      product_id: 'bites', shelf_life: { amount: 15, unit: 'days' }, spare: 435,
      spare_batches: [
        { batch_id: 'old', made_on: '2026-09-17', grams: 285, expires_on: '2026-10-02', days_left: 3, state: 'near' },
        { batch_id: 'new', made_on: '2026-09-28', grams: 150, expires_on: '2026-10-13', days_left: 14, state: 'fresh' },
      ],
    }),
    product({ product_id: 'muesli', to_cook: 750, queue: [q('ravi', 'Ravi Deshmukh', 500), q('neha', 'Neha Pawar', 250, { also_waiting: ['raggi-jaggi'] })] }),
    product({
      product_id: 'raggi-jaggi', to_cook: 2000,
      queue: [
        q('meera', 'Meera Kulkarni', 500, { priority: true }),
        q('asha', 'Asha Patil', 500, { covered: ['bites'] }),
        q('neha', 'Neha Pawar', 500, { also_waiting: ['muesli'] }),
        q('sameer', 'Sameer Shinde', 500, { covered: ['bites'] }),
      ],
    }),
  ],
  batches: [],
});

/** The kitchen after a log, as the server would send it back. */
const after = (products: KitchenProduct[]): Kitchen => ({ ...seed(), products });

const order = (id: string, name: string, from: 'cooking' | 'packing', to: 'cooking' | 'packing', grams: [string, number][], waiting: string[] = []) => ({
  id, code: `SN-${id}`, name, from, to, grams: grams.map(([product_id, change]) => ({ product_id, change })), waiting,
});

const batch = (id: string, product_id: string, grams: number, spare: number, made_on = '2026-09-29') =>
  ({ id, product_id, grams, made_on, to_orders: grams - spare, spare, written_off: 0, deleted: false });

describe('what to cook', () => {
  it('pre-fills Log cooking with every product to cook at exactly its need, in the site order', () => {
    expect(prefill(seed())).toEqual([
      { product_id: 'raggi-jaggi', need: 2000, grams: 2000 },
      { product_id: 'muesli', need: 750, grams: 750 },
    ]);
  });

  it('has nothing to cook once everything is covered', () => {
    const k = seed();
    k.products = k.products.map((p) => ({ ...p, to_cook: 0, queue: [] }));
    expect(toCook(k)).toEqual([]);
  });
});

describe('what a log does', () => {
  it('covers every waiting order: all of them to Packing, the leftover spare with its use-by day', () => {
    const effects: KitchenEffects = {
      preview: true, action_id: null,
      batches: [batch('rj', 'raggi-jaggi', 2000, 0), batch('mu', 'muesli', 1000, 250)],
      orders: [
        order('asha', 'Asha Patil', 'cooking', 'packing', [['raggi-jaggi', 500]]),
        order('ravi', 'Ravi Deshmukh', 'cooking', 'packing', [['muesli', 500]]),
        order('neha', 'Neha Pawar', 'cooking', 'packing', [['muesli', 250], ['raggi-jaggi', 500]]),
        order('sameer', 'Sameer Shinde', 'cooking', 'packing', [['raggi-jaggi', 500]]),
        order('meera', 'Meera Kulkarni', 'cooking', 'packing', [['raggi-jaggi', 500]]),
      ],
      kitchen: after([
        product({ product_id: 'muesli', spare: 250, spare_batches: [{ batch_id: 'mu', made_on: '2026-09-29', grams: 250, expires_on: '2027-03-29', days_left: 181, state: 'fresh' }] }),
        product({ product_id: 'raggi-jaggi' }),
      ]),
    };
    const out = outcomesOf(effects, seed(), 'log');
    expect(out).toEqual([
      { kind: 'toPacking', names: ['Asha', 'Ravi', 'Neha', 'Sameer', 'Meera'], all: true },
      { kind: 'spare', product_id: 'muesli', grams: 250, useBy: '2027-03-28' },
    ]);
    expect(adminCopy.kitchen.outcomes.allCovered(5)).toBe('All 5 orders are covered.');
    expect(adminCopy.kitchen.outcomes.goPacking(['Asha', 'Ravi', 'Neha', 'Sameer', 'Meera'], true))
      .toBe('Asha, Ravi, Neha, Sameer and Meera go to Packing for Sunit.');
  });

  it('made only 1 kg Raggi Jaggi: who moves, who is partly covered, who still waits, nothing spare', () => {
    const effects: KitchenEffects = {
      preview: true, action_id: null,
      batches: [batch('rj', 'raggi-jaggi', 1000, 0)],
      orders: [
        order('asha', 'Asha Patil', 'cooking', 'packing', [['raggi-jaggi', 500]]),
        order('meera', 'Meera Kulkarni', 'cooking', 'packing', [['raggi-jaggi', 500]]),
      ],
      kitchen: after([
        product({ product_id: 'muesli', to_cook: 750, queue: [q('ravi', 'Ravi Deshmukh', 500), q('neha', 'Neha Pawar', 250)] }),
        product({ product_id: 'raggi-jaggi', to_cook: 1000, queue: [q('neha', 'Neha Pawar', 500), q('sameer', 'Sameer Shinde', 500)] }),
      ]),
    };
    expect(outcomesOf(effects, seed(), 'log')).toEqual([
      { kind: 'toPacking', names: ['Asha', 'Meera'], all: false },
      {
        kind: 'stillWait',
        // Fill order, product by product in the site's order: Raggi Jaggi's queue first.
        names: ['Neha', 'Sameer', 'Ravi'],
        toCook: [{ product_id: 'raggi-jaggi', grams: 1000 }, { product_id: 'muesli', grams: 750 }],
      },
      { kind: 'noSpare' },
    ]);
    expect(adminCopy.kitchen.outcomes.covered(['Asha', 'Meera'])).toBe("Asha's and Meera's orders are covered.");
  });

  it('an order that got one product but waits on another says what it still waits on', () => {
    const effects: KitchenEffects = {
      preview: true, action_id: null,
      batches: [batch('mu', 'muesli', 750, 0)],
      orders: [
        order('ravi', 'Ravi Deshmukh', 'cooking', 'packing', [['muesli', 500]]),
        order('neha', 'Neha Pawar', 'cooking', 'cooking', [['muesli', 250]], ['raggi-jaggi']),
      ],
      kitchen: after([
        product({ product_id: 'muesli' }),
        product({ product_id: 'raggi-jaggi', to_cook: 500, queue: [q('neha', 'Neha Pawar', 500)] }),
      ]),
    };
    const out = outcomesOf(effects, seed(), 'log');
    expect(out[1]).toEqual({ kind: 'partly', name: 'Neha', got: ['muesli'], waits: [{ product_id: 'raggi-jaggi', grams: 500 }] });
    // Neha is named as partly covered, not again as still waiting.
    expect(out.some((o) => o.kind === 'stillWait')).toBe(false);
  });

  it('a Cooking order losing food to a priority order reads as waiting again, with what it lost', () => {
    const effects: KitchenEffects = {
      preview: true, action_id: null,
      batches: [batch('rj', 'raggi-jaggi', 500, 0)],
      orders: [
        order('meera', 'Meera Kulkarni', 'cooking', 'packing', [['raggi-jaggi', 500]]),
        order('neha', 'Neha Pawar', 'cooking', 'cooking', [['raggi-jaggi', -250]], ['raggi-jaggi']),
      ],
      kitchen: after([product({ product_id: 'raggi-jaggi', to_cook: 500, queue: [q('neha', 'Neha Pawar', 500)] })]),
    };
    expect(outcomesOf(effects, seed(), 'log')).toContainEqual({ kind: 'waitsAgain', name: 'Neha', lost: [{ product_id: 'raggi-jaggi', grams: 250 }] });
  });
});

describe('what a fix does', () => {
  const logged = (): Kitchen => ({
    ...seed(),
    batches: [{ id: 'mu', product_id: 'muesli', grams: 1000, made_on: '2026-09-29', created_at: '2026-09-29T08:00:00Z', by_name: 'Cook', to_orders: 750, orders: 2, spare: 250, written_off: 0 }],
  });

  it('a smaller batch takes the spare off the shelf and moves no order', () => {
    const effects: KitchenEffects = {
      preview: true, action_id: null, batches: [batch('mu', 'muesli', 750, 0)], orders: [], kitchen: after([product({ product_id: 'muesli' })]),
    };
    expect(outcomesOf(effects, logged(), 'fix')).toEqual([
      { kind: 'ordersSame' },
      { kind: 'spareLess', product_id: 'muesli', before: 250, after: 0 },
    ]);
  });

  it('smaller still: the newest order goes back to Cooking', () => {
    const effects: KitchenEffects = {
      preview: true, action_id: null,
      batches: [batch('mu', 'muesli', 500, 0)],
      orders: [order('neha', 'Neha Pawar', 'packing', 'cooking', [['muesli', -250]], ['muesli'])],
      kitchen: after([product({ product_id: 'muesli', to_cook: 250, queue: [q('neha', 'Neha Pawar', 250)] })]),
    };
    expect(outcomesOf(effects, logged(), 'fix')).toEqual([
      { kind: 'backToCooking', names: ['Neha'] },
      { kind: 'spareLess', product_id: 'muesli', before: 250, after: 0 },
    ]);
  });
});

describe('spare and its dates', () => {
  it('says days while a month or less is left, then the use-by day (the day before expires_on)', () => {
    expect(keepsOf({ state: 'near', days_left: 3, expires_on: '2026-10-02' })).toEqual({ kind: 'days', days: 3 });
    expect(keepsOf({ state: 'near', days_left: 1, expires_on: '2026-09-30' })).toEqual({ kind: 'today' });
    expect(keepsOf({ state: 'fresh', days_left: 181, expires_on: '2027-03-29' })).toEqual({ kind: 'until', day: '2027-03-28' });
    expect(keepsOf({ state: 'past', days_left: 0, expires_on: '2026-09-29' })).toEqual({ kind: 'past' });
  });

  it('warns once per product about its most urgent spare, past before near', () => {
    const k = seed();
    k.products[1] = product({
      product_id: 'muesli',
      spare_batches: [{ batch_id: 'gone', made_on: '2026-03-01', grams: 100, expires_on: '2026-09-01', days_left: -28, state: 'past' }],
    });
    expect(spareWarnings(k).map((w) => [w.product_id, w.batch.batch_id])).toEqual([['muesli', 'gone'], ['bites', 'old']]);
  });

  it('"Logged this week" leaves out batches logged and made over a week ago', () => {
    const k = seed();
    const b = { product_id: 'bites', grams: 500, by_name: null, to_orders: 0, orders: 0, spare: 500, written_off: 0 };
    k.batches = [
      { ...b, id: 'recent', made_on: '2026-09-23', created_at: '2026-09-23T05:00:00Z' },
      { ...b, id: 'old', made_on: '2026-09-20', created_at: '2026-09-22T05:00:00Z' },
    ];
    expect(loggedThisWeek(k).map((x) => x.id)).toEqual(['recent']);
  });
});

describe('the wheels', () => {
  it('keeps an amount that is off the 50 g steps (a need with a sample in it) selectable', () => {
    expect(gOptions(2040)).toContain(40);
    expect(gOptions(2040).indexOf(40)).toBe(1);
    expect(gOptions(2250)).toHaveLength(20);
  });

  it('"Part of it" steps up to just under the whole spare, and starts near half', () => {
    expect(partOptions(285)).toEqual([50, 100, 150, 200, 250]);
    expect(partStart(285)).toBe(150);
    expect(partOptions(50)).toEqual([]);
  });
});
