import { describe, expect, it } from 'vitest';
import { endOfDayIst, firstName, formatAge, formatAgo, formatDay, formatDayInSentence, formatLongDate, istHour, formatMoney, formatPhone, formatWhen, istDateValue } from './format';

// Spec 2.1 "Formats". Every date is India time, so these hold whatever
// timezone the machine running them is in. "Now" is Fri 25 Sep 2026, 2:00 pm IST.
const now = Date.parse('2026-09-25T14:00:00+05:30');

describe('formatWhen', () => {
  it.each([
    ['2026-09-25T10:42:00+05:30', '10:42 am'],
    ['2026-09-25T00:05:00+05:30', '12:05 am'], // 18:35 UTC the day before, still today in India
    ['2026-09-24T21:10:00+05:30', 'Yesterday'],
    ['2026-09-23T09:00:00+05:30', 'Wed 23 Sep'],
    ['2026-09-19T09:00:00+05:30', 'Sat 19 Sep'], // 6 days ago
    ['2026-09-12T09:00:00+05:30', '12 Sep'],
    ['2025-09-12T09:00:00+05:30', '12 Sep 2025'],
  ])('%s → %s', (iso, expected) => {
    expect(formatWhen(iso, now)).toBe(expected);
  });

  it('shows pm times in 12-hour form', () => {
    expect(formatWhen('2026-09-25T13:05:00+05:30', now)).toBe('1:05 pm');
  });

  it('draws the day line at midnight in India, not in UTC', () => {
    const justAfterMidnight = Date.parse('2026-09-25T00:10:00+05:30'); // 18:40 UTC on the 24th
    expect(formatWhen('2026-09-24T23:50:00+05:30', justAfterMidnight)).toBe('Yesterday');
    expect(formatWhen('2026-09-25T00:01:00+05:30', justAfterMidnight)).toBe('12:01 am');
  });

  it('says Yesterday across a month boundary', () => {
    expect(formatWhen('2026-09-30T20:00:00+05:30', Date.parse('2026-10-01T09:00:00+05:30'))).toBe('Yesterday');
  });

  it('shows the weekday up to 6 days back, then the plain date', () => {
    expect(formatWhen('2026-09-19T23:59:00+05:30', now)).toBe('Sat 19 Sep');
    expect(formatWhen('2026-09-18T23:59:00+05:30', now)).toBe('18 Sep');
  });

  it('adds the year once it is last year, even a few days ago', () => {
    const newYear = Date.parse('2027-01-02T10:00:00+05:30');
    expect(formatWhen('2026-12-31T10:00:00+05:30', newYear)).toBe('Thu 31 Dec');
    expect(formatWhen('2026-12-20T10:00:00+05:30', newYear)).toBe('20 Dec 2026');
  });
});

describe('formatAgo and formatAge (a stale order: "Sent from the site 5 days ago")', () => {
  it.each([
    ['2026-09-23T09:00:00+05:30', '2 days ago', '2 days'],
    ['2026-09-20T23:59:00+05:30', '5 days ago', '5 days'],
    ['2026-09-19T09:00:00+05:30', '6 days ago', '6 days'],
    ['2026-09-18T09:00:00+05:30', 'a week ago', 'a week'],
    ['2026-09-12T09:00:00+05:30', 'a week ago', 'a week'], // 13 days
    ['2026-09-11T09:00:00+05:30', '2 weeks ago', '2 weeks'],
    ['2026-08-27T09:00:00+05:30', '4 weeks ago', '4 weeks'], // 29 days
    ['2026-08-26T09:00:00+05:30', 'a month ago', 'a month'],
    ['2026-06-20T09:00:00+05:30', '3 months ago', '3 months'],
  ])('%s → %s', (iso, ago, age) => {
    expect(formatAgo(iso, now)).toBe(ago);
    expect(formatAge(iso, now)).toBe(age);
  });

  it('counts India days, and never says less than a day', () => {
    // 23:50 IST on the 23rd is 18:20 UTC: two India days before the 25th, not one.
    expect(formatAgo('2026-09-23T23:50:00+05:30', now)).toBe('2 days ago');
    expect(formatAge('2026-09-25T10:00:00+05:30', now)).toBe('1 day');
  });
});

describe('formatDay', () => {
  it('adds the year only when it is not this year', () => {
    expect(formatDay('2026-11-30T23:59:59+05:30', now)).toBe('Mon 30 Nov');
    expect(formatDay('2027-01-04T10:00:00+05:30', now)).toBe('Mon 4 Jan 2027');
  });
});

describe('formatDayInSentence', () => {
  it('reads inside a sentence', () => {
    expect(formatDayInSentence('2026-09-25T08:00:00+05:30', now)).toBe('today');
    expect(formatDayInSentence('2026-09-24T08:00:00+05:30', now)).toBe('yesterday');
    expect(formatDayInSentence('2026-09-21T08:00:00+05:30', now)).toBe('Mon 21 Sep');
  });
});

describe('Home: the hour and the long date in India', () => {
  it('uses India time, not the machine clock', () => {
    expect(istHour(Date.parse('2026-09-25T06:29:00Z'))).toBe(11); // 11:59 am IST
    expect(istHour(Date.parse('2026-09-25T06:30:00Z'))).toBe(12);
    expect(istHour(Date.parse('2026-09-24T18:40:00Z'))).toBe(0); // just after midnight on the 25th
    expect(formatLongDate(Date.parse('2026-09-24T18:40:00Z'))).toBe('Friday, 25 September');
  });
});

describe('coupon end dates (India end of day)', () => {
  it('turns a picked day into its last second in India, and back', () => {
    const end = endOfDayIst('2026-10-31');
    expect(end).toBe('2026-10-31T23:59:59+05:30');
    expect(istDateValue(end)).toBe('2026-10-31');
    // 18:29:59 UTC: the same instant, still the 31st in India.
    expect(istDateValue('2026-10-31T18:29:59Z')).toBe('2026-10-31');
  });
});

describe('money, phone and names', () => {
  it('formats as the spec shows', () => {
    expect(formatMoney(0)).toBe('₹0');
    expect(formatMoney(1240)).toBe('₹1,240');
    expect(formatMoney(125000)).toBe('₹1,25,000');
    expect(formatPhone('919800000001')).toBe('+91 98000 00001');
    expect(formatPhone('447700900123')).toBe('+447700900123');
    expect(firstName('  Anjali   Kulkarni ')).toBe('Anjali');
    expect(firstName(null)).toBe('');
  });
});
