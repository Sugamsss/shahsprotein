// Every word the admin shows, in one place (the admin's own siteConfig).
// Only admin code imports this, so it ships in the admin chunk.
// Voice: plain, warm, short. Sentence case, no exclamation marks, no dashboard
// words. See temp/admin-rebuild/design/direction.md.

export const adminCopy = {
  brand: "Shah's Nutrition",
  skipLink: 'Skip to content',

  nav: {
    label: 'Admin',
    home: 'Home',
    orders: 'Orders',
    products: 'Products',
    customers: 'Customers',
    coupons: 'Coupons',
    emailList: 'Email list',
    more: 'More',
    settings: 'Settings',
    toConfirm: (n: number) => `${n} ${n === 1 ? 'order' : 'orders'} to confirm`,
  },

  header: {
    find: 'Find an order',
    findLabel: 'Find an order by code, name or phone',
    addOrder: 'Add order',
    accountMenu: 'Settings and sign out',
    signedInAs: 'Signed in as',
  },

  appearance: { label: 'Appearance' },

  more: {
    title: 'More',
    coupons: ['Coupons', 'Codes, on or off, how often used'],
    emailList: ['Email list', 'Sign-ups and a CSV'],
    exportOrders: ['Export orders', 'CSV for a sheet'],
    settings: ['Settings', 'Access, appearance, sign out'],
    exportSoon: 'The orders CSV comes with the Orders screen.',
    footer: "Shah's Nutrition admin",
  },

  signOut: 'Sign out',
  toast: {
    undo: 'Undo',
    undone: 'Undone.',
    retry: 'Try again',
    failed: "That didn't save. Check your connection and try again.",
  },
  /** AdminSheet's close button. */
  close: 'Close',

  login: {
    title: 'Sign in',
    sub: 'For Pranjali and Sunit.',
    email: 'Email',
    password: 'Password',
    submit: 'Sign in',
    busy: 'Signing in…',
    wrong: "That email and password don't match. Try again, or ask Pranjali to reset it.",
    missing: 'Type your email and password.',
    back: 'Back to the website',
  },

  gate: {
    loading: 'Opening the admin…',
    noAccess: "This account can't open the admin. Ask Pranjali to add you.",
    offline: "We couldn't reach the admin. Check your connection and try again.",
    retry: 'Try again',
    notSetUp: "The admin isn't set up here. It needs the Supabase URL and key.",
  },

  errors: {
    network: "That didn't go through. Check your connection and try again.",
    rate: 'Too many tries. Wait a minute, then try again.',
    unauthorized: "This account can't open the admin. Ask Pranjali to add you.",
    unknown: 'Something went wrong. Please try again.',
  },

  stub: 'Coming next.',
  home: {
    greeting: (name: string) => `Hello, ${name}`,
    waiting: (n: number) => (n === 0 ? 'Nothing waiting to confirm.' : `${n} ${n === 1 ? 'order' : 'orders'} to confirm.`),
  },
  pages: {
    orders: 'Orders',
    newOrder: 'Add an order',
    products: 'Products',
    customers: 'Customers',
    customer: 'Customer',
    coupons: 'Coupons',
    emailList: 'Email list',
    settings: 'Settings',
  },

  // ---- Lane A: shared states and screens (spec 2.3, 2.9) ----
  loading: 'Loading',
  loadError: "Couldn't load this. Check your connection, then try again.",
  undo: 'Undo',
  dates: { today: 'today', yesterday: 'Yesterday' },

  products: {
    title: 'Products',
    intro: 'Turn a pack off and the site shows “Back soon” instead of Add.',
    on: 'On the site',
    off: 'Shows “Back soon”',
    switchLabel: (item: string) => `${item} on the site`,
    turnedOff: (item: string) => `${item} now shows “Back soon” on the site.`,
    turnedOn: (item: string) => `${item} is back on the site.`,
  },

  coupons: {
    title: 'Coupons',
    add: 'New coupon',
    intro: 'People type these in the order popup. The site only ever shows the description, never an amount.',
    empty: 'No coupons yet. Make one to share with friends and family.',
    on: 'On',
    off: 'Off',
    ended: 'Ended',
    switchLabel: (code: string) => `${code} can be used`,
    used: (n: number, when: string | null) => `${n} ${n === 1 ? 'order' : 'orders'}${when ? ` · last used ${when}` : ''}`,
    notUsed: 'Not used yet',
    ends: (day: string) => `Ends ${day}`,
    endedOn: (day: string) => `Ended ${day}`,
    noEnd: 'No end date',
    edit: 'Edit',
    editLabel: (code: string) => `Edit ${code}`,
    turnedOff: (code: string) => `${code} is off. People can't use it now.`,
    turnedOn: (code: string) => `${code} is on again.`,
    saved: 'Coupon saved.',
    sheetNew: 'New coupon',
    sheetEdit: 'Edit coupon',
    code: 'Code',
    codeHint: "Letters and numbers. You can't rename it later.",
    codeInvalid: 'Use 3 to 24 letters, numbers or hyphens.',
    gives: 'What it gives',
    givesHint: 'Shown in the popup when the code works. No ₹ amounts.',
    givesMissing: 'Say what the code gives, like 10% off your order.',
    endsOn: 'Ends on',
    optional: 'optional',
    note: 'Note',
    noteOnlyYou: 'only you',
    notePlaceholder: 'Like: 2 packs or more',
    save: 'Save coupon',
    saving: 'Saving…',
  },
};
