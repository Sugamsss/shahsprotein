import { adminCopy } from '../../data/adminCopy';
import { formatTime, formatWeight, istDateValue } from '../format';
import { madeOnDay, productName } from '../orders/model';
import type { KitchenHistoryEntry } from '../types';
import { shiftDay } from './model';

// The cooking history's pure logic: which India day a line falls on, its heading, and
// the words for what happened. The screens (CookingHistoryPage, BatchHistory) only lay these out.

const copy = adminCopy.kitchen;
const words = copy.history;

/** Where the cooking history lives. Logged this week and More link to it. */
export const HISTORY_PATH = '/admin/kitchen/history';

/** The India day an entry was saved on, as YYYY-MM-DD. */
export const dayOfEntry = (at: string): string => istDateValue(at);

export interface HistoryDay { day: string; entries: KitchenHistoryEntry[] }

/**
 * Consecutive entries grouped by the India day they were saved on. Keeps the order
 * they came in (newest first from the server), so a day's entries stay together.
 */
export const groupByDay = (entries: KitchenHistoryEntry[]): HistoryDay[] => {
  const groups: HistoryDay[] = [];
  for (const entry of entries) {
    const day = dayOfEntry(entry.at);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.entries.push(entry);
    else groups.push({ day, entries: [entry] });
  }
  return groups;
};

/** A day's heading: "Today", "Yesterday", or the day as the admin writes it ("Tue 7 Oct"). */
export const dayHeading = (day: string, today: string = istDateValue()): string => {
  if (day === today) return copy.today;
  if (day === shiftDay(today, -1)) return copy.yesterday;
  return madeOnDay(day);
};

export interface HistoryLine {
  /** What happened: "Raggi Jaggi · 2 kg logged". */
  title: string;
  /** Who and when, and the day it was made: "made Tue 7 Oct · Pranjali · 2:05 pm". */
  detail: string;
  /** Put back by an Undo (a quiet "Undo" label). */
  undone: boolean;
}

/** One entry in the owners' words. Names come from display_name only, so an entry with no name just leaves it out. */
export const historyLine = (e: KitchenHistoryEntry): HistoryLine => {
  const product = productName(e.product_id);
  const weight = formatWeight(e.grams);
  let title: string;
  switch (e.event) {
    case 'logged':
      title = words.logged(product, weight);
      break;
    case 'deleted':
      title = words.deleted(product, weight);
      break;
    case 'used_up':
      title = words.writtenOff(product, weight, words.reasons.used_up);
      break;
    case 'thrown_out':
      title = words.writtenOff(product, weight, words.reasons.thrown_out);
      break;
    case 'writeoff_removed':
      title = words.takenBack(product, weight, words.reasons[e.reason ?? 'used_up']);
      break;
    case 'changed': {
      const parts: string[] = [];
      if (e.old_grams !== null) parts.push(words.changedGrams(formatWeight(e.old_grams), weight));
      if (e.old_made_on !== null && e.made_on !== null) {
        parts.push(words.changedDay(madeOnDay(e.old_made_on), madeOnDay(e.made_on)));
      }
      title = [product, ...parts].join(' · ');
      break;
    }
  }

  const made = e.made_on ? words.madeOn(madeOnDay(e.made_on)) : null;
  // A no-break space keeps "9:05 am" on one line on a phone.
  const detail = [made, e.by_name, formatTime(e.at).replace(' ', '\u00a0')].filter(Boolean).join(' · ');
  return { title, detail, undone: e.action_kind === 'undo' };
};
