import { describe, expect, it } from 'vitest';
import type { Metrics, MetricsBucket, MetricsPeriod, MetricsTotals } from '../types';
import {
  barChart, barReadout, changeLine, changeOf, chipChange, hourReadout, lineChart, nice, noCompareLine, notes, productRows,
  profit, profitLabel, rangeLine, sentence,
} from './metrics';

// Home's "How it's going" block: the words and maths the browser adds to get_admin_metrics().
// Times are India time; the first order in these is Wed 23 Sep 2026, 10:00 am.

const FIRST = '2026-09-23T10:00:00+05:30';

const totals = (t: Partial<MetricsTotals> = {}): MetricsTotals => ({
  orders: 0, packs: 0, grams: 0, sales: 0, with_total: 0, without_total: 0, paid_of_sales: 0,
  samples: { orders: 0, packs: 0 },
  came_in: { amount: 0, payments: 0, without_amount: 0, by_method: { upi: 0, cash: 0, bank: 0, other: 0, not_recorded: 0 } },
  ...t,
});
const bucket = (date: string, b: Partial<MetricsBucket> = {}): MetricsBucket => ({
  date, orders: 0, with_total: 0, packs: 0, sales: 0, came_in: 0,
  came_in_by_method: { upi: 0, cash: 0, bank: 0, other: 0, not_recorded: 0 }, products: [], ...b,
});
const period = (p: Partial<MetricsPeriod> & { chart: MetricsPeriod['chart'] }): MetricsPeriod => ({
  starts_at: null, ends_at: '', totals: totals(), previous: null, products: [], ...p,
});
const flat = (grain: MetricsPeriod['chart']['grain']) => period({ chart: { grain, now_index: 0, current: [bucket('2026-01-01')], previous: null } });
/** Metrics at `asOf`, every period empty and uncompared unless given. */
const metrics = (asOf: string, first: string | null, periods: Partial<Metrics['periods']> = {}): Metrics => ({
  as_of: asOf,
  first_order_at: first,
  periods: { today: flat('hour'), week: flat('day'), month: flat('day'), year: flat('month'), lifetime: flat('week'), ...periods },
});
const days = (from: string, n: number, sales: (i: number) => number) => Array.from({ length: n }, (_, i) => {
  const d = new Date(Date.parse(`${from}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10);
  return bucket(d, { sales: sales(i) });
});

describe('change: the contract helper, as kinds', () => {
  it.each([
    ['no comparison', 5, null, null],
    ['both zero', 0, 0, { kind: 'both-zero' }],
    ['new from nothing (never ∞)', 4, 0, { kind: 'new' }],
    ['none yet against something', 0, 500, { kind: 'none-yet' }],
    ['same', 7, 7, { kind: 'same' }],
    ['down, rounded', 1190, 1450, { kind: 'down', pct: 18, big: false }],
    ['up by 100% or more says the before number', 970, 260, { kind: 'up', pct: 273, big: true }],
    ['a tiny move rounds to 0, not to "same"', 1001, 1000, { kind: 'up', pct: 0, big: false }],
  ] as const)('%s', (_, now, before, want) => {
    expect(changeOf(now, before)).toEqual(want);
  });
});

describe('the change line under the sentence', () => {
  it('says the % against the same moment, and the before number when the % is 100 or more', () => {
    expect(changeLine('today', 'sales', changeOf(1190, 1450)!, 1450)).toEqual({ text: 'Down 18% vs this time yesterday', icon: 'down', up: false });
    expect(changeLine('week', 'packs', changeOf(30, 13)!, 13)).toEqual({ text: 'Up 131% vs this time last week (from 13)', icon: 'up', up: true });
    expect(changeLine('week', 'sales', changeOf(8090, 3650)!, 3650).text).toBe('Up 122% vs this time last week (from ₹3,650)');
    expect(changeLine('month', 'sales', changeOf(1001, 1000)!, 1000).text).toBe('Up under 1% vs this time last month');
  });

  it('has no arrow when nothing moved, and is never glum on an empty morning', () => {
    expect(changeLine('today', 'orders', changeOf(3, 3)!, 3)).toEqual({ text: 'Same as this time yesterday', icon: null, up: false });
    expect(changeLine('today', 'sales', changeOf(0, 0)!, 0)).toEqual({ text: 'Nothing by this time yesterday either', icon: null, up: false });
    expect(changeLine('today', 'sales', changeOf(0, 500)!, 500)).toEqual({ text: 'Yesterday had ₹500 by now.', icon: null, up: false });
    expect(changeLine('year', 'orders', changeOf(2, 0)!, 0)).toEqual({ text: 'New: none by this time last year', icon: 'up', up: true });
  });
});

describe("a chip's change: grey, short, and spoken in full", () => {
  it('puts "from" on its own line only at 100% or more', () => {
    expect(chipChange('today', 'came_in', changeOf(970, 260)!, 260)).toEqual({
      icon: 'up', text: '273%', from: 'from ₹260', spoken: 'up 273% from ₹260 vs this time yesterday',
    });
    expect(chipChange('today', 'sales', changeOf(1190, 1450)!, 1450)).toMatchObject({ text: '18%', from: null, spoken: 'down 18% vs this time yesterday' });
  });
  it('says what it was when there is none yet, and nothing when both are 0', () => {
    expect(chipChange('today', 'sales', changeOf(0, 500)!, 500)).toMatchObject({ icon: null, text: 'yesterday ₹500' });
    expect(chipChange('week', 'packs', changeOf(0, 0)!, 0)).toBeNull();
  });
});

describe('no comparison: said once, with the day comparisons start', () => {
  const at = (asOf: string, key: 'today' | 'week' | 'month' | 'year', starts: string) =>
    noCompareLine(key, metrics(asOf, FIRST, { [key]: period({ starts_at: starts, chart: flat('day').chart }) }));

  it('today: the first day, then the first full one', () => {
    expect(at('2026-09-23T18:00:00+05:30', 'today', '2026-09-23T00:00:00+05:30')).toBe('Our first day.');
    expect(at('2026-09-24T09:00:00+05:30', 'today', '2026-09-24T00:00:00+05:30')).toBe('Our first full day. Comparisons start tomorrow.');
  });
  it('week: two Mondays on from the first week, "Monday" when that is the next one', () => {
    expect(at('2026-09-24T09:00:00+05:30', 'week', '2026-09-21T00:00:00+05:30')).toBe('Our first week. Comparisons start Mon 5 Oct.');
    expect(at('2026-09-30T09:00:00+05:30', 'week', '2026-09-28T00:00:00+05:30')).toBe('Our first full week. Comparisons start Monday.');
  });
  it('month: the 1st two months on, in the first month and the first full one', () => {
    expect(at('2026-09-30T09:00:00+05:30', 'month', '2026-09-01T00:00:00+05:30')).toBe('Our first month. Comparisons start 1 Nov.');
    expect(at('2026-10-22T16:10:00+05:30', 'month', '2026-10-01T00:00:00+05:30')).toBe('Our first full month. Comparisons start 1 Nov.');
  });
  it('year: the same as Lifetime in the first year, then 1 Jan two years on', () => {
    expect(at('2026-10-22T16:10:00+05:30', 'year', '2026-01-01T00:00:00+05:30')).toBe('Same as Lifetime until 1 Jan.');
    expect(at('2027-03-18T16:10:00+05:30', 'year', '2027-01-01T00:00:00+05:30')).toBe('Our first full year. Comparisons start 1 Jan 2028.');
  });
  it('a period that compares has no such line; Lifetime always has one', () => {
    const compared = period({ starts_at: '2026-10-22T00:00:00+05:30', previous: { starts_at: '', ends_at: '', totals: totals() }, chart: flat('hour').chart });
    expect(noCompareLine('today', metrics('2026-10-22T16:10:00+05:30', FIRST, { today: compared }))).toBeNull();
    expect(noCompareLine('lifetime', metrics('2026-10-22T16:10:00+05:30', FIRST))).toBe('Everything since the first order on 23 Sep.');
    expect(noCompareLine('lifetime', metrics('2027-03-18T16:10:00+05:30', FIRST))).toBe('Everything since the first order on 23 Sep 2026.');
    expect(noCompareLine('lifetime', metrics('2026-10-22T16:10:00+05:30', null))).toBe('Your first order will show here.');
  });
});

describe('the range line', () => {
  it.each([
    ['today', '2026-10-22T16:10:00+05:30', 'Thu 22 Oct, until 4:10 pm'],
    ['week', '2026-10-22T16:10:00+05:30', 'Mon 19 Oct – Thu 22 Oct'],
    ['week', '2026-10-19T08:00:00+05:30', 'Mon 19 Oct'],
    ['month', '2026-10-22T16:10:00+05:30', '1 – 22 Oct'],
    ['month', '2026-10-01T09:00:00+05:30', '1 Oct'],
    ['year', '2026-10-22T16:10:00+05:30', '2026 so far'],
    ['lifetime', '2026-10-22T16:10:00+05:30', 'Since Wed 23 Sep 2026'],
  ] as const)('%s at %s', (key, asOf, want) => {
    expect(rangeLine(key, metrics(asOf, FIRST))).toBe(want);
  });
  it('an India date even when UTC is still the day before', () => {
    expect(rangeLine('today', metrics('2026-10-21T19:00:00Z', FIRST))).toBe('Thu 22 Oct, until 12:30 am');
  });
});

describe('the sentence and its small print', () => {
  it('names nothing as nothing, but Came in always shows its ₹', () => {
    expect(sentence('today', 'sales', totals())).toMatchObject({ figure: 'No sales', rest: 'yet today', money: false });
    expect(sentence('today', 'came_in', totals())).toMatchObject({ figure: '₹0', rest: 'came in today', money: true });
    expect(sentence('week', 'orders', totals({ orders: 1 }))).toMatchObject({ figure: '1 order', rest: 'this week' });
  });
  it('Packs leads with the weight; Came in only notes payments with no amount', () => {
    const t = totals({ packs: 6, grams: 4500, without_total: 1, samples: { orders: 2, packs: 2 } });
    expect(notes('packs', t)).toEqual(['4½ kg', '1 order without a total', 'Not counting 2 free samples']);
    expect(notes('came_in', { ...t, came_in: { ...t.came_in, without_amount: 1 } })).toEqual(['1 payment had no amount']);
  });
  it('profit is one share of sales, and its label reads that share', () => {
    expect(profit(1190)).toBe(298);
    expect(profitLabel()).toBe('Profit, est. at 25%');
  });
});

describe('the chart scale', () => {
  it.each([[0, 1], [1, 1], [7, 8], [1190, 1200], [1450, 1500], [2440, 2500], [8090, 10_000], [26_000, 30_000]])('%i → %i', (v, top) => {
    expect(nice(v)).toBe(top);
  });
});

describe("Today's running total", () => {
  const hours = (sales: Record<number, number>) => Array.from({ length: 24 }, (_, h) => bucket('2026-10-22', { hour: h, sales: sales[h] ?? 0 }));
  const today = period({
    previous: { starts_at: '', ends_at: '', totals: totals({ sales: 1450 }) },
    chart: { grain: 'hour', now_index: 16, current: hours({ 9: 640, 13: 550 }), previous: hours({ 8: 520, 14: 930, 18: 1000 }) },
  });
  const chart = lineChart(today, 'sales', '2026-10-22T16:30:00+05:30');

  it('adds the hours up, and puts now at the minute', () => {
    expect(chart.cur[10]).toBe(640);
    expect(chart.total).toBe(1190);
    expect(chart.nowX).toBe(16.5);
    expect(chart.ghostAtNow).toBe(1450);
    // Room for yesterday's whole day, not only up to now.
    expect(chart.top).toBe(2500);
    // 6 pm is within 3.4 hours of now, so it gives way.
    expect(chart.ticks.map((t) => t.label)).toEqual(['12 am', '6 am', '12 pm', 'Now']);
  });
  it('reads an hour by its end, "By now" against yesterday by now, nothing after now', () => {
    expect(hourReadout(chart, 9, 'sales', 1450)).toEqual({ when: 'By 10 am', value: { figure: '₹640', words: 'in sales' }, dim: null, before: 'Yesterday: ₹520' });
    expect(hourReadout(chart, 16, 'sales', 1450)).toMatchObject({ when: 'By now', value: { figure: '₹1,190' }, before: 'Yesterday: ₹1,450' });
    expect(hourReadout(chart, 23, 'sales', 1450)).toMatchObject({ when: 'By midnight', value: null, dim: 'Not yet' });
  });
});

describe('bars', () => {
  it('month: day ticks give way near now, the end shows its own day, a longer ghost month is cut', () => {
    const m = metrics('2026-10-22T16:10:00+05:30', '2025-01-10T10:00:00+05:30', {
      month: period({
        starts_at: '2026-10-01T00:00:00+05:30',
        previous: { starts_at: '', ends_at: '', totals: totals() },
        chart: { grain: 'day', now_index: 21, current: days('2026-10-01', 31, (i) => (i < 22 ? 100 : 0)), previous: days('2026-08-01', 31, () => 50) },
      }),
    });
    const c = barChart('month', m, 'sales');
    expect(c.ticks.map((t) => t.label)).toEqual(['1', '5', '10', '15', '22', '31']);
    expect(c.ticks.find((t) => t.label === '22')?.now).toBe(true);
    expect(c.slots[22].state).toBe('ahead');
    expect(barReadout('month', c, 21, 'sales')).toMatchObject({ when: 'Thu 22 Oct, so far', before: 'Last month: ₹50' });
    expect(barReadout('month', c, 25, 'sales')).toMatchObject({ value: null, dim: 'Not yet' });

    const shortPrev = { ...m.periods.month, chart: { ...m.periods.month.chart, previous: days('2026-09-01', 30, () => 50) } };
    const cut = barChart('month', { ...m, periods: { ...m.periods, month: shortPrev } }, 'sales');
    expect(cut.slots[30].ghost).toBeNull();
    expect(cut.ghost).toMatch(/H30$/);
  });

  it('year in the first year: months before the first order are left out and said once', () => {
    const months = Array.from({ length: 12 }, (_, i) => bucket(`2026-${String(i + 1).padStart(2, '0')}-01`, { sales: i >= 8 ? 1000 : 0 }));
    const c = barChart('year', metrics('2026-10-22T16:10:00+05:30', FIRST, { year: period({ chart: { grain: 'month', now_index: 9, current: months, previous: null } }) }), 'sales');
    expect(c.slots.map((s) => s.state)).toEqual(['before', 'before', 'before', 'before', 'before', 'before', 'before', 'before', 'past', 'now', 'ahead', 'ahead']);
    expect(c.startedIn).toBe('We started in Sep');
    expect(c.ghost).toBeNull();
    expect(barReadout('year', c, 2, 'sales')).toMatchObject({ when: 'March 2026', dim: 'Before we started' });
  });

  it('lifetime by week labels every 4th Monday and now', () => {
    const weeks = Array.from({ length: 10 }, (_, i) => bucket(new Date(Date.parse('2026-09-21T00:00:00Z') + i * 7 * 86_400_000).toISOString().slice(0, 10)));
    const c = barChart('lifetime', metrics('2026-11-26T12:00:00+05:30', FIRST, { lifetime: period({ chart: { grain: 'week', now_index: 9, current: weeks, previous: null } }) }), 'orders');
    expect(c.ticks.map((t) => t.label)).toEqual(['21 Sep', '19 Oct', '16 Nov', '23 Nov']);
    expect(barReadout('lifetime', c, 0, 'orders')).toMatchObject({ when: 'Week of Mon 21 Sep', value: { figure: '0', words: 'orders' }, before: null });
  });
});

describe('by product', () => {
  it('all three in catalogue order, packs only, the change against the same moment', () => {
    const p = period({
      totals: totals({ packs: 6 }),
      previous: { starts_at: '', ends_at: '', totals: totals() },
      products: [
        { product_id: 'bites', orders: 1, packs: 1, grams: 250, previous: { orders: 0, packs: 0, grams: 0 } },
        { product_id: 'muesli', orders: 0, packs: 0, grams: 0, previous: { orders: 1, packs: 3, grams: 750 } },
        { product_id: 'raggi-jaggi', orders: 2, packs: 5, grams: 1500, previous: { orders: 2, packs: 2, grams: 500 } },
      ],
      chart: flat('hour').chart,
    });
    expect(productRows(p).map((r) => [r.product.id, r.packs, r.share, r.change])).toEqual([
      ['raggi-jaggi', 5, 83, '+3'], ['muesli', 0, 0, '−3'], ['bites', 1, 17, 'new'],
    ]);
    expect(productRows({ ...p, previous: null }).every((r) => r.change === null)).toBe(true);
  });
});
