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
    id: '2026-10-02-faster-startup',
    for: ['admin', 'cook'],
    kind: 'fixed',
    title: 'Opens faster on your phone',
    body: 'The app starts quicker when you open it from your home screen, with less waiting on mobile networks.',
  },
  {
    id: '2026-10-02-order-bill',
    for: ['admin', 'cook'],
    kind: 'new',
    title: 'A bill when you deliver',
    body: 'Mark an order Delivered and its bill is ready to send on WhatsApp or download. You can open it again from the order.',
  },
  {
    id: '2026-10-01-how-its-going',
    for: ['admin', 'cook'],
    kind: 'new',
    title: 'See how it’s going',
    body: 'Home shows sales, money in, orders and packs for today, this week, month, year or since we started, against the same time before. Tap the chart for a closer look. Profit is an estimate at 25% of sales.',
  },
  {
    id: '2026-09-29-kitchen-stages',
    for: ['admin', 'cook'],
    kind: 'new',
    title: 'Orders follow the kitchen',
    body: 'Orders now go Cooking, Packing, Ready, Delivered. There’s no Confirm step: every order starts in Cooking and moves to Packing by itself once it’s cooked.',
  },
  {
    id: '2026-09-29-log-cooking',
    for: ['cook'],
    kind: 'new',
    title: 'Log what you cooked',
    body: 'Tap Log cooking, top right on Home. It’s filled in with what orders need; change it if you made more or less. Covered orders go to Packing and the rest is kept as spare. Tap Undo if it’s wrong.',
  },
  {
    id: '2026-09-29-spare',
    for: ['cook'],
    kind: 'new',
    title: 'Spare shows the days it has left',
    body: 'Food left over shows on Home with how many days it keeps. When it’s gone, tap it and pick Used up or Thrown out. Nothing is thrown out for you.',
  },
  {
    id: '2026-09-29-one-stage-at-a-time',
    for: ['admin'],
    kind: 'new',
    title: 'Orders, one stage at a time',
    body: 'On your phone, pick a stage at the top of Orders. Each card has one next step: Packed, Delivered or Mark paid. “From the website” marks orders that might not have come through.',
  },
  {
    id: '2026-09-29-priority',
    for: ['admin'],
    kind: 'new',
    title: 'Priority orders go first',
    body: 'Turn on Priority for an order that’s still cooking, and it gets food first. If another order is already packed, you’re asked before its pouch moves over.',
  },
  {
    id: '2026-09-29-free-samples',
    for: ['admin'],
    kind: 'new',
    title: 'Free samples, as a pack size',
    body: 'In Add order, tap + next to Sample under a product. Samples are always free. Every order with one shows in Free samples, under the stages in Orders.',
  },
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
