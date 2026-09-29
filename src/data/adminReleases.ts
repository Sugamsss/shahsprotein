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
    id: '2026-09-28-coupon-kinds',
    for: ['admin'],
    kind: 'new',
    title: 'Coupons can be Repeat or One-time',
    body: 'When you add or edit a coupon, pick Repeat for a standing offer, or One-time for once per phone number.',
  },
  {
    id: '2026-09-28-repeat-coupons-fill-in',
    for: ['admin'],
    kind: 'new',
    title: 'Repeat coupons fill themselves in',
    body: "In Add order, if someone used a Repeat coupon before and it's still on, it fills in for you. Tap Remove if it shouldn't.",
  },
  {
    id: '2026-09-28-one-time-heads-up',
    for: ['admin'],
    kind: 'new',
    title: 'A heads-up on One-time coupons',
    body: 'If a number already used a One-time coupon, a note under it says when. You can still save the order.',
  },
  {
    id: '2026-09-28-prices',
    for: ['admin'],
    kind: 'new',
    title: 'Set your prices on Products',
    body: 'Tap Edit prices on a product to set a price for each pack size. A coupon can have its own price too.',
  },
  {
    id: '2026-09-28-worked-out-total',
    for: ['admin'],
    kind: 'new',
    title: 'Add order works out the total',
    body: 'Once prices are in, the total fills in as you add packs, before delivery. Type your own whenever you like.',
  },
  {
    id: '2026-09-28-part-payments',
    for: ['admin'],
    kind: 'new',
    title: 'Take a part payment',
    body: "On an order, tap Part payment and say how much came in and how. The card shows what's still due.",
  },
  {
    id: '2026-09-28-mark-paid-pays-the-rest',
    for: ['admin'],
    kind: 'new',
    title: 'Mark paid pays the rest',
    body: 'Mark paid now takes whatever is left. To take every payment off, use Mark not paid in the ⋯ menu.',
  },
  {
    id: '2026-09-28-past-customers',
    for: ['admin'],
    kind: 'new',
    title: 'People who ordered before',
    body: 'In Add order, start typing a name. Past customers show up; tap one to fill in their number and pincode.',
  },
  {
    id: '2026-09-26-bank',
    for: ['admin'],
    kind: 'new',
    title: 'Bank is a way to pay',
    body: 'When you mark an order paid, Bank now sits next to UPI, Cash and Other. No note needed.',
  },
  {
    id: '2026-09-26-money-by-method',
    for: ['admin'],
    kind: 'new',
    title: 'See how the money came in',
    body: "On Home, under ₹ came in, this week's money is split into UPI, Cash, Bank and Other.",
  },
  {
    id: '2026-09-26-cards-swipe',
    for: ['cook'],
    kind: 'new',
    title: 'Swipe through What to make',
    body: 'On your phone, the cards under What to make are one row now. Swipe left to see the next product.',
  },
  {
    id: '2026-09-26-top-edge',
    for: ['admin', 'cook'],
    kind: 'fixed',
    title: 'No pale strip at the top',
    body: 'On iPhone, the top of the app now meets the bar with the time. No light band above the page.',
  },
];
