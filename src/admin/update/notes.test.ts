import { describe, expect, it } from 'vitest';
import { adminReleases, type AdminRelease } from '../../data/adminReleases';
import { newerSeen, notesFor } from './notes';

const note = (id: string, ...readers: AdminRelease['for']): AdminRelease => ({ id, for: readers, title: id, body: id });

// Newest first, as in adminReleases.
const list = [
  note('2026-10-05-e', 'admin'),
  note('2026-10-03-d', 'cook'),
  note('2026-10-03-c', 'admin', 'cook'),
  note('2026-10-01-b', 'admin'),
  note('2026-09-30-a', 'admin'),
];
const ids = (notes: AdminRelease[]) => notes.map((n) => n.id.slice(11));

describe('adminReleases', () => {
  // "Seen" is stored as an id and compared by position and date, so these keep it working as notes are added.
  it('has unique dated ids, newest first, for a known reader, within the length limits', () => {
    expect(new Set(adminReleases.map((n) => n.id)).size).toBe(adminReleases.length);
    adminReleases.forEach((n, i) => {
      expect(n.id).toMatch(/^\d{4}-\d{2}-\d{2}-[a-z0-9-]{1,60}$/); // what set_admin_notes_seen accepts
      if (i > 0) expect(n.id.slice(0, 10) <= adminReleases[i - 1].id.slice(0, 10)).toBe(true);
      expect(n.for.length).toBeGreaterThan(0);
      n.for.forEach((reader) => expect(['admin', 'cook']).toContain(reader));
      expect(n.title.length).toBeLessThanOrEqual(48);
      expect(n.body.length).toBeLessThanOrEqual(220);
    });
  });
});

describe('notesFor', () => {
  it.each([
    ['everything since, across skipped updates, only theirs', 'admin', '2026-10-01-b', ['e', 'c']],
    ['the cook gets her own', 'cook', '2026-10-01-b', ['d', 'c']],
    ['nothing once the newest is seen', 'admin', '2026-10-05-e', []],
    ['never seen: only the newest few', 'admin', null, ['e', 'c', 'b']],
    ['a seen note that was taken out counts by its date', 'admin', '2026-10-02-gone', ['e', 'c']],
    ['a seen id with no date: the newest few', 'cook', 'nonsense', ['d', 'c']],
  ] as const)('%s', (_, reader, seen, expected) => {
    expect(ids(notesFor(list, reader, seen))).toEqual(expected);
  });
});

describe('newerSeen', () => {
  it('keeps whichever of the server and the device has seen further', () => {
    expect(newerSeen(list, null, '2026-10-01-b')).toBe('2026-10-01-b'); // before the migration, or never saved
    expect(newerSeen(list, '2026-10-03-c', '2026-10-03-d')).toBe('2026-10-03-d'); // same day: list order
    expect(newerSeen(list, '2026-10-02-gone', '2026-10-01-b')).toBe('2026-10-02-gone'); // unknown: by date
  });
});
