import { describe, expect, it } from 'vitest';
import { adminCopy } from '../../data/adminCopy';
import { formatTime, formatWeight } from '../format';
import { madeOnDay, productName } from '../orders/model';
import type { KitchenHistoryEntry } from '../types';
import { dayHeading, dayOfEntry, groupByDay, historyLine } from './history';

const copy = adminCopy.kitchen;
const RAGGI = 'raggi-jaggi';

const entry = (over: Partial<KitchenHistoryEntry> = {}): KitchenHistoryEntry => ({
  id: 'e1',
  at: '2026-10-10T08:35:00Z', // 14:05 in India
  by: 'u1',
  by_name: 'Pranjali',
  batch_id: 'b1',
  product_id: RAGGI,
  event: 'logged',
  grams: 2000,
  old_grams: null,
  made_on: '2026-10-10',
  old_made_on: null,
  reason: null,
  action_kind: 'log_batches',
  ...over,
});

describe('groupByDay', () => {
  it('groups by the India day, so 00:30 IST is the next day even though UTC says the day before', () => {
    const groups = groupByDay([
      entry({ id: 'a', at: '2026-10-09T19:00:00Z' }), // 00:30 IST, 10 Oct
      entry({ id: 'b', at: '2026-10-09T18:00:00Z' }), // 23:30 IST, 9 Oct
    ]);
    expect(groups.map((g) => g.day)).toEqual(['2026-10-10', '2026-10-09']);
    expect(groups[0].entries.map((e) => e.id)).toEqual(['a']);
    expect(groups[1].entries.map((e) => e.id)).toEqual(['b']);
  });

  it('keeps one day together and keeps the order the server sent (newest first)', () => {
    const groups = groupByDay([
      entry({ id: 'new', at: '2026-10-10T08:00:00Z' }),
      entry({ id: 'old', at: '2026-10-09T19:00:00Z' }),
      entry({ id: 'older', at: '2026-10-09T18:00:00Z' }), // 23:30 IST, 9 Oct
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].entries.map((e) => e.id)).toEqual(['new', 'old']);
    expect(groups[1].entries.map((e) => e.id)).toEqual(['older']);
  });

  it('gives nothing for no entries', () => {
    expect(groupByDay([])).toEqual([]);
  });

  it('reads the day of an entry in India time', () => {
    expect(dayOfEntry('2026-10-09T18:29:59Z')).toBe('2026-10-09'); // 23:59:59 IST
    expect(dayOfEntry('2026-10-09T18:30:00Z')).toBe('2026-10-10'); // midnight IST
  });
});

describe('dayHeading', () => {
  it('says today, yesterday, then the day', () => {
    expect(dayHeading('2026-10-10', '2026-10-10')).toBe(copy.today);
    expect(dayHeading('2026-10-09', '2026-10-10')).toBe(copy.yesterday);
    expect(dayHeading('2026-10-05', '2026-10-10')).toBe(madeOnDay('2026-10-05'));
  });
});

describe('historyLine', () => {
  it('a logged batch: product and weight, then the day it was made, who and when', () => {
    const line = historyLine(entry());
    expect(line.title).toBe(`${productName(RAGGI)} · ${formatWeight(2000)} logged`);
    expect(line.detail).toBe(`made ${madeOnDay('2026-10-10')} · Pranjali · ${formatTime('2026-10-10T08:35:00Z').replace(' ', '\u00a0')}`);
    expect(line.undone).toBe(false);
  });

  it('a change of grams shows the old and new amount', () => {
    const line = historyLine(entry({ event: 'changed', grams: 1500, old_grams: 2000, action_kind: 'update_batch' }));
    expect(line.title).toBe(`${productName(RAGGI)} · changed ${formatWeight(2000)} → ${formatWeight(1500)}`);
  });

  it('a change of day shows the old and new day, and no grams when they stayed', () => {
    const line = historyLine(entry({
      event: 'changed', made_on: '2026-10-09', old_made_on: '2026-10-10', action_kind: 'update_batch',
    }));
    expect(line.title).toBe(`${productName(RAGGI)} · made day ${madeOnDay('2026-10-10')} → ${madeOnDay('2026-10-09')}`);
    expect(line.title).not.toContain('changed');
  });

  it('a change of both shows both', () => {
    const line = historyLine(entry({
      event: 'changed', grams: 1500, old_grams: 2000, made_on: '2026-10-09', old_made_on: '2026-10-10',
    }));
    expect(line.title).toContain(`changed ${formatWeight(2000)} → ${formatWeight(1500)}`);
    expect(line.title).toContain(`made day ${madeOnDay('2026-10-10')} → ${madeOnDay('2026-10-09')}`);
  });

  it('a deleted batch', () => {
    const line = historyLine(entry({ event: 'deleted', grams: 1500, action_kind: 'delete_batch' }));
    expect(line.title).toBe(`${productName(RAGGI)} · ${formatWeight(1500)} deleted`);
  });

  it('used up and thrown out, in the words the owners use', () => {
    expect(historyLine(entry({ event: 'used_up', grams: 200, reason: 'used_up', action_kind: 'write_off' })).title)
      .toBe(`${productName(RAGGI)} · 200 g used up`);
    expect(historyLine(entry({ event: 'thrown_out', grams: 200, reason: 'thrown_out', action_kind: 'write_off' })).title)
      .toBe(`${productName(RAGGI)} · 200 g thrown out`);
  });

  it('a write-off taken back says which reason it had', () => {
    expect(historyLine(entry({ event: 'writeoff_removed', grams: 50, reason: 'thrown_out', action_kind: 'undo' })).title)
      .toBe(`${productName(RAGGI)} · 50 g thrown out taken back`);
  });

  it('an undo is marked, and only an undo', () => {
    expect(historyLine(entry({ action_kind: 'undo' })).undone).toBe(true);
    expect(historyLine(entry({ action_kind: 'write_off' })).undone).toBe(false);
    expect(historyLine(entry({ action_kind: null })).undone).toBe(false);
  });

  it('leaves out a name when there is none, and a day when the line has none', () => {
    const line = historyLine(entry({ by_name: null, made_on: null }));
    expect(line.detail).toBe(formatTime('2026-10-10T08:35:00Z').replace(' ', '\u00a0'));
  });
});
