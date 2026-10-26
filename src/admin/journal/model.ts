import { adminCopy } from '../../data/adminCopy';
import { formatDay, formatLongDate, formatMoney, formatWeight } from '../format';
import type { DayFacts, JournalDay, JournalEntry, JournalMilestone, JournalMonthSummary, Mood, Person, WorkDay } from '../types';

// The journal's pure parts: words for a day, its figures and milestones, the feed with
// each month's summary where the month ends, search highlights and Home's hours and spend.

const copy = adminCopy.journal;

/** Noon India time on a "2026-10-26" day, so any time zone formats it as that day. */
export const dayIso = (day: string): string => `${day}T12:00:00+05:30`;

/** "2026-10-26" + n days, as a day. */
export const addDays = (day: string, n: number): string => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Whole days from `from` to `to` (both "YYYY-MM-DD"). */
export const daysBetween = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** "Today", "Yesterday", else "Saturday, 24 October" (with the year when it isn't this year's). */
export const dayTitle = (day: string, today: string): string => {
  if (day === today) return copy.today;
  if (day === addDays(today, -1)) return copy.yesterday;
  const long = formatLongDate(dayIso(day));
  return day.slice(0, 4) === today.slice(0, 4) ? long : `${long} ${day.slice(0, 4)}`;
};

/** "Sat 24 Oct": a day inside a line. */
export const dayShort = (day: string, today: string): string => formatDay(dayIso(day), Date.parse(dayIso(today)));

export const moodName = (mood: Mood): string => copy.moods[mood - 1];

/** "You" for the caller, else their name. */
export const personName = (person: Person | null, me: string): string =>
  (person && person.id === me ? copy.you : person?.name || copy.someone);

/** The first letter of a name, for the round avatar. */
export const initial = (person: Person | null): string => (person?.name?.trim()[0] ?? '?').toUpperCase();

/** The day's figures that aren't zero, in the order they happen: cooked, packed, delivered, came in, spent. */
export const factParts = (facts: DayFacts): { key: string; text: string; money?: boolean }[] => {
  const parts: { key: string; text: string; money?: boolean }[] = [];
  if (facts.cooked_grams > 0) parts.push({ key: 'cooked', text: copy.facts.cooked(formatWeight(facts.cooked_grams)) });
  if (facts.packed > 0) parts.push({ key: 'packed', text: copy.facts.packed(facts.packed) });
  if (facts.delivered > 0) parts.push({ key: 'delivered', text: copy.facts.delivered(facts.delivered) });
  if (facts.came_in > 0) parts.push({ key: 'came_in', text: copy.facts.cameIn(formatMoney(facts.came_in)), money: true });
  if (facts.spent > 0) parts.push({ key: 'spent', text: copy.facts.spent(formatMoney(facts.spent)) });
  return parts;
};

export const milestoneTitle = (m: JournalMilestone): string => {
  switch (m.kind) {
    case 'launch': return copy.milestone.launch;
    case 'months': return copy.milestone.months(m.value);
    case 'packs': return copy.milestone.packs(m.value);
    case 'returning': return copy.milestone.returning;
    default: return m.title ?? '';
  }
};

/** An entry's quiet line: "Good · 4.5 h · ₹1,240". */
export const entryMeta = (entry: JournalEntry): string[] => {
  const parts: string[] = [];
  if (entry.mood) parts.push(moodName(entry.mood));
  if (entry.hours !== null) parts.push(copy.hours(entry.hours));
  const spent = purchasesTotal(entry);
  if (spent > 0) parts.push(formatMoney(spent));
  return parts;
};

export const purchasesTotal = (entry: Pick<JournalEntry, 'purchases'>): number =>
  entry.purchases.reduce((sum, p) => sum + p.amount, 0);

/** Text split around every match of `query`, any case, for <mark>. */
export const hitParts = (text: string, query: string | null | undefined): { text: string; hit: boolean }[] => {
  const q = (query ?? '').trim().toLowerCase();
  if (!q) return [{ text, hit: false }];
  const parts: { text: string; hit: boolean }[] = [];
  const lower = text.toLowerCase();
  let at = 0;
  for (let i = lower.indexOf(q); i !== -1; i = lower.indexOf(q, at)) {
    if (i > at) parts.push({ text: text.slice(at, i), hit: false });
    parts.push({ text: text.slice(i, i + q.length), hit: true });
    at = i + q.length;
  }
  if (at < text.length) parts.push({ text: text.slice(at), hit: false });
  return parts;
};

/** The start of an entry for a short line: its first sentence, or up to `max` characters at a word. */
export const excerpt = (body: string, max = 140): string => {
  const flat = body.replace(/\s+/g, ' ').trim();
  const sentence = flat.match(/^.+?[.!?](\s|$)/)?.[0]?.trim();
  if (sentence && sentence.length <= max) return sentence;
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[,;:\s]+$/, '')}…`;
};

/**
 * How many months back an "on this day" entry is (the same day of the month), so it can
 * say "A month ago today". 0 when it isn't this day of an earlier month.
 */
export const monthsAgo = (day: string, today: string): number => {
  if (day.slice(8) !== today.slice(8) || day >= today) return 0;
  return (Number(today.slice(0, 4)) - Number(day.slice(0, 4))) * 12 + Number(today.slice(5, 7)) - Number(day.slice(5, 7));
};

/** "October", "October 2025" when it isn't this year. */
export const monthName = (month: string, today: string): string => {
  const name = new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' }).format(new Date(`${month.slice(0, 7)}-01T00:00:00Z`));
  return month.slice(0, 4) === today.slice(0, 4) ? name : `${name} ${month.slice(0, 4)}`;
};

export type FeedItem =
  | { kind: 'day'; day: JournalDay }
  | { kind: 'month'; summary: JournalMonthSummary };

/**
 * The feed, newest first, with each month's summary after its last (earliest) day: once
 * the next day is in an earlier month, or the feed has reached its end.
 */
export const feedItems = (days: JournalDay[], months: JournalMonthSummary[], hasMore: boolean): FeedItem[] => {
  const items: FeedItem[] = [];
  days.forEach((day, i) => {
    items.push({ kind: 'day', day });
    const month = day.day.slice(0, 7);
    const next = days[i + 1];
    const ends = next ? next.day.slice(0, 7) !== month : !hasMore;
    if (!ends) return;
    const summary = months.find((m) => m.month.slice(0, 7) === month);
    if (summary && summary.entries > 0) items.push({ kind: 'month', summary });
  });
  return items;
};

/** Hours and ₹ spent from the journal between two India days, both included (from null: since the start). */
export const workTotals = (days: WorkDay[], from: string | null, to: string): { hours: number; spent: number } =>
  days.reduce((sum, d) => (
    (from === null || d.day >= from) && d.day <= to
      ? { hours: sum.hours + Number(d.hours), spent: sum.spent + Number(d.spent) }
      : sum
  ), { hours: 0, spent: 0 });

/** One entry put back in the days it belongs to (after a save, reply or keep), or dropped (deleted: null). */
export const replaceEntry = (days: JournalDay[], id: string, next: JournalEntry | null): JournalDay[] =>
  days.map((d) => {
    const at = d.entries.findIndex((e) => e.id === id);
    if (at === -1) {
      // A brand-new entry goes on its own day, the caller's first.
      return next && d.day === next.day && !d.entries.some((e) => e.id === next.id)
        ? { ...d, entries: [next, ...d.entries] }
        : d;
    }
    const entries = [...d.entries];
    if (next && next.day === d.day) entries[at] = next;
    else entries.splice(at, 1);
    return { ...d, entries };
  });
