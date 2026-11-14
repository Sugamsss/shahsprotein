import { describe, expect, it } from 'vitest';
import type { Expense } from '../types';
import {
  amountError, dayError, dayFieldLabel, daysInMonth, from24, groupExpenses, istNowTime, istToday, monthCells,
  monthHeading, monthOf, monthTitle, noteError, rangeFor, shiftMonth, sumOf, timeError, timeNotYet, timeOfDay12,
  titleError, to24,
} from './model';

const TODAY = '2026-11-14';

const expense = (over: Partial<Expense> = {}): Expense => ({
  id: 'e', spent_on: TODAY, spent_at: '09:40', title: 'Zip pouches', note: '', amount: 3200,
  created_at: '2026-11-14T04:10:00Z', updated_at: '2026-11-14T04:10:00Z', ...over,
});

describe('India days and months', () => {
  it('makes months and their days', () => {
    expect(monthOf('2026-11-14')).toBe('2026-11');
    expect(shiftMonth('2026-11', 1)).toBe('2026-12');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(daysInMonth('2026-11')).toBe(30);
    expect(daysInMonth('2028-02')).toBe(29); // a leap year
  });

  it('lays a month out Sunday first, in whole weeks', () => {
    const cells = monthCells('2026-11'); // 1 November 2026 is a Sunday
    expect(cells).toHaveLength(35);
    expect(cells[0]).toBe('2026-11-01');
    expect(cells[29]).toBe('2026-11-30');
    expect(cells.slice(30)).toEqual([null, null, null, null, null]);

    const march = monthCells('2026-03'); // 1 March 2026 is a Sunday too
    expect(march[0]).toBe('2026-03-01');
    expect(monthCells('2026-04')[0]).toBeNull(); // 1 April 2026 is a Wednesday
    expect(monthCells('2026-04')[3]).toBe('2026-04-01');
  });

  it('names a month with the year only when it is not this year', () => {
    expect(monthHeading('2026-11', TODAY)).toBe('November');
    expect(monthHeading('2025-12', TODAY)).toBe('December 2025');
    expect(monthTitle('2026-11')).toBe('November 2026');
  });

  it('takes India today, not the device day', () => {
    expect(istToday(Date.parse('2026-11-13T18:00:00Z'))).toBe('2026-11-13');
    expect(istToday(Date.parse('2026-11-13T19:00:00Z'))).toBe('2026-11-14'); // 00:30 IST
  });
});

describe('India time', () => {
  it('reads the clock in India', () => {
    expect(istNowTime(Date.parse('2026-11-14T12:35:00Z'))).toBe('18:05');
    expect(istNowTime(Date.parse('2026-11-14T00:05:00Z'))).toBe('05:35');
  });

  it('writes a time the way the row does', () => {
    expect(timeOfDay12('18:05')).toBe('6:05 pm');
    expect(timeOfDay12('00:00')).toBe('12:00 am');
    expect(timeOfDay12('12:00')).toBe('12:00 pm');
    expect(timeOfDay12('09:40')).toBe('9:40 am');
  });

  it('splits and joins 12h and 24h', () => {
    expect(from24('18:05')).toEqual({ hour: 6, minute: 5, meridiem: 'pm' });
    expect(from24('00:00')).toEqual({ hour: 12, minute: 0, meridiem: 'am' });
    expect(from24('12:30')).toEqual({ hour: 12, minute: 30, meridiem: 'pm' });
    expect(to24({ hour: 6, minute: 5, meridiem: 'pm' })).toBe('18:05');
    expect(to24({ hour: 12, minute: 0, meridiem: 'am' })).toBe('00:00');
    expect(to24({ hour: 12, minute: 0, meridiem: 'pm' })).toBe('12:00');
  });

  it('knows a time that has not happened yet today, and only today', () => {
    expect(timeNotYet(TODAY, '18:06', TODAY, '18:05')).toBe(true);
    expect(timeNotYet(TODAY, '18:05', TODAY, '18:05')).toBe(false);
    expect(timeNotYet('2026-11-13', '23:59', TODAY, '08:00')).toBe(false);
  });

  it('names the Date field', () => {
    expect(dayFieldLabel(TODAY, TODAY)).toBe('Today');
    expect(dayFieldLabel('2026-11-13', TODAY)).toBe('Yesterday');
    expect(dayFieldLabel('2026-11-06', TODAY)).toBe('Fri 6 Nov');
    expect(dayFieldLabel('2025-12-31', TODAY)).toBe('Wed 31 Dec 2025');
  });
});

