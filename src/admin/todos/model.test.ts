import { describe, expect, it } from 'vitest';
import type { Todo } from '../types';
import { dueChoiceOf, dueOf, inTab, sortOpen, tabCounts, whoLine } from './model';

const ME = 'u1';
const P1 = { id: 'u1', name: 'Pranjali' };
const P2 = { id: 'u2', name: 'Sunit' };

const todo = (over: Partial<Todo> = {}): Todo => ({
  id: 't', text: 'Buy jaggery', assignee: null, due_on: null, done_at: null, done_by: null, created_by: P1,
  created_at: '2026-10-20T10:00:00Z', entry: null, ingredient: null, deleted: false, ...over,
});

describe('tabs', () => {
  it('mine is for me or either; theirs is for anyone else or either', () => {
    const mine = todo({ assignee: P1 });
    const theirs = todo({ assignee: P2 });
    const either = todo();
    expect([mine, theirs, either].map((t) => inTab(t, 'mine', ME))).toEqual([true, false, true]);
    expect([mine, theirs, either].map((t) => inTab(t, 'theirs', ME))).toEqual([false, true, true]);
    expect(tabCounts([mine, theirs, either, todo({ done_at: '2026-10-25T10:00:00Z' })], ME)).toEqual({ mine: 2, theirs: 2, all: 3 });
  });
});

describe('dueOf', () => {
  const today = '2026-10-26';
  it('says late, today, tomorrow or by a day', () => {
    expect(dueOf({ due_on: '2026-10-24' }, today)).toEqual({ state: 'late', text: '2 days late' });
    expect(dueOf({ due_on: '2026-10-25' }, today)).toEqual({ state: 'late', text: '1 day late' });
    expect(dueOf({ due_on: today }, today)).toEqual({ state: 'today', text: 'Due today' });
    expect(dueOf({ due_on: '2026-10-27' }, today)).toEqual({ state: 'soon', text: 'By tomorrow' });
    expect(dueOf({ due_on: '2026-10-28' }, today)).toEqual({ state: 'soon', text: 'By Wed 28 Oct' });
    expect(dueOf({ due_on: '2026-11-20' }, today).state).toBe('later');
    expect(dueOf({ due_on: null }, today)).toEqual({ state: 'none', text: null });
  });

  it("knows the sheet's choice for a day", () => {
    expect(dueChoiceOf(null, today)).toBe('none');
    expect(dueChoiceOf(today, today)).toBe('today');
    expect(dueChoiceOf('2026-10-27', today)).toBe('tomorrow');
    expect(dueChoiceOf('2026-10-30', today)).toBe('pick');
  });
});

describe('sortOpen', () => {
  it('puts days first, soonest (most late) first, then those with no day, oldest first', () => {
    const list = sortOpen([
      todo({ id: 'none-new', created_at: '2026-10-25T00:00:00Z' }),
      todo({ id: 'later', due_on: '2026-11-01' }),
      todo({ id: 'late', due_on: '2026-10-20' }),
      todo({ id: 'none-old', created_at: '2026-10-01T00:00:00Z' }),
    ]);
    expect(list.map((t) => t.id)).toEqual(['late', 'later', 'none-old', 'none-new']);
  });
});

describe('whoLine', () => {
  it('says who it is for and who asked, from where the caller stands', () => {
    expect(whoLine(todo({ assignee: P2, created_by: P1 }), ME)).toBe('For Sunit, from you');
    expect(whoLine(todo({ assignee: P1, created_by: P2 }), ME)).toBe('For you, from Sunit');
    expect(whoLine(todo({ assignee: P1, created_by: P1 }), ME)).toBe('You added');
    expect(whoLine(todo({ assignee: P2, created_by: P2 }), ME)).toBe('Sunit added');
    expect(whoLine(todo({ assignee: null, created_by: P1 }), ME)).toBe('Either of you');
    expect(whoLine(todo({ assignee: null, created_by: P2 }), ME)).toBe('Either of you, from Sunit');
  });
});
