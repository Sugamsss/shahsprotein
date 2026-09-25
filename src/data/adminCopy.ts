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
};
