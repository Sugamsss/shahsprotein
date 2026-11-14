import { adminCopy } from '../../data/adminCopy';
import { istDateValue } from '../format';
import { addDays, dayShort } from '../journal/model';
import type { Expense } from '../types';

// Expenses' pure parts: India days and times, the ranges the switch asks for,
// grouping a list into months and days, and the same checks the database makes.

const copy = adminCopy.expenses;

const IST = 'Asia/Kolkata';

/** Whole rupees, nothing more: the database's own ceiling. */
export const AMOUNT_MAX = 2_147_483_647;

/** Nothing was spent before the brand did (the database refuses it too). */
export const DAY_MIN = '2026-01-01';

export type ExpenseRange = 'all' | 'this' | 'last';

/** "2026-11-14" → "2026-11". */
export const monthOf = (day: string): string => day.slice(0, 7);

/** "2026-11" + n months, as a month. */
export const shiftMonth = (month: string, delta: number): string => {
  const [year, m] = month.split('-').map(Number);
  return new Date(Date.UTC(year, m - 1 + delta, 1)).toISOString().slice(0, 7);
};

/** "2026-11" → 30. */
export const daysInMonth = (month: string): number =>
  new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();

/**
 * A month's cells for the calendar, Sunday first: the days as "2026-11-03",
 * with nulls before and after so the grid lines up. Always whole weeks.
 */
export const monthCells = (month: string): (string | null)[] => {
  const lead = new Date(`${month}-01T00:00:00Z`).getUTCDay();
  const cells: (string | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= daysInMonth(month); d += 1) cells.push(`${month}-${String(d).padStart(2, '0')}`);
  while (cells.length % 7) cells.push(null);
  return cells;
};

/** "November", then " November 2025" when it isn't this year's month list. */
export const monthHeading = (month: string, today: string): string => {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'long' }).format(new Date(`${month}-01T00:00:00Z`));
  return month.slice(0, 4) === today.slice(0, 4) ? name : `${name} ${month.slice(0, 4)}`;
};

/** "November 2026": the calendar's own title, always with the year. */
export const monthTitle = (month: string): string =>
  `${new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'long' }).format(new Date(`${month}-01T00:00:00Z`))} ${month.slice(0, 4)}`;

/** India's today, as a day. */
export const istToday = (now: number = Date.now()): string => istDateValue(now);

/** India's clock right now, as "18:05" (24h). */
export const istNowTime = (now: number = Date.now()): string => {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: IST, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(now));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('hour')}:${get('minute')}`;
};

/** "18:05" → "6:05 pm". */
export const timeOfDay12 = (time: string): string => {
  const [hour, minute] = time.split(':').map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'am' : 'pm'}`;
};

export interface Clock {
  /** 1–12 */
  hour: number;
  /** 0–59 */
  minute: number;
  meridiem: 'am' | 'pm';
}

/** "18:05" → { hour: 6, minute: 5, meridiem: 'pm' }. */
export const from24 = (time: string): Clock => {
  const [h, minute] = time.split(':').map(Number);
  return { hour: h % 12 || 12, minute, meridiem: h >= 12 ? 'pm' : 'am' };
};

/** { hour: 6, minute: 5, meridiem: 'pm' } → "18:05". */
export const to24 = ({ hour, minute, meridiem }: Clock): string =>
  `${String((hour % 12) + (meridiem === 'pm' ? 12 : 0)).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

/** True when today's date carries a time that is still ahead of the clock. */
export const timeNotYet = (day: string, time: string, today: string, now: string): boolean => day === today && time > now;

/** The Date field's words: "Today", "Yesterday", else "Fri 13 Nov". */
export const dayFieldLabel = (day: string, today: string): string =>
  day === today ? copy.today : day === addDays(today, -1) ? copy.yesterday : dayShort(day, today);

/** The dates the switch asks the server for: `to` is the first day it leaves out. */
export const rangeFor = (range: ExpenseRange, today: string): { from: string; to: string } => {
  const month = monthOf(today);
  if (range === 'this') return { from: `${month}-01`, to: `${shiftMonth(month, 1)}-01` };
  if (range === 'last') return { from: `${shiftMonth(month, -1)}-01`, to: `${month}-01` };
  return { from: DAY_MIN, to: addDays(today, 1) };
};

export const sumOf = (expenses: Expense[]): number => expenses.reduce((sum, e) => sum + e.amount, 0);

export interface ExpenseDay {
  day: string;
  expenses: Expense[];
  total: number;
}

export interface ExpenseMonth {
  month: string;
  days: ExpenseDay[];
  total: number;
  count: number;
}

/**
 * Months, then days, newest first. It reads the list the server sends already in
 * that order (spent_on desc, spent_at desc); a day never comes back together.
 */
export const groupExpenses = (expenses: Expense[]): ExpenseMonth[] => {
  const months: ExpenseMonth[] = [];
  for (const expense of expenses) {
    const month = monthOf(expense.spent_on);
    let group = months[months.length - 1];
    if (!group || group.month !== month) {
      group = { month, days: [], total: 0, count: 0 };
      months.push(group);
    }
    let day = group.days[group.days.length - 1];
    if (!day || day.day !== expense.spent_on) {
      day = { day: expense.spent_on, expenses: [], total: 0 };
      group.days.push(day);
    }
    day.expenses.push(expense);
    day.total += expense.amount;
    group.total += expense.amount;
    group.count += 1;
  }
  return months;
};

// ---- The same checks the database makes, so the form can say them first ----

export const amountError = (amount: string): string | null => {
  const value = amount.trim();
  if (!value) return copy.amountMissing;
  if (!/^[0-9]+$/.test(value)) return copy.amountWhole;
  const number = Number(value);
  return number >= 1 && number <= AMOUNT_MAX ? null : copy.amountWhole;
};

export const titleError = (title: string): string | null => {
  const value = title.trim();
  if (!value) return copy.titleMissing;
  return value.length > 200 ? copy.titleLong : null;
};

export const noteError = (note: string): string | null => (note.length > 4000 ? copy.noteLong : null);

export const dayError = (day: string, today: string): string | null => {
  if (!day || day < DAY_MIN) return copy.dayBad;
  return day > today ? copy.dayFuture : null;
};

export const timeError = (time: string, day: string, today: string, now: string): string | null => {
  if (!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(time)) return copy.timeBad;
  return timeNotYet(day, time, today, now) ? copy.timeFuture : null;
};
