import type { AdminRelease, NoteReader } from '../../data/adminReleases';

// Which "What's new" notes someone sees. Pure; the list is passed in, newest first.

/** Someone who has never seen a note gets only the newest few, not the whole history. */
export const FIRST_NOTES = 3;

/** "2026-09-29" from "2026-09-29-part-payments"; null when an id has no date. */
const dayOf = (id: string): string | null => /^\d{4}-\d{2}-\d{2}(?=-)/.exec(id)?.[0] ?? null;

/**
 * The notes for this reader that are newer than `lastSeen`, newest first. Every
 * update they skipped is in there. A `lastSeen` that's no longer in the list
 * (a note taken out) counts by its date; one with no date, or none at all, gets
 * the newest few.
 */
export const notesFor = (notes: AdminRelease[], reader: NoteReader, lastSeen: string | null): AdminRelease[] => {
  const theirs = (list: AdminRelease[]) => list.filter((note) => note.for.includes(reader));
  if (lastSeen) {
    const at = notes.findIndex((note) => note.id === lastSeen);
    if (at >= 0) return theirs(notes.slice(0, at));
    const seenDay = dayOf(lastSeen);
    if (seenDay) return theirs(notes.filter((note) => (dayOf(note.id) ?? '') > seenDay));
  }
  return theirs(notes).slice(0, FIRST_NOTES);
};

/**
 * The newer of two "last seen" ids: the server's and this device's. The device
 * keeps its own copy, so a save that failed, or a database without the
 * migration yet, never brings dismissed notes back.
 */
export const newerSeen = (notes: AdminRelease[], a: string | null, b: string | null): string | null => {
  if (!a || !b) return a || b || null;
  const dayA = dayOf(a) ?? '';
  const dayB = dayOf(b) ?? '';
  if (dayA !== dayB) return dayA > dayB ? a : b;
  const atA = notes.findIndex((note) => note.id === a);
  const atB = notes.findIndex((note) => note.id === b);
  if (atA < 0) return b;
  if (atB < 0) return a;
  return atA <= atB ? a : b;
};
