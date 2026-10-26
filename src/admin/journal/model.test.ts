import { describe, expect, it } from 'vitest';
import { adminCopy } from '../../data/adminCopy';
import type { JournalDay, JournalEntry, JournalMonthSummary } from '../types';
import {
  addDays, dayTitle, entryMeta, excerpt, factParts, feedItems, hitParts, milestoneTitle, monthName, monthsAgo,
  personName, replaceEntry, workTotals,
} from './model';

const copy = adminCopy.journal;

const entry = (over: Partial<JournalEntry> = {}): JournalEntry => ({
  id: 'e1', author: { id: 'u1', name: 'Pranjali' }, mine: true, day: '2026-10-25', mood: 4, body: '', hours: null,
  private: false, tags: [], purchases: [], photos: [], replies: [], kept: false, todos: 0,
  created_at: '2026-10-25T15:00:00Z', updated_at: '2026-10-25T15:00:00Z', ...over,
});

const day = (d: string, entries: JournalEntry[] = []): JournalDay => ({
  day: d, facts: { cooked_grams: 0, packed: 0, delivered: 0, came_in: 0, spent: 0, hours: 0 }, entries, done: [], milestones: [],
});

const month = (m: string, entries = 3): JournalMonthSummary => ({ month: m, entries, photos: 0, great_days: 0, hours: 0, spent: 0, lines: [] });

