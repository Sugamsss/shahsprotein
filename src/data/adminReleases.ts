// The admin's "What's new" notes (temp/changelog-brief.md). Newest first.
//
// Write a note in the same PR as the change, in the owners' own words: "you",
// which button, what happens. Small fixes get no note. Each note says who it's
// for by Home ('admin' is Sunit's full Home, 'cook' is Pranjali's), never by name.
//
// An id is 'YYYY-MM-DD-slug' and never changes once shipped: "seen" is stored as
// the newest id someone has seen, on the server. Only admin code imports this.

export type NoteReader = 'admin' | 'cook';

export interface AdminRelease {
  id: string;
  for: NoteReader[];
  /** A quiet "New ·" or "Fixed ·" label; none when neither fits. */
  kind?: 'new' | 'fixed';
  /** Up to 48 characters. */
  title: string;
  /** Up to 220 characters. One or two plain sentences. */
  body: string;
}

export const adminReleases: AdminRelease[] = [
  {
    id: '2026-09-29-updates-install-themselves',
    for: ['admin', 'cook'],
    kind: 'new',
    title: 'Updates install by themselves',
    body: "When something changes, the app refreshes itself at a quiet moment, never while you're typing an order. Then this shows you what's new.",
  },
  {
    id: '2026-09-28-repeat-coupons',
    for: ['admin'],
    kind: 'new',
    title: 'Repeat coupons fill in for you',
    body: "In Add order, if their last order had a Repeat coupon that's still on, it fills in by itself. Tap Remove if it shouldn't apply.",
  },
  {
    id: '2026-09-28-prices',
    for: ['admin'],
    kind: 'new',
    title: 'Totals work themselves out',
    body: 'Set your prices on Products with Edit prices. Add order then works out the total from the packs and the coupon. You can still type your own.',
  },
  {
    id: '2026-09-28-part-payments',
    for: ['admin'],
    kind: 'new',
    title: 'Part payments',
    body: "Money coming in bits? On the order, tap Part payment each time. It shows what's paid and what's still due, and Mark paid pays the rest.",
  },
  {
    id: '2026-09-28-past-customers',
    for: ['admin'],
    kind: 'new',
    title: 'Past customers under Name',
    body: 'In Add order, start typing a name and people who ordered before show up. Tap one to fill in their number and pincode.',
  },
];