describe('ranges', () => {
  it('asks for all, this month or last, with an exclusive end', () => {
    expect(rangeFor('all', TODAY)).toEqual({ from: '2026-01-01', to: '2026-11-15' });
    expect(rangeFor('this', TODAY)).toEqual({ from: '2026-11-01', to: '2026-12-01' });
    expect(rangeFor('last', TODAY)).toEqual({ from: '2026-10-01', to: '2026-11-01' });
  });
});

describe('grouping', () => {
  const list = [
    expense({ id: 'a', spent_on: '2026-11-14', spent_at: '17:15', amount: 185 }),
    expense({ id: 'b', spent_on: '2026-11-14', spent_at: '09:40', amount: 3200 }),
    expense({ id: 'c', spent_on: '2026-11-13', amount: 2750 }),
    expense({ id: 'd', spent_on: '2026-10-31', amount: 920 }),
  ];

  it('adds a list up', () => {
    expect(sumOf(list)).toBe(7055);
    expect(sumOf([])).toBe(0);
  });

  it('groups into months and days, newest first, with totals', () => {
    const months = groupExpenses(list);
    expect(months.map((m) => m.month)).toEqual(['2026-11', '2026-10']);
    expect(months[0].total).toBe(6135);
    expect(months[0].count).toBe(3);
    expect(months[0].days.map((d) => [d.day, d.total, d.expenses.length])).toEqual([
      ['2026-11-14', 3385, 2],
      ['2026-11-13', 2750, 1],
    ]);
    expect(months[1].days[0].day).toBe('2026-10-31');
  });
});

describe('the checks the database also makes', () => {
  it('wants whole rupees between 1 and 2^31-1', () => {
    expect(amountError('')).toBe('Add an amount first.');
    expect(amountError('   ')).toBe('Add an amount first.');
    expect(amountError('0')).toBe('Just the number, like 500.');
    expect(amountError('12.5')).toBe('Just the number, like 500.');
    expect(amountError('12a')).toBe('Just the number, like 500.');
    expect(amountError('2147483648')).toBe('Just the number, like 500.');
    expect(amountError('1')).toBeNull();
    expect(amountError('2147483647')).toBeNull();
  });

  it('wants a title of 1 to 200 characters, trimmed', () => {
    expect(titleError('')).toBe('Give it a title.');
    expect(titleError('   ')).toBe('Give it a title.');
    expect(titleError('x'.repeat(201))).toBe('Keep the title under 200 characters.');
    expect(titleError(' Zip pouches ')).toBeNull();
  });

  it('keeps the note under 4,000 characters', () => {
    expect(noteError('x'.repeat(4001))).toBe('Keep the note under 4,000 characters.');
    expect(noteError('x'.repeat(4000))).toBeNull();
  });

  it('refuses a day before 2026 or after today', () => {
    expect(dayError('', TODAY)).toBe('That day isn’t one we can use.');
    expect(dayError('2025-12-31', TODAY)).toBe('That day isn’t one we can use.');
    expect(dayError('2026-11-15', TODAY)).toBe('That day hasn’t happened yet.');
    expect(dayError(TODAY, TODAY)).toBeNull();
  });

  it('refuses a made-up time, or one later than now today', () => {
    expect(timeError('24:00', TODAY, TODAY, '08:00')).toBe('Pick a time.');
    expect(timeError('8:05', TODAY, TODAY, '08:00')).toBe('Pick a time.');
    expect(timeError('08:01', TODAY, TODAY, '08:00')).toBe('That time hasn’t happened yet today.');
    expect(timeError('07:59', TODAY, TODAY, '08:00')).toBeNull();
    expect(timeError('23:59', '2026-11-13', TODAY, '08:00')).toBeNull();
  });
});
