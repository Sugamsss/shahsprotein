import { adminCopy } from '../data/adminCopy';

// Spec 2.1 "Formats": everything in India time, whatever the viewer's clock says.

const IST = 'Asia/Kolkata';

const partsOf = (date: Date) => {
  // en-US for the short names the spec uses ("Sep", not en-GB/en-IN's "Sept").
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: IST, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    weekday: get('weekday'), day: get('day'), month: get('month'), year: get('year'),
    hour: Number(get('hour')), minute: get('minute'),
  };
};

/** The India calendar day as "2026-09-25", e.g. for a date input. */
export const istDateValue = (value: string | number | Date = Date.now()): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: IST }).format(new Date(value));

/** The last second of an India calendar day: "2026-10-31" → "2026-10-31T23:59:59+05:30". */
export const endOfDayIst = (dateValue: string): string => `${dateValue}T23:59:59+05:30`;

/** Whole India days from `iso` to `now` (0 = the same day, 1 = the day before). */
const daysAgo = (iso: string, now: number): number =>
  Math.round((Date.parse(istDateValue(now)) - Date.parse(istDateValue(iso))) / 86_400_000);

/** "10:42 am" */
export const formatTime = (iso: string): string => {
  const { hour, minute } = partsOf(new Date(iso));
  return `${hour % 12 || 12}:${minute} ${hour < 12 ? 'am' : 'pm'}`;
};

/** "Wed 23 Sep", with the year when it isn't this year: "Wed 23 Sep 2025". */
export const formatDay = (iso: string, now = Date.now()): string => {
  const { weekday, day, month, year } = partsOf(new Date(iso));
  const sameYear = year === partsOf(new Date(now)).year;
  return `${weekday} ${day} ${month}${sameYear ? '' : ` ${year}`}`;
};

/**
 * When something happened, the way a list shows it: "10:42 am" today, then
 * "Yesterday", "Wed 23 Sep" in the last 6 days, "12 Sep" this year, "12 Sep 2025" before.
 */
export const formatWhen = (iso: string, now = Date.now()): string => {
  const ago = daysAgo(iso, now);
  if (ago <= 0) return formatTime(iso);
  if (ago === 1) return adminCopy.dates.yesterday;
  const { weekday, day, month, year } = partsOf(new Date(iso));
  if (ago <= 6) return `${weekday} ${day} ${month}`;
  return year === partsOf(new Date(now)).year ? `${day} ${month}` : `${day} ${month} ${year}`;
};

/** A day inside a sentence: "today", "yesterday", else "Wed 23 Sep" ("last used yesterday"). */
export const formatDayInSentence = (iso: string, now = Date.now()): string => {
  const ago = daysAgo(iso, now);
  if (ago <= 0) return adminCopy.dates.today;
  if (ago === 1) return adminCopy.dates.yesterday.toLowerCase();
  return formatDay(iso, now);
};

/** "₹1,240": whole rupees, Indian grouping. */
export const formatMoney = (amount: number): string => `₹${Math.round(amount).toLocaleString('en-IN')}`;

/** "+91 98231 50764" for an Indian mobile; any other number as "+" and its digits. */
export const formatPhone = (digits: string): string =>
  /^91\d{10}$/.test(digits) ? `+91 ${digits.slice(2, 7)} ${digits.slice(7)}` : `+${digits}`;

/** "Anjali Kulkarni" → "Anjali". */
export const firstName = (name: string | null | undefined): string => (name ?? '').trim().split(/\s+/)[0] ?? '';
