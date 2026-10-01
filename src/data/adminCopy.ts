// Every word the admin shows, in one place (the admin's own siteConfig).
// Only admin code imports this, so it ships in the admin chunk.
// Voice: plain, warm, short. Sentence case, no exclamation marks, no dashboard
// words. See temp/admin-rebuild/design/direction.md.

/** "Raggi Jaggi", "Raggi Jaggi and Muesli", "Tanvi, Asha and Meera". */
const andList = (items: string[]) =>
  (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

/** Names, then "and 2 more" for the ones not named (the RPC names at most 3, once each). */
const namesAndMore = (names: string[], count: number) =>
  (count > names.length ? `${names.join(', ')} and ${count - names.length} more` : andList(names));

export const adminCopy = {
  brand: "Shah's Nutrition",
  /** The browser tab: "(3) Orders · Shah's". The count is the Orders badge's, shown only above 0. */
  tabTitle: (page: string, badge: number) => `${badge > 0 ? `(${badge}) ` : ''}${page} · Shah's`,
  tabPages: {
    home: 'Home', orders: 'Orders', done: 'Done', newOrder: 'New order', editOrder: 'Edit order', products: 'Products',
    customers: 'Customers', coupons: 'Coupons', emailList: 'Email list', settings: 'Settings', more: 'More', signIn: 'Sign in',
  },
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
    /** The Orders badge, Sunit's only: orders in Packing. */
    toPack: (n: number) => `${n} ${n === 1 ? 'order' : 'orders'} to pack`,
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
  /** The dialog after an update (src/data/adminReleases.ts has the notes). */
  whatsNew: {
    title: "What's new",
    sub: 'Changes since you last looked.',
    /** The box's heading, and the scrolling list's label. */
    box: 'What to try',
    /** Shown only above 3, when the box may scroll. */
    count: (n: number) => `${n} things`,
    gotIt: 'Got it',
    kinds: { new: 'New', fixed: 'Fixed' },
  },

  login: {
    title: 'Sign in',
    sub: 'For Pranjali and Sunit.',
    username: 'Username',
    password: 'Password',
    submit: 'Sign in',
    busy: 'Signing in…',
    wrong: "That username and password don't match.",
    // Shown under the error only after a failed sign-in. Sugam resets passwords with the script.
    forgot: 'Forgot your password? Ask Sugam.',
    missing: 'Type your username and password.',
    back: 'Back to the website',
    sessionEnded: 'You were signed out. Sign in again to carry on.',
  },

  gate: {
    loading: 'Opening the admin…',
    noAccess: "This account can't open the admin. Ask Sugam to add you.",
    offline: "We couldn't reach the admin. Check your connection and try again.",
    retry: 'Try again',
    notSetUp: "The admin isn't set up here. It needs the Supabase URL and key.",
  },

  errors: {
    network: "That didn't go through. Check your connection and try again.",
    rate: 'Too many tries. Wait a minute, then try again.',
    unauthorized: "This account can't open the admin. Ask Sugam to add you.",
    missing: "This isn't set up yet. Ask Sugam.",
    unknown: 'Something went wrong. Please try again.',
  },

  // ---- Lane A: shared states and screens (spec 2.3, 2.9) ----
  loading: 'Loading',
  loadError: "Couldn't load this. Check your connection, then try again.",
  dates: {
    today: 'today',
    yesterday: 'Yesterday',
    // formatAge / formatAgo: "5 days", "a week ago".
    age: {
      days: (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`,
      weeks: (n: number) => (n === 1 ? 'a week' : `${n} weeks`),
      months: (n: number) => (n === 1 ? 'a month' : `${n} months`),
      ago: (age: string) => `${age} ago`,
    },
  },

  products: {
    title: 'Products',
    intro: 'Turn a pack off and the site shows “Back soon” instead of Add.',
    on: 'On the site',
    off: 'Shows “Back soon”',
    switchLabel: (item: string) => `${item} on the site`,
    turnedOff: (item: string) => `${item} now shows “Back soon” on the site.`,
    turnedOn: (item: string) => `${item} is back on the site.`,
    // Prices (admin only): read on the card, set in a sheet per product.
    noPrice: 'No price yet',
    /** Only coupons in use that price at least one of its packs. */
    couponsOwn: (n: number) => `${n} ${n === 1 ? 'coupon has' : 'coupons have'} their own`,
    base: 'Base price',
    couponPrices: 'Coupon prices',
    couponPricesHint: 'Leave one empty and they pay the base price.',
    notInUse: (n: number) => `Not in use · ${n}`,
    couponOff: 'Off',
    couponEnded: (day: string) => `Ended ${day}`,
    baseCell: (item: string) => `${item} base price`,
    couponCell: (item: string, code: string) => `${item} with ${code}`,
    priceError: 'Just the number, like 240.',
    saving: 'Saving…',
  },

  // ---- Lane B: Orders (spec 2.3, 2.5 to 2.7, 2.15, 2.16) ----
  orders: {
    title: 'Orders',
    add: 'Add',
    find: 'Find an order',
    findPlaceholder: 'Code, name or phone',
    cancelFind: 'Cancel',
    /** Short stage names, used on a customer's page ("2 ready"). */
    jump: { cooking: 'Cooking', packing: 'Packing', ready: 'Ready', collect: 'To collect' },
    toPack: 'to pack',
    toDropOff: 'to drop off',
    toCollect: (money: string) => `${money} to collect`,
    doneLink: 'Done',
    doneCount: (n: number) => `Done · ${n}`,
    doneSub: (paid: number, free: number, cancelled: number) =>
      [`${paid} delivered and paid`, free ? `${free} free ${free === 1 ? 'sample' : 'samples'}` : '', `${cancelled} cancelled`].filter(Boolean).join(', '),
    exportCsv: 'Export CSV',
    // Card buttons, then the detail's pinned button.
    next: {
      packing: ['Packed', 'Mark packed'],
      ready: ['Delivered', 'Mark delivered'],
      collect: ['Mark paid', 'Mark paid'],
    },
    allDone: 'All done.',
    deliveredPaid: 'Delivered · Paid',
    deliveredFree: 'Delivered · Free sample',
    /** The only came-via marker left on cards: a website order may never have arrived on WhatsApp. */
    fromWebsite: 'From the website',
    freeSample: 'Free sample',
    noTotalYet: 'No total yet',
    cancelled: 'Cancelled',
    paid: 'Paid',
    /** Some money in, not the whole total. */
    partPaid: 'Part paid',
    notPaid: 'Not paid',
    nthOrder: (n: number) => {
      const end = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
      return `${n}${end} order`;
    },
    via: { site: 'Website', whatsapp: 'WhatsApp', call: 'Phone call', instagram: 'Instagram', in_person: 'In person' },
    open: (name: string, code: string) => `Open ${name}, ${code}`,
    empty: {
      first: 'No orders yet. When someone sends an order from the site, it shows up here with its code.',
      caughtUp: 'All caught up',
      caughtUpBody: 'Nothing is waiting on you. New orders land here the moment someone taps Send on the site.',
      noMatch: (q: string) => `No order matches “${q}”. Check the code in the chat, or add it by hand.`,
      addByHand: 'Add it by hand',
    },
    toasts: {
      cooking: (n: string) => `${n}'s order is back to Cooking`,
      packing: (n: string) => `${n}'s order moved to Packing`,
      ready: (n: string) => `${n}'s order is packed`,
      delivered: (n: string) => `${n}'s order is marked delivered`,
      cancelled: (n: string) => `${n}'s order is cancelled`,
      /** "Neha's order is marked paid · UPI". Undo and old orders have no method. */
      paid: (n: string, how: string | null) => `${n}'s order is marked paid${how ? ` · ${how}` : ''}`,
      unpaid: (n: string) => `${n}'s order is marked not paid`,
      /** Skip the line: fills first from the next batch or spare. */
      priority: (n: string) => `${n}'s order is priority`,
      notPriority: (n: string) => `${n}'s order is back in line`,
      copied: 'Copied.',
      deleted: 'Order deleted.',
    },
  },

  /** Orders, one stage at a time (O1): the stage switcher, each stage's line, the lighter cards. */
  orderStages: {
    switchLabel: 'Stage',
    names: { cooking: 'Cooking', packing: 'Packing', ready: 'Ready', collect: 'To collect' },
    /** One plain line of what to do, under the switcher (and under each lane's name on a laptop). */
    hints: {
      cooking: 'Moves to Packing once it’s all cooked.',
      packing: 'Cooked. Pack it, then tap Packed.',
      ready: 'Packed. Drop it off, then tap Delivered.',
      collect: 'Delivered, not paid in full yet.',
    },
    empty: {
      cooking: 'Nothing cooking. Every order has its food.',
      packing: 'Nothing to pack right now.',
      /** Packing is empty and so is the kitchen. */
      packingAll: 'Nothing to pack, and nothing cooking.',
      ready: 'Nothing to drop off.',
      collect: 'Nothing to collect. Everyone has paid.',
    },
    /** Packing's last row: what's coming, a tap goes to Cooking. */
    nextTitle: 'Next from the kitchen',
    /** "5 orders. Asha’s is nearly ready." */
    nextSub: (orders: number, nearly: string | null) =>
      `${orders} ${orders === 1 ? 'order' : 'orders'}.${nearly ? ` ${nearly}’s is nearly ready.` : ''}`,
    /** A Cooking card's line whose product is already covered. */
    lineReady: 'ready',
    /** A Ready card that has sat a while, in place of its day. */
    waiting: (days: number) => `Waiting ${days} days`,
    priority: 'Priority',
    doneLink: 'Done',
    samplesLink: 'Free samples',
    /** The laptop's top buttons: "Free samples · 4". */
    samplesCount: (n: number) => `Free samples · ${n}`,
    /** Read with a switcher choice: "Packing, 1 order" / "To collect, ₹895 due". */
    countLabel: (n: number) => `${n} ${n === 1 ? 'order' : 'orders'}`,
    moneyLabel: (money: string) => `${money} due`,
  },
  /**
   * The centre popup after an order turns priority: packed pouches it can take from other orders.
   * Names are first names; `what` is "Raggi Jaggi 500 g", "Raggi Jaggi 500 g × 2" or a list of them.
   */
  priorityGive: {
    title: (taker: string) => `${taker} is priority`,
    /** One person gives: "Give Meera Tanvi's packed Raggi Jaggi 500 g?" */
    one: (taker: string, giver: string, what: string[]) => `Give ${taker} ${giver}’s packed ${andList(what)}?`,
    /** Several people give: the question, then a line each. */
    several: (taker: string) => `Give ${taker} these packed pouches?`,
    item: (giver: string, what: string[]) => `${giver}’s ${andList(what)}`,
    goesBack: (givers: string[]) => (givers.length === 1
      ? `${givers[0]}’s order goes back to Cooking.`
      : `${andList(givers.map((g) => `${g}’s`))} orders go back to Cooking.`),
    confirm: (taker: string, pouches: number) => `Give ${pouches === 1 ? 'it' : 'them'} to ${taker}`,
    notNow: 'Not now',
    /** The toast when the taker is still short after it (else it says the order moved to Packing). */
    gave: (taker: string) => `Gave ${taker} the packed food.`,
    /** The pouches went elsewhere before the yes (another phone): nothing moved. */
    nothingLeft: 'Nothing to give any more.',
    /** The giver's history line: "Gave Raggi Jaggi 500 g to Meera’s order (priority)". */
    gaveHistory: (what: string[], taker: string) => `Gave ${andList(what)} to ${taker}’s order (priority)`,
  },
  /** The order view's Priority switch, while the order is in Cooking. */
  orderPriority: {
    label: 'Priority',
    hint: 'Gets food first: from spare and the next batch, or from orders still cooking when that finishes it.',
    switchLabel: (name: string) => `Priority for ${name}’s order`,
  },

  /** A free sample: a third pack size, always free, never priced (admin only). */
  samples: {
    /** After the product name: "Date Bites sample". */
    word: 'sample',
    count: (n: number) => `${n} ${n === 1 ? 'sample' : 'samples'}`,
  },

  /** A status move's second sentence in the toast, from what the kitchen did. */
  kitchenEffects: {
    /** "500 g Date Bites back as spare." */
    backAsSpare: (items: string[]) => `${andList(items)} back as spare.`,
    /** A priority order took food from another order: "Took 250 g Raggi Jaggi from Neha's order." */
    took: (items: string[], name: string) => `Took ${andList(items)} from ${name}'s order.`,
    moved: (name: string, to: string) =>
      (to === 'packing' ? `${name}'s order moved to Packing.` : to === 'cooking' ? `${name}'s order is back to Cooking.` : `${name}'s order moved on.`),
  },

  /** How an order was paid: picked when it's marked paid (detail, cards, Done, Add order). */
  paidBy: {
    /** The pills. "Bank" keeps four pills on one line on a 320px phone. */
    methods: { upi: 'UPI', cash: 'Cash', bank: 'Bank', other: 'Other' },
    /** In the order, the toast and the CSV. Other reads as `other(note)`. */
    names: { upi: 'UPI', cash: 'Cash', bank: 'Bank transfer' },
    /** "Other: bank transfer", in the detail, the toast and the CSV. */
    other: (note: string) => `Other: ${note}`,
    /** Between methods when an order was paid in parts: "UPI + Cash". */
    joiner: ' + ',
    question: 'How did they pay?',
    sheetTitle: (name: string) => `How did ${name} pay?`,
    noteLabel: 'How, in a few words',
    notePlaceholder: 'Like: bank transfer',
    noteMissing: 'Say how they paid, in a few words.',
    markPaid: 'Mark paid',
    /** Add order, Save with Paid on and nothing picked. */
    pickOne: 'Pick how they paid.',
  },

  /**
   * Part payments (design B, temp/part-payments-brief.md). Money in the admin is
   * private, so ₹ is fine here. Amounts arrive already formatted ("₹750").
   */
  payments: {
    // The order page's money block.
    notPaidYet: 'Not paid yet',
    due: (amount: string) => `${amount} due`,
    paidInFull: 'Paid in full',
    /** "₹750 paid" in bold, then "of ₹1,000" quieter. */
    paid: (amount: string) => `${amount} paid`,
    ofTotal: (total: string) => `of ${total}`,
    /** Paid over the total: "✓ Paid ₹50 extra" … "₹1,050 of ₹1,000". */
    paidShort: 'Paid',
    extra: (amount: string) => `${amount} extra`,
    paidOfTotal: (paid: string, total: string) => `${paid} of ${total}`,
    /** Under the bar of an order paid once: "Paid on Sat 26 Sep · UPI". */
    paidOn: (day: string, how: string | null) => `Paid on ${day}${how ? ` · ${how}` : ''}`,
    /** A receipt row: "UPI · Thu 24 Sep". */
    row: (how: string, day: string) => `${how} · ${day}`,
    /** A payment from before methods were recorded. */
    noMethod: 'Not recorded',
    removeLabel: (amount: string, how: string) => `Remove ${amount} ${how} payment`,
    partPayment: 'Part payment',
    markPaid: 'Mark paid',
    markNotPaid: 'Mark not paid',
    /** Screen reader name of the bar. */
    barLabel: (paid: string, total: string) => `${paid} paid of ${total}`,
    /** The status card's hint on a delivered, part-paid order. */
    restToCome: 'Delivered. The rest is still to come.',
    /** Under "Not paid yet" when the order has no total: a part payment needs one. */
    noTotal: 'Add the total to take a part payment.',
    /** Screen reader name of the receipt rows. */
    listLabel: 'Payments',

    // "Part payment from Riya".
    partTitle: (name: string) => `Part payment from ${name}`,
    partSubNone: (code: string, total: string) => `${code} · ${total} in all, nothing paid yet`,
    partSubSome: (code: string, paid: string, total: string) => `${code} · ${paid} of ${total} paid already`,
    amountLabel: 'How much came in?',
    stillDue: (amount: string) => `${amount} will still be due.`,
    allOfIt: "That's all of it.",
    over: (amount: string) => `That's ${amount} more than the total.`,
    /** A quick pick: "½ · ₹500". */
    pick: (fraction: string, amount: string) => `${fraction} · ${amount}`,
    pickLabel: 'Quick amounts',
    howPaidAmount: (amount: string) => `How did they pay the ${amount}?`,
    amountMissing: 'Add an amount first.',
    amountWrong: 'Just the number, like 500.',
    /** Other's button in this popup: it adds a payment, it doesn't mark the order paid. */
    save: 'Save',

    // "Mark paid" = pay the rest.
    restTitle: (name: string, due: string) => `How did ${name} pay the ${due}?`,
    restSub: (code: string, paid: string, total: string) => `${code} · ${paid} of ${total} paid already`,

    // Toasts, each with Undo.
    toasts: {
      /** "₹500 from Riya · UPI. ₹500 still due." */
      part: (amount: string, name: string, how: string | null, due: string | null) =>
        `${amount} from ${name}${how ? ` · ${how}` : ''}.${due ? ` ${due} still due.` : ''}`,
      /** "Riya's order is paid in full · Cash" */
      paidInFull: (name: string, how: string | null) => `${name}'s order is paid in full${how ? ` · ${how}` : ''}`,
      /** "Removed ₹250 · Cash" */
      removed: (amount: string | null, how: string | null) =>
        ['Removed', [amount, how].filter(Boolean).join(' · ')].filter(Boolean).join(' '),
      /** "Riya's order is marked not paid. 2 payments removed." */
      notPaid: (name: string, removed: number) =>
        `${name}'s order is marked not paid.${removed > 1 ? ` ${removed} payments removed.` : ''}`,
    },

    // Cards and lists.
    chip: {
      /** "₹900 · Not paid" */
      notPaid: (total: string | null) => [total, 'Not paid'].filter(Boolean).join(' · '),
      /** "₹1,200 · ₹600 due" */
      partPaid: (total: string, due: string) => `${total} · ${due} due`,
      /** "₹1,180 · Paid" */
      paid: (total: string | null) => [total, 'Paid'].filter(Boolean).join(' · '),
      /** "₹1,000 · Paid, ₹50 extra" */
      extra: (total: string, extra: string) => `${total} · Paid, ${extra} extra`,
      /** To collect: "₹640 to collect" / "₹250 left to collect". */
      toCollect: (amount: string) => `${amount} to collect`,
      leftToCollect: (amount: string) => `${amount} left to collect`,
      /**
       * The paid chip's screen reader name: its words, the state when it's part paid,
       * then what a tap does. "Snehal: ₹1,200 · ₹600 due, part paid. Tap to mark paid"
       */
      label: (name: string, words: string, part: boolean, paid: boolean) =>
        `${name}: ${words}${part ? ', part paid' : ''}. Tap to mark ${paid ? 'not paid' : 'paid'}`,
    },
    /** Done: "Delivered · Paid, ₹50 extra" */
    doneExtra: (extra: string) => `Delivered · Paid, ${extra} extra`,
    /** Edit order, under "Total you quoted" once money has come in: "₹750 paid so far". */
    paidSoFar: (amount: string) => `${amount} paid so far`,

    // Home. The server names at most 3 people; the rest are "and 2 more".
    /** "Riya paid part." / "Riya and Om paid part." / "2 part paid." when nobody is named. */
    paidPart: (names: string[], count: number) =>
      (names.length ? `${namesAndMore(names, count)} paid part.` : `${count} part paid.`),
    /** "Aarav hasn't paid." / "Aarav and Om haven't paid." / "2 not paid yet." when nobody is named. */
    hasntPaid: (names: string[], count: number) =>
      (names.length ? `${namesAndMore(names, count)} ${count === 1 ? "hasn't" : "haven't"} paid.` : `${count} not paid yet.`),
    weekNote: 'Part payments count on the day they came in.',
  },

  /** Orders filtered to one product (a Home product card opens it). */
  ordersProduct: {
    clear: (name: string) => `Showing ${name} orders. Clear the filter`,
    count: (n: number, name: string) => `${n} ${n === 1 ? 'order' : 'orders'} with ${name}`,
    /** To send's hint: "Pack 9 Raggi Jaggi: 250 g × 6 · 500 g × 3." */
    pack: (packs: number, name: string, sizes: [string, number][]) =>
      `Pack ${packs} ${name}: ${sizes.map(([size, n]) => `${size} × ${n}`).join(' · ')}.`,
    exportOnly: (name: string) => `Only orders with ${name}.`,
  },

  order: {
    back: 'Orders',
    notFound: (code: string) => `No order matches “${code}”. Check the code in the chat.`,
    messageSays: (code: string) => `The message says ${code}.`,
    steps: { cooking: 'Cooking', packing: 'Packing', ready: 'Ready', delivered: 'Delivered' },
    /** The quiet label on a held order's card. */
    held: 'Held in Cooking',
    stepsLabel: 'Status',
    hints: {
      /** "Waiting on the Raggi Jaggi. It moves to Packing by itself once that's cooked." */
      cooking: (waiting: string[]) => (waiting.length
        ? `Waiting on the ${andList(waiting)}. It moves to Packing by itself once ${waiting.length === 1 ? 'that’s' : 'they’re'} cooked.`
        : 'It moves to Packing by itself once it’s all cooked.'),
      /** A held order: it stays until someone moves it. "Held in Cooking, waiting on the Raggi Jaggi. …" */
      held: (waiting: string[]) => (waiting.length
        ? `Held in Cooking, still waiting on the ${andList(waiting)}. It stays here until you move it to Packing.`
        : 'Held in Cooking. Its food is kept for it. It stays here until you move it to Packing.'),
      packing: 'Cooked. Pack it, then mark it packed.',
      ready: 'Packed. Mark delivered once it reaches them.',
      delivered: 'Delivered. Mark paid when the money comes in.',
      freeSample: 'Delivered. A free sample, so nothing to collect.',
      done: 'All done.',
    },
    /** Per product in "3 packs": still to cook, or ready (with the days its food was made). */
    stillToCook: 'Still to cook',
    ready: 'Ready',
    /** "Ready, made Thu 17 Sep" / "Ready, made Thu 17 Sep and Sat 19 Sep". */
    readyMade: (days: string[]) => `Ready, made ${andList(days)}`,
    cancelledOn: (day: string) => `Cancelled on ${day}.`,
    bringBack: 'Bring it back',
    notPaidYet: 'Not paid yet',
    packs: (n: number) => `${n} ${n === 1 ? 'pack' : 'packs'}`,
    edit: 'Edit',
    couponInvalid: '(not valid when sent)',
    phone: 'Their phone',
    phonePlaceholder: 'From their chat',
    paste: 'Paste',
    copy: 'Copy',
    phoneError: "That doesn't look like a phone number. It needs 10 digits.",
    total: 'Total you quoted',
    totalPlaceholder: 'What you told them',
    totalHint: 'Only you two see this. It never shows on the site.',
    totalError: 'Just the number, like 1180.',
    // The worked-out total (admin only): packs × the coupon's price, else the base price.
    /** Under a total that filled itself in. The code, when there is one, shows in bold. */
    workedFrom: (code: string | null) => `From ${code ? `${code} prices` : 'your prices'}, before delivery.`,
    /** They typed their own number (Edit: the saved one), and the worked-out total is different. */
    workedIs: (amount: string, editing: boolean) => `From your prices it's ${editing ? 'now ' : ''}${amount}`,
    useThat: 'Use that',
    useThatLabel: (amount: string) => `Use the worked-out total, ${amount}`,
    /** The order page's total saves as you type, so it only ever offers the worked-out one. */
    useTotal: (amount: string) => `Use ${amount} from your prices`,
    /** When a pack has no base price, so there's no total rather than a wrong one. */
    noPrice: (item: string) => `No base price for ${item} yet, so type the total.`,
    note: 'Note',
    notePlaceholder: 'Anything to remember',
    optional: 'optional',
    saved: 'Saved',
    deliverTo: 'Deliver to',
    /** An order made in the admin with no pincode is for Satara. Site orders always have one. */
    deliverToSatara: 'Satara · free delivery',
    useSuggestion: (phone: string, day: string) => `Use ${phone} from their order on ${day}`,
    whatsapp: 'Reply on WhatsApp',
    /**
     * The reply "Reply on WhatsApp" starts, from whoever is signed in. Admin only:
     * the total never shows on the site. No delivery or payment promises here.
     */
    reply: ({ name, from, code, packs, total }: { name: string; from: string; code: string; packs: string; total: string | null }) =>
      [
        `Hi${name ? ` ${name}` : ''}, this is ${from ? `${from} from ` : ''}Shah's Nutrition about your order ${code} (${packs}).`,
        total && `The total is ${total}.`,
      ].filter(Boolean).join(' '),
    call: 'Call',
    history: 'History',
    events: {
      created: 'Came in', cooking: 'Back to Cooking', packing: 'Moved to Packing', ready: 'Packed', delivered: 'Delivered',
      cancelled: 'Cancelled', paid: 'Marked paid', unpaid: 'Marked not paid',
      // Only on orders from before the kitchen flow.
      new: 'Back to New', confirmed: 'Confirmed', sent: 'Sent', kept: 'Still waiting', unkept: 'Still waiting undone',
    },
    /** Moves the kitchen made by itself (a batch, spare, an edit), not a person's pick. */
    autoEvents: {
      cooking: 'Back to Cooking, short of food after a change',
      packing: 'Moved to Packing by itself, all cooked',
      cancelled: 'Cancelled by itself, it never came through',
    } as Partial<Record<string, string>>,
    more: 'More',
    moreLabel: 'More for this order',
    menu: { moveToPacking: 'Move to Packing', moveBack: 'Move back to Cooking', edit: 'Edit order', copy: 'Copy details', cancel: 'Cancel order', delete: 'Delete order' },
    deleteTitle: 'Delete this order?',
    deleteBody: "It's gone for good and stops counting on Home. To keep a record, cancel it instead.",
    keep: 'Keep it',
    position: (i: number, n: number, lane: string) => `${i} of ${n} ${lane.toLowerCase()}`,
    prev: 'Previous order',
    nextOrder: 'Next order',
    keys: ['close', 'next order', 'paid'],
    matchHint: (name: string, day: string) => `Same number as ${name}'s order on ${day}`,
  },

  done: {
    title: 'Done',
    filters: { all: 'All', delivered: 'Delivered', cancelled: 'Cancelled', unpaid: 'Not paid' },
    filterLabel: 'Show',
    columns: ['Date', 'Code', 'Name', 'Items', 'Deliver to', 'Phone', 'Total', 'Status', 'Paid'],
    older: 'Show older orders',
    empty: 'Nothing here yet.',
  },

  exportOrders: {
    title: 'Export orders',
    range: 'Which orders',
    ranges: { month: 'This month', days30: 'Last 30 days', all: 'Everything' },
    download: 'Download CSV',
    busy: 'Making the file…',
    none: 'No orders in that range.',
    columns: ['Code', 'Date', 'Time', 'Name', 'Phone', 'Pincode', 'Items', 'Packs', 'Samples', 'Coupon', 'Came via', 'Status', 'Paid', 'Paid on', 'Paid by', 'Total quoted', 'Amount paid', 'Due', 'Note'],
    file: (day: string) => `shahs-orders-${day}.csv`,
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
    /** After a new coupon: its prices are set per product. */
    savedNew: 'Coupon saved. Set its prices on Products.',
    toProducts: 'Products',
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
    kind: 'Kind',
    kinds: { one_time: 'One-time', repeat: 'Repeat' },
    kindHints: {
      one_time: "Once per phone number. Add order tells you if a number uses it again.",
      repeat: 'A standing offer. Add order fills it in for people who used it before.',
    },
    save: 'Save coupon',
    saving: 'Saving…',
  },

  emailList: {
    title: 'Email list',
    csv: 'CSV',
    csvLabel: 'Download the email list as CSV',
    people: (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`,
    // After the bold "4 people": the rest of the sentence.
    summary: (confirmed: number, waiting: number, left: number) =>
      [
        confirmed ? `${confirmed} confirmed` : '',
        waiting ? `${waiting} still to tap the link in our email` : '',
        left ? `${left} left the list` : '',
      ].filter(Boolean).join(', '),
    loops: 'Loops sends the emails; this is just the list.',
    filterLabel: 'Show',
    filters: { all: 'All', confirmed: 'Confirmed', waiting: 'Waiting', left: 'Left' },
    signedUp: (day: string) => `Signed up ${day}`,
    status: { confirmed: 'Confirmed', waiting: 'Not yet', left: 'Left' },
    empty: 'No one on the list yet. Sign-ups from the site show up here.',
    emptyFilter: 'No one here right now.',
    csvHeaders: ['Email', 'Status', 'Signed up', 'Confirmed', 'Left', 'Consent'],
    csvStatus: { confirmed: 'Confirmed', waiting: 'Waiting', left: 'Left' },
    csvConsent: (yes: boolean) => (yes ? 'Yes' : 'No'),
    csvFile: (day: string) => `shahs-email-list-${day}.csv`,
  },

  moreCounts: {
    couponsOn: (n: number) => `${n} on`,
  },

  settings: {
    title: 'Settings',
    access: 'Who can open the admin',
    since: (username: string, day: string) => `${username} · since ${day}`,
    you: 'You',
    accessHint: 'Adding someone new takes a quick setup step. Ask Sugam.',
    appearance: 'Appearance',
    themes: { light: 'Light', dark: 'Dark', system: 'Like my phone' },
    youTitle: 'You',
    signedInAs: 'Signed in as',
    changePassword: 'Change password',
    newPassword: 'New password',
    again: 'Type it again',
    tooShort: 'At least 10 characters.',
    mismatch: "The two don't match.",
    changing: 'Changing…',
    changed: 'Password changed.',
  },

  // ---- Lane B: Customers (spec 2.10) ----
  customers: {
    title: 'Customers',
    people: (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`,
    summary: (again: number) => ` so far, ${again} ordered again.`,
    withoutPhone: (n: number) => `${n} new ${n === 1 ? 'order has' : 'orders have'} no phone yet, so ${n === 1 ? "it's" : "they're"} not here until you add one.`,
    find: 'Name or phone',
    show: 'Show',
    everyone: 'Everyone',
    again: 'Ordered again',
    orders: (n: number) => `${n} ${n === 1 ? 'order' : 'orders'}`,
    last: (when: string) => `last ${when}`,
    today: 'today',
    yesterday: 'yesterday',
    empty: 'No customers yet. People show up here once an order has a phone number.',
    noMatch: 'No one matches that.',
    back: 'Customers',
    since: (day: string) => ` since ${day}.`,
    delivered: (n: number) => `${n} delivered`,
    quoted: ' in totals you quoted.',
    usually: 'Usually buys',
    theirOrders: 'Their orders',
    notFound: 'No orders with that number.',
  },

  // Add order / Edit order (spec 2.8). Field labels and errors shared with the
  // order detail (phone, total, note) come from `order` above.
  orderForm: {
    newTitle: 'New order',
    editTitle: (code: string) => `Edit ${code}`,
    intro: 'For orders that came by chat, a call or in person.',
    ordered: 'What they ordered',
    tapToAdd: 'Tap to add',
    add: 'Add',
    addLabel: (item: string) => `Add ${item}`,
    less: (item: string) => `One less ${item}`,
    more: (item: string) => `One more ${item}`,
    remove: (item: string) => `Remove ${item}`,
    backSoon: 'Back soon on the site',
    siteNote: 'The chat is the truth. Change this to match what they finally asked for.',
    who: "Who it's for",
    phone: 'Phone',
    name: 'Name',
    namePlaceholder: 'Their name',
    pincode: 'Pincode',
    pincodePlaceholder: '6 digits',
    /** Admin-made orders only: an empty pincode means Satara. A site order must keep its pincode. */
    pincodeSatara: 'Skip: Satara',
    ordersBefore: (n: number) => `${n} ${n === 1 ? 'order' : 'orders'} before`,
    use: 'Use',
    useLabel: (name: string) => `Use ${name}'s name and pincode`,
    /** Under the name box: people who ordered before. */
    suggestions: 'People who ordered before',
    /** The round button after Phone, Android only (the phone's contact picker). */
    pickContact: 'Pick from contacts',
    whichNumber: (name: string) => (name ? `Which number for ${name}?` : 'Which number?'),
    noNumber: (name: string) => (name ? `No phone number for ${name}. Type it in.` : 'That contact has no phone number.'),
    contactsFailed: "Couldn't open your contacts. Type it in instead.",
    via: 'Came via',
    where: "Where it's at",
    paidHint: "If they've paid already.",
    ifYouHave: 'If you have them',
    addNote: 'Add a note',
    addCode: 'Use a code from their message',
    addCoupon: 'Add a coupon',
    coupon: 'Coupon',
    noCoupon: 'No coupon',
    /** The picker's group for coupons that are off or ended. */
    notInUse: 'Not in use',
    /** One quiet line under the coupon when it won't use its own prices. */
    couponOff: (code: string) => `${code} is off, so it's base prices.`,
    couponEnded: (code: string, day: string) => `${code} ended on ${day}, so it's base prices.`,
    /** A saved code that isn't in the list (deleted, or typed on the site). Kept as it is. */
    couponUnknown: (code: string) => `${code} isn't one of your coupons, so it's base prices.`,
    /** A returning number's Repeat coupon, filled in by itself (new orders only). */
    couponFilled: "Filled in: they've used it before.",
    removeCoupon: 'Remove',
    removeCouponLabel: (code: string) => `Remove ${code}`,
    /** A One-time coupon this number already used. A heads-up only: saving still works. */
    couponUsed: (day: string, orderCode: string) => `One-time, and this number used it on ${day} (${orderCode}).`,
    codeLabel: 'Code from their message',
    codeHint: "Only if their WhatsApp message has a code that isn't in the list. Leave it empty and we'll make one.",
    earlier: 'It was ordered earlier',
    date: 'Date',
    time: 'Time',
    save: 'Save order',
    saveEdit: 'Save changes',
    saving: 'Saving…',
    errors: {
      name: 'Add their name.',
      via: 'Pick how the order came in.',
      pincode: 'A pincode has 6 digits, like 415001.',
    },
    saved: (code: string) => `Order ${code} saved`,
    view: 'View',
    leaveTitle: 'Leave without saving?',
    leave: 'Leave',
    keepEditing: 'Keep editing',
  },

  // The kitchen (temp/kitchen-flow, lane A): Pranjali's Log cooking, fixing a batch,
  // spare on the shelf and taking it off. Weights come in already worded ("2 kg", "750 g").
  kitchen: {
    logCooking: 'Log cooking',
    // Log cooking sheet.
    madeOn: 'Made on',
    today: 'Today',
    yesterday: 'Yesterday',
    pickDay: 'Pick a day',
    pickLabel: 'The day it was made',
    need: (weight: string) => `Need ${weight}`,
    notMade: 'not made',
    nothingNeeded: 'Nothing needed',
    goesSpare: 'goes spare',
    add: 'Add',
    addName: (product: string) => `Add ${product}`,
    /** The amount pill's name: "Raggi Jaggi, 2 kg. Change the amount." */
    amountName: (product: string, weight: string) => `${product}, ${weight}. Change the amount.`,
    wheelKg: (product: string) => `${product}, kilograms`,
    wheelG: (product: string) => `${product}, grams`,
    kg: 'kg',
    g: 'g',
    whenYouLog: 'When you log this',
    ifYouSave: 'If you save this',
    ifYouDelete: 'If you delete it',
    checking: 'Working it out…',
    previewFailed: "Couldn't work out what this does. You can still go ahead.",
    pickSomething: 'Tap Add on what you cooked and set how much.',
    logIt: 'Log it',
    logging: 'Logging…',
    // Over 10 kg in one batch.
    big: (weight: string, product: string) => [`${weight} of ${product}?`, " That's a lot, just checking."] as const,
    changeIt: 'Change it',
    /** Used up / Thrown out: the batch left the shelf while the sheet was open. */
    batchGone: 'That batch is gone. Nothing was changed.',
    /** The check above names the product, so the button stays short at 320px. [lead, weight]: the weight never breaks. */
    yesLog: (weight: string) => ['Yes, log ', weight] as const,
    item: (weight: string, product: string) => `${weight} ${product}`,
    logged: (items: string[], packed: number) =>
      `Logged ${andList(items)}.${packed ? ` ${packed} ${packed === 1 ? 'order' : 'orders'} to Packing.` : ''}`,

    // What a batch does, said in the sheet.
    outcomes: {
      allCovered: (n: number) => (n === 1 ? 'The order is covered.' : `All ${n} orders are covered.`),
      covered: (names: string[]) => `${andList(names.map((n) => `${n}'s`))} ${names.length === 1 ? 'order is' : 'orders are'} covered.`,
      goPacking: (names: string[], all: boolean) => {
        if (all) return `${andList(names)} ${names.length === 1 ? 'goes' : 'go'} to Packing for Sunit.`;
        return names.length === 1 ? 'It goes to Packing for Sunit.' : 'They go to Packing for Sunit.';
      },
      partly: (name: string, products: string[]) => `${name}'s ${andList(products)} ${products.length === 1 ? 'is' : 'are'} covered.`,
      /** Some grams of a product, not all it needs: "Meera's order gets 350 g Raggi Jaggi." */
      gets: (name: string, items: string[]) => `${name}'s order gets ${andList(items)}.`,
      partlyWaits: (items: string[]) => `The order still waits on ${andList(items)}.`,
      stillWait: (names: string[]) => `${andList(names)} still ${names.length === 1 ? 'waits' : 'wait'}.`,
      stillToCook: (items: string[]) => `${andList(items)} still to cook.`,
      back: (names: string[]) =>
        `${andList(names.map((n) => `${n}'s`))} ${names.length === 1 ? 'order goes' : 'orders go'} back to Cooking.`,
      backWhy: (n: number) => (n === 1 ? "It isn't packed yet, so it waits for the next batch." : "They aren't packed yet, so they wait for the next batch."),
      /** A Cooking order that loses food (a smaller batch, or a priority order took it). */
      waitsAgain: (name: string, items: string[]) => `${name} waits again for ${andList(items)}.`,
      spare: (weight: string, product: string) => `${weight} ${product} goes spare.`,
      goodTill: (day: string) => `Good till ${day}.`,
      spareLess: (before: string, after: string | null, product: string) =>
        (after ? `${product} spare goes from ${before} to ${after}.` : `The ${before} spare ${product} comes off the shelf.`),
      noSpare: 'Nothing goes spare.',
      ordersSame: "Orders don't change.",
    },

    // Fix a batch.
    fixTitle: (product: string, day: string) => `${product}, made ${day}`,
    howMuch: 'How much',
    was: (weight: string) => `was ${weight}`,
    save: 'Save',
    saving: 'Saving…',
    delete: 'Delete',
    keepIt: 'Keep it',
    deleteIt: 'Delete batch',
    deleting: 'Deleting…',
    fixed: (product: string, rest: string) => `${product} batch fixed.${rest ? ` ${rest}` : ''}`,
    deleted: (product: string, rest: string) => `${product} batch deleted.${rest ? ` ${rest}` : ''}`,
    /** The toast's second sentence after a fix or delete. */
    movedOn: (packed: number, back: string[]) => [
      packed ? `${packed} ${packed === 1 ? 'order' : 'orders'} to Packing.` : '',
      back.length ? `${andList(back.map((n) => `${n}'s`))} back to Cooking.` : '',
    ].filter(Boolean).join(' '),

    // "Logged this week", on Pranjali's Home.
    loggedTitle: 'Logged this week',
    loggedMeta: 'Tap one to fix it',
    batchTitle: (product: string, weight: string) => `${product} · ${weight}`,
    /** "500 g to 2 orders, 200 g spare". */
    batchParts: (toOrders: string | null, orders: number, spare: string | null, off: string | null) =>
      [toOrders && `${toOrders} to ${orders === 1 ? '1 order' : `${orders} orders`}`, spare && `${spare} spare`, off && `${off} off the shelf`].filter(Boolean) as string[],
    fixName: (product: string, weight: string, day: string) => `Fix ${weight} ${product}, made ${day}`,

    // Spare on the shelf: the foot of a product card, the warning line, the sheet.
    spareLine: (weight: string, keeps: string) => `${weight} spare${keeps ? ` · ${keeps}` : ''}`,
    daysLeft: (n: number) => `${n} days left`,
    lastDay: 'last day today',
    goodTillShort: (day: string) => `good till ${day}`,
    pastLine: (weight: string) => `${weight} past its date`,
    pastSub: "Won't go to orders",
    warn: (product: string, kind: 'past' | 'today' | 'days', days = 0) =>
      (kind === 'past' ? `${product} spare is past its date.`
        : kind === 'today' ? `${product} spare is on its last day.` : `${product} spare has ${days} days left.`),
    takeOffName: (weight: string, product: string) => `Take ${weight} ${product} off the shelf`,

    // Used up / thrown out.
    offTitle: 'Take some off the shelf',
    onShelf: (product: string) => `${product} on the shelf`,
    made: (day: string) => `Made ${day}`,
    useBy: (day: string) => `use by ${day}`,
    allOfIt: (weight: string) => `All of it · ${weight}`,
    partOfIt: 'Part of it',
    partWheel: 'Grams to take off',
    stays: (weight: string) => [weight, ' stays on the shelf.'] as const,
    whatHappened: 'What happened',
    usedUp: 'Used up',
    thrownOut: 'Thrown out',
    takeOff: (weight: string) => `Take off ${weight}`,
    throwOut: (weight: string) => `Throw out ${weight}`,
    took: (weight: string, product: string, left: string | null) =>
      `Took ${weight} ${product} off the shelf. ${left ? `${left} left.` : 'None left of that batch.'}`,
    threw: (weight: string, product: string, left: string | null) =>
      `Threw out ${weight} ${product}. ${left ? `${left} left.` : 'None left of that batch.'}`,
  },

  // ---- Kitchen flow, lane B: samples and priority in Add order / Edit, sample and
  // shelf life on Products, the Free samples list. A sample never has a price.
  kitchenForms: {
    // Add order / Edit: the slim row under each product.
    sample: 'Sample',
    free: 'free',
    /** "Date Bites sample", the stepper's item in its labels. */
    sampleItem: (name: string) => `${name} sample`,
    linesError: 'Add at least one pack or a sample.',
    /** Under a worked-out total when samples ride along. */
    fromPrices: (code: string | null, samples: number) =>
      `From ${code ? `${code} prices` : 'your prices'}. ${samples === 1 ? 'The sample is' : 'The samples are'} free.`,
    /** A free sample order: the Paid switch and the total and coupon step aside for these. */
    onlySamplesPaid: 'Only samples, so there’s nothing to pay.',
    onlySamplesTotal: 'Only samples, so there’s no total or coupon.',
    shelfFirst: 'Anything on the shelf is used first, so it may start in Packing.',
    priority: 'Priority',
    priorityHint: 'Fills first from the next cooking.',

    // Products: the card line and the product sheet.
    productsIntro: 'Prices, samples and shelf life only show in here. Turn a pack off and the site shows “Back soon”.',
    shelfLife: (amount: number, unit: 'days' | 'months') =>
      `${amount} ${unit === 'days' ? (amount === 1 ? 'day' : 'days') : (amount === 1 ? 'month' : 'months')}`,
    /** "Sample 20 g · Keeps 6 months": each part stays on one line. */
    sampleFact: (grams: string) => `Sample ${grams}`,
    keepsFact: (life: string) => `Keeps ${life}`,
    edit: 'Edit',
    editLabel: (name: string) => `Edit ${name}`,
    save: 'Save',
    keepTitle: 'Sample and shelf life',
    keepHint: 'A sample is always free. Shelf life counts from the day a batch is made.',
    sampleField: 'Free sample',
    sampleUnit: 'g',
    keepsFor: 'Keeps for',
    unitLabel: 'Days or months',
    units: { days: 'Days', months: 'Months' },
    sampleError: 'Just the grams, like 20.',
    shelfError: 'Just the number, like 6.',
    saved: (name: string) => `${name} saved.`,
    /** One of the two saves failed: say which, then the reason. */
    pricesFailed: (why: string) => `The sample and shelf life are saved, but the prices aren’t. ${why}`,
    keepFailed: (why: string) => `The prices are saved, but the sample and shelf life aren’t. ${why}`,

    // Free samples: every order carrying a sample.
    samplesTitle: 'Free samples',
    /** From the overview: "4 sent in September, 110 g in all." */
    samplesSummary: (sent: number, grams: string, month: string) =>
      (sent ? `${sent} sent in ${month}, ${grams} in all.` : `None sent in ${month} yet.`),
    notDelivered: 'Not delivered yet',
    /** A sample that rode along with a real order. */
    withTheirOrder: 'With their order',
    samplesEmpty: 'No free samples yet. Add one from the Sample row in Add order.',
    older: 'Show older ones',
  },

  // Home (spec 2.4).
  homePage: {
    greeting: (part: 'morning' | 'afternoon' | 'evening', name: string) => `Good ${part}, ${name}`,
    addOrder: 'Add order',

    // The three product cards (temp/home-totals/v2/README.md). Each is one link to that product's orders.
    cards: {
      cookTitle: 'What to cook',
      adminTitle: 'By product',
      adminMeta: 'Tap one to see its orders',
      seeOrders: 'See its orders.',
      // Pranjali: "Cook 2 kg", "250 g × 2 · 500 g × 3" (the packs waiting on it), "for 4 orders".
      make: 'Cook',
      forOrders: (n: number) => `for ${n} ${n === 1 ? 'order' : 'orders'}`,
      nothingToMake: 'Nothing to cook',
      /**
       * Under "Nothing to cook": its orders past Cooking (Packing and Ready). `all` when none of
       * its orders is still in Cooking. "All 4 orders are with Sunit", "Both orders are with Sunit".
       */
      withSunit: (n: number, all: boolean) => {
        if (!n) return 'No orders waiting on it';
        if (!all) return `${n} ${n === 1 ? 'order is' : 'orders are'} with Sunit`;
        return n === 1 ? 'The order is with Sunit' : n === 2 ? 'Both orders are with Sunit' : `All ${n} orders are with Sunit`;
      },
      offSite: (sizes: string[] | null) => (sizes ? `${andList(sizes)} ${sizes.length === 1 ? 'is' : 'are'} off the site` : 'Off the site'),
      cookName: (product: string, main: string, more: string) =>
        [`${product}: ${main}.`, more && `${more}.`, 'See its orders.'].filter(Boolean).join(' '),
      // Under the packs: who's first, and who waits on nothing else.
      priority: (names: string[]) => `${andList(names.map((n) => `${n}'s`))} ${names.length === 1 ? 'order is' : 'orders are'} priority`,
      onlyThis: (names: string[]) =>
        `${andList(names.map((n) => `${n}'s`))} ${names.length === 1 ? 'order is' : 'orders are'} only waiting on this`,
      // Sunit: every stage, always in this order, in orders; the packs under each.
      cooking: 'Cooking',
      packing: 'Packing',
      ready: 'Ready',
      notPaid: 'Not paid yet',
      sizeTimes: (size: string, packs: number) => `${size} × ${packs}`,
      sample: 'Sample',
      orders: (n: number) => `${n} ${n === 1 ? 'order' : 'orders'}`,
      allClear: 'All clear',
      off: (sizes: string[] | null) => (sizes ? `${andList(sizes)} ${sizes.length === 1 ? 'is' : 'are'} off` : 'Off the site'),
      adminName: (product: string, cooking: number, packing: number, ready: number, notPaid: number) =>
        `${product}: ${cooking} cooking, ${packing} packing, ${ready} ready, ${notPaid} not paid. See its orders.`,
    },

    // The line under the date. Pranjali: "Cook 2 kg Raggi Jaggi and 750 g Muesli."
    cookWord: 'Cook ',
    and: ' and ',
    cookLedeName: (items: string[], orders: number) =>
      `Cook ${andList(items)}, for ${orders} ${orders === 1 ? 'order' : 'orders'}.`,
    cookNothing: 'Nothing to cook right now.',
    cookNothingMore: (n: number) => (n === 1 ? 'The order is with Sunit for packing.' : `${n} orders are with Sunit for packing.`),
    // Sunit: "1 to pack, 2 to drop off, and ₹895 is still out."
    toPackCount: (n: number) => `${n} to pack`,
    toDropCount: (n: number) => `${n} to drop off`,
    adminNothing: 'Nothing to pack or drop off',
    stillOut: [', and ', ' is still out'] as const,

    waiting: 'Waiting on you',
    allOrders: 'All orders',
    nothing: 'Nothing to pack, drop off or collect. Enjoy the quiet.',
    toPack: 'To pack',
    toDropOff: 'To drop off',
    /** "Farah's has waited 4 days." With no name, as before. */
    waited: (age: string, n: number, name?: string | null) =>
      (name ? `${name}'s has waited ${age}.` : n === 1 ? `Waiting ${age}.` : `The oldest has waited ${age}.`),
    /** "1 paid, 1 not paid yet"; once any of the rest paid part, they're "not paid in full". */
    paidSplit: (paid: number, notPaid: number, partPaid = 0) =>
      [paid ? `${paid} paid` : '', notPaid ? `${notPaid} ${partPaid ? 'not paid in full' : 'not paid yet'}` : ''].filter(Boolean).join(', '),
    packsThen: (packs: number, rest: string) => `${packs} ${packs === 1 ? 'pack' : 'packs'}${rest ? `. ${rest}` : ''}`,
    toCollect: (money: string) => `${money} to collect`,
    ordersToCollect: (n: number) => `${n} ${n === 1 ? 'order' : 'orders'} to collect`,
    deliveredBy: (name: string, when: string) => `${name}, delivered ${when}`,
    fromPeople: (n: number) => `From ${n} people`,
    // "Tanvi's has no total yet", "Tanvi's and 2 more have no total yet"; a count when nobody is named.
    noTotalYet: (names: string[], count: number) => `${names.length
      ? namesAndMore(names.map((n) => `${n}'s`), count)
      : count} ${count === 1 ? 'has' : 'have'} no total yet`,
    notPaidYet: (n: number) => `${n} not paid yet`,
    namesNotPaid: (names: string[], count: number) => `${namesAndMore(names, count)} ${count === 1 ? "hasn't" : "haven't"} paid yet`,
    allPaid: 'All paid',

    // This week vs last, Sunit's.
    vsTitle: 'This week vs last',
    vsMeta: 'By this time last week',
    vsOrders: (n: number) => (n === 1 ? 'order' : 'orders'),
    vsCameIn: 'came in',
    vsUp: (last: string) => `Up from ${last}`,
    vsDown: (last: string) => `Down from ${last}`,
    vsSame: (last: string) => `Same as ${last}`,
    vsFirst: 'Nothing to compare yet',
    vsNoTotal: (n: number) => `+ ${n} paid with no total`,
    // Under ₹ came in: UPI, Cash, Bank, Other (paidBy.methods), then orders paid before methods existed.
    vsByMethod: 'How it was paid',
    notRecorded: 'Not recorded',
    vsBars: 'Orders each day, this week and last',
    vsDay: (day: string, orders: number, last: number | null) =>
      `${day}: ${orders} ${orders === 1 ? 'order' : 'orders'}${last === null ? '' : `, ${last} last week`}`,
    vsDayAhead: (day: string, last: number | null) => `${day}: still to come${last === null ? '' : `, ${last} last week`}`,
    thisWeek: 'This week',
    lastWeek: 'Last week',
    dayLetters: ['M', 'T', 'W', 'T', 'F', 'S', 'S'],

    // Stock: only when something is off the site.
    offTheSite: 'Off the site',
    products: 'Products',
    offSince: (when: string) => `Off since ${when}. The site shows “Back soon”.`,
    backInStock: 'Back in stock',
    coupons: 'Coupons used',
    couponsLink: 'Coupons',
    couponOrders: (n: number) => `${n} ${n === 1 ? 'order' : 'orders'}`,
    notUsed: 'Not used yet',

    // "How it's going": both Homes' metrics block (temp/home-metrics/design.md, "Final: B").
    metrics: {
      title: 'How it’s going',
      periodLabel: 'Period',
      periods: { today: 'Today', week: 'Week', month: 'Month', year: 'Year', lifetime: 'Lifetime' },
      // "₹1,190 in sales today"
      when: { today: 'today', week: 'this week', month: 'this month', year: 'this year', lifetime: 'since we started' },
      vs: { today: 'vs this time yesterday', week: 'vs this time last week', month: 'vs this time last month', year: 'vs this time last year' },
      /** "this time yesterday" for "Nothing by this time yesterday either". */
      by: { today: 'this time yesterday', week: 'this time last week', month: 'this time last month', year: 'this time last year' },
      before: { today: 'Yesterday', week: 'Last week', month: 'Last month', year: 'Last year' },
      beforeLower: { today: 'yesterday', week: 'last week', month: 'last month', year: 'last year' },
      vsShort: { today: 'vs yesterday', week: 'vs last week', month: 'vs last month', year: 'vs last year' },

      // The range line over the sentence.
      untilTime: (day: string, time: string) => `${day}, until ${time}`,
      range: (from: string, to: string) => `${from} – ${to}`,
      yearSoFar: (year: string) => `${year} so far`,
      since: (day: string) => `Since ${day}`,
      noOrdersYet: 'No orders yet',

      // The four chips, and the words after a figure.
      metricNames: { sales: 'Sales', came_in: 'Came in', orders: 'Orders', packs: 'Packs' },
      units: { orders: (n: number) => (n === 1 ? 'order' : 'orders'), packs: (n: number) => (n === 1 ? 'pack' : 'packs') },
      count: (n: number, metric: 'orders' | 'packs') => `${n.toLocaleString('en-IN')} ${n === 1 ? metric.slice(0, -1) : metric}`,
      showOnChart: 'Show on the chart',
      /** After a figure in the sentence and the readout: "₹1,190 in sales", "₹970 came in". Counts carry their own word. */
      moneyWords: { sales: 'in sales', came_in: 'came in' },
      /** "No sales yet today": the first part in ink-1. Came in at 0 says "₹0 came in today" instead. */
      none: { sales: 'No sales', orders: 'No orders', packs: 'No packs' },
      yet: 'yet',

      // The change line (green only when up) and each chip's change (always grey).
      up: (pct: number, vs: string) => `Up ${pct || 'under 1'}% ${vs}`,
      down: (pct: number, vs: string) => `Down ${pct || 'under 1'}% ${vs}`,
      from: (before: string) => `(from ${before})`,
      same: (by: string) => `Same as ${by}`,
      fresh: (by: string) => `New: none by ${by}`,
      bothZero: (by: string) => `Nothing by ${by} either`,
      noneYet: (before: string, value: string) => `${before} had ${value} by now.`,
      chipFrom: (before: string) => `from ${before}`,
      chipSame: 'Same',
      chipNew: 'New',
      chipNoneYet: (before: string, value: string) => `${before} ${value}`,
      pct: (pct: number) => (pct ? `${pct}%` : '<1%'),
      /** The chip's whole accessible name: "Sales ₹1,190, down 18% vs this time yesterday". */
      chipName: (name: string, value: string, change: string) => `${name} ${value}${change ? `, ${change}` : ''}`,
      spokenUp: (pct: number, vs: string, from: string | null) => `up ${pct || 'under 1'}%${from ? ` from ${from}` : ''} ${vs}`,
      spokenDown: (pct: number, vs: string, from: string | null) => `down ${pct || 'under 1'}%${from ? ` from ${from}` : ''} ${vs}`,
      spokenSame: (by: string) => `same as ${by}`,
      spokenNew: (by: string) => `new, none by ${by}`,
      spokenBothZero: (by: string) => `nothing by ${by} either`,
      spokenNoneYet: (before: string, value: string) => `none yet, ${before.toLowerCase()} had ${value} by now`,

      // No comparison (previous is null): one quiet line instead, said once.
      firstDay: 'Our first day.',
      firstFullDay: 'Our first full day. Comparisons start tomorrow.',
      firstWeek: (start: string) => `Our first week. Comparisons start ${start}.`,
      firstFullWeek: (start: string) => `Our first full week. Comparisons start ${start}.`,
      monday: 'Monday',
      firstMonth: (start: string) => `Our first month. Comparisons start ${start}.`,
      firstFullMonth: (start: string) => `Our first full month. Comparisons start ${start}.`,
      sameAsLifetime: 'Same as Lifetime until 1 Jan.',
      firstFullYear: (start: string) => `Our first full year. Comparisons start ${start}.`,
      lifetimeSince: (day: string) => `Everything since the first order on ${day}.`,
      lifetimeEmpty: 'Your first order will show here.',

      // Small print under the change line, joined with " · ".
      withoutTotal: (n: number) => `${n} ${n === 1 ? 'order' : 'orders'} without a total`,
      notCountingSamples: (n: number) => `Not counting ${n} free ${n === 1 ? 'sample' : 'samples'}`,
      noAmount: (n: number) => `${n} ${n === 1 ? 'payment' : 'payments'} had no amount`,
      byMethod: 'How it came in',

      // The chart.
      hours: ['12 am', '6 am', '12 pm', '6 pm'],
      nowTick: 'Now',
      today: 'Today',
      yesterdayByNow: (value: string) => `Yesterday, ${value} by now`,
      grain: { weekDays: 'This week, by day', day: 'By day', week: 'By week', month: 'By month' },
      startedIn: (month: string) => `We started in ${month}`,
      tapHint: 'Tap a bar',
      clickHint: 'Click a bar',
      dayLetters: ['M', 'T', 'W', 'T', 'F', 'S', 'S'],
      /** The readout under the chart, after a tap. */
      soFar: (label: string) => `${label}, so far`,
      byHour: (hour: string) => `By ${hour}`,
      byNow: 'By now',
      midnight: 'midnight',
      notYet: 'Not yet',
      beforeStart: 'Before we started',
      beforeValue: (before: string, value: string) => `${before}: ${value}`,
      weekOf: (day: string) => `Week of ${day}`,
      /** The chart is one slider: its name, and its value with a bar picked or not. */
      /** "Sales this week, by day", "Sales so far today, by hour". */
      chartName: (metric: string, when: string, grain: string) => `${metric} ${when === 'today' ? 'so far today' : when}, ${grain}`,
      grainLower: { hour: 'by hour', day: 'by day', week: 'by week', month: 'by month' },
      sliderPick: (label: string, value: string, before: string | null) => `${label}: ${value}.${before ? ` ${before}.` : ''}`,
      sliderPeriod: (sentence: string, change: string) => `${sentence}${change ? `, ${change}` : ''}.`,

      // Profit and avg order: quiet figures.
      /** "Profit, est. at 25%": the share is PROFIT_SHARE in pages/metrics.ts, never written here. */
      profit: (pct: number) => `Profit, est. at ${pct}%`,
      avgOrder: 'Avg order',

      // By product: packs, never ₹.
      byProduct: 'By product',
      productNone: 'None yet',
      productMore: (n: number) => `+${n}`,
      productFewer: (n: number) => `−${n}`,
      productSame: 'same',
      productNew: 'new',
    },
  },
};