describe('days', () => {
  it('adds days across a month end', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('names today and yesterday, and spells out other days with the year only when it differs', () => {
    expect(dayTitle('2026-10-26', '2026-10-26')).toBe(copy.today);
    expect(dayTitle('2026-10-25', '2026-10-26')).toBe(copy.yesterday);
    expect(dayTitle('2026-10-24', '2026-10-26')).toBe('Saturday, 24 October');
    expect(dayTitle('2025-12-31', '2026-10-26')).toBe('Wednesday, 31 December 2025');
  });

  it('counts months back only on the same day of the month', () => {
    expect(monthsAgo('2026-09-26', '2026-10-26')).toBe(1);
    expect(monthsAgo('2025-10-26', '2026-10-26')).toBe(12);
    expect(monthsAgo('2026-09-25', '2026-10-26')).toBe(0);
    expect(monthsAgo('2026-10-26', '2026-10-26')).toBe(0);
  });

  it('names a month, with the year when it is another year', () => {
    expect(monthName('2026-10-01', '2026-10-26')).toBe('October');
    expect(monthName('2025-12-01', '2026-10-26')).toBe('December 2025');
  });
});

describe('words for a day and an entry', () => {
  it('lists only the figures that happened, in order', () => {
    const parts = factParts({ cooked_grams: 4500, packed: 7, delivered: 0, came_in: 4180, spent: 1420, hours: 9 });
    expect(parts.map((p) => p.text)).toEqual(['4½ kg cooked', '7 packed', '₹4,180 came in', '₹1,420 spent']);
    expect(parts.find((p) => p.key === 'came_in')?.money).toBe(true);
  });

  it('says You for the caller and the name for anyone else', () => {
    expect(personName({ id: 'u1', name: 'Pranjali' }, 'u1')).toBe(copy.you);
    expect(personName({ id: 'u2', name: 'Sunit' }, 'u1')).toBe('Sunit');
    expect(personName(null, 'u1')).toBe(copy.someone);
  });

  it('puts mood, hours and what was spent on the quiet line', () => {
    const e = entry({ mood: 4, hours: 4.5, purchases: [
      { id: 'p1', item: 'Jaggery', amount: 480, ingredient_id: null, quantity: null },
      { id: 'p2', item: 'Ragi', amount: 760, ingredient_id: null, quantity: null },
    ] });
    expect(entryMeta(e)).toEqual(['Good', '4.5 h', '₹1,240']);
    expect(entryMeta(entry({ mood: null }))).toEqual([]);
  });

  it('names milestones from the orders, and keeps hand-marked titles', () => {
    expect(milestoneTitle({ id: null, kind: 'launch', value: 0, title: null })).toBe('Launch day');
    expect(milestoneTitle({ id: null, kind: 'months', value: 1, title: null })).toBe('One month since launch');
    expect(milestoneTitle({ id: null, kind: 'months', value: 12, title: null })).toBe('One year since launch');
    expect(milestoneTitle({ id: null, kind: 'months', value: 5, title: null })).toBe('5 months since launch');
    expect(milestoneTitle({ id: null, kind: 'packs', value: 1000, title: null })).toBe('1,000 packs sold');
    expect(milestoneTitle({ id: 'm1', kind: 'hand', value: 0, title: 'First stall' })).toBe('First stall');
  });

  it('cuts an entry at its first sentence, or at a word', () => {
    expect(excerpt('Roasted it longer. The bitterness is gone.')).toBe('Roasted it longer.');
    expect(excerpt('no full stop here at all', 12)).toBe('no full stop…');
    expect(excerpt('  short  ')).toBe('short');
  });
});

describe('search highlights', () => {
  it('marks every match, any case', () => {
    expect(hitParts('Dates ran out. Buy dates.', 'dates')).toEqual([
      { text: 'Dates', hit: true }, { text: ' ran out. Buy ', hit: false }, { text: 'dates', hit: true }, { text: '.', hit: false },
    ]);
  });
  it('leaves text alone without a query', () => {
    expect(hitParts('Hello', '  ')).toEqual([{ text: 'Hello', hit: false }]);
  });
});

describe('feedItems', () => {
  const days = [day('2026-10-26'), day('2026-10-02'), day('2026-09-30'), day('2026-09-23')];
  const months = [month('2026-10-01'), month('2026-09-01')];

  it('puts a month summary after its earliest day, once the feed moves to an earlier month', () => {
    const items = feedItems(days, months, true);
    expect(items.map((i) => (i.kind === 'day' ? i.day.day : `month ${i.summary.month}`))).toEqual([
      '2026-10-26', '2026-10-02', 'month 2026-10-01', '2026-09-30', '2026-09-23',
    ]);
  });

  it('closes the last month only when there are no older days to load', () => {
    const items = feedItems(days, months, false);
    expect(items[items.length - 1]).toEqual({ kind: 'month', summary: months[1] });
  });

  it('skips a month with nothing the caller can read', () => {
    const items = feedItems(days, [month('2026-10-01', 0)], false);
    expect(items.every((i) => i.kind === 'day')).toBe(true);
  });
});

describe('workTotals', () => {
  it('adds hours and spend between two days, both included', () => {
    const work = [
      { day: '2026-10-18', hours: 5, spent: 100 },
      { day: '2026-10-19', hours: 4.5, spent: 1240 },
      { day: '2026-10-25', hours: 5, spent: 180 },
    ];
    expect(workTotals(work, '2026-10-19', '2026-10-25')).toEqual({ hours: 9.5, spent: 1420 });
    expect(workTotals(work, null, '2026-10-25')).toEqual({ hours: 14.5, spent: 1520 });
  });
});

describe('replaceEntry', () => {
  it('swaps a saved entry in place, drops a deleted one, and adds a new one to its day first', () => {
    const a = entry({ id: 'a', day: '2026-10-25' });
    const b = entry({ id: 'b', day: '2026-10-25', mine: false });
    const days = [day('2026-10-26'), day('2026-10-25', [a, b])];
    expect(replaceEntry(days, 'a', { ...a, body: 'new' })[1].entries[0].body).toBe('new');
    expect(replaceEntry(days, 'a', null)[1].entries.map((e) => e.id)).toEqual(['b']);
    const fresh = entry({ id: 'c', day: '2026-10-26' });
    expect(replaceEntry(days, 'c', fresh)[0].entries.map((e) => e.id)).toEqual(['c']);
  });
});
