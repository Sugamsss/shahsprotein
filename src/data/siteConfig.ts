import type { TextSegment } from '../types/content';

export const siteConfig = {
  name: "Shah's Nutrition",
  tagline: "Tasty food. Healthy habits. A brighter you.",
  motto: "A curated range of wholesome everyday foods made with real ingredients and honest nutrition.",
  heroHeading: [
    { text: 'Healthy food that ' },
    { text: 'tastes unhealthy.', highlight: true },
  ] satisfies TextSegment[],
  hero: {
    label: 'Hero',
    eyebrow: 'NOW TAKING ORDERS',
    rangeLink: 'See the range',
    note: 'Made fresh in small batches. Delivered across India.',
  },
  // Every "Order on WhatsApp" button: hero, the order card and the footer. They all open "Your order".
  orderCta: 'Order on WhatsApp',
  products: {
    label: 'Our Products',
    eyebrow: 'Meet the range',
    heading: [
      { text: 'Simple ingredients. ' },
      { text: 'Extraordinary benefits.', highlight: true },
    ] satisfies TextSegment[],
    intro: 'Wholesome everyday foods made with real ingredients and honest nutrition.',
    cardImageAlt: (name: string) => `${name} pouch and ingredients from the Shah's Nutrition product portfolio`,
    viewDetails: 'View details',
    viewDetailsLabel: (name: string) => `View details for ${name}`,
    // The product popup. The facts themselves live in products.ts.
    ingredients: 'Ingredients',
    goodToKnow: 'Good to know',
    staysFresh: 'Stays fresh',
    freshness: (shelfLife: string, madeToOrder?: boolean) =>
      `${shelfLife}. No preservatives.${madeToOrder ? ' Made after you order.' : ''}`,
    contains: 'Contains',
    packSizes: (count: number) => (count > 1 ? 'Pack sizes' : 'Pack size'),
    nutrition: 'Nutrition information',
    nutrient: 'Nutrient',
    per100g: 'Per 100 g',
    perServing: 'Per 30 g',
    serving: '(serving)',
    // For a product without a nutrition panel yet: lead, WhatsApp link, then the rest.
    nutritionMissing: (name: string) =>
      `We’re still adding the full nutrition panel for ${name}. Want the numbers before you order?`,
    nutritionAsk: 'Ask us on WhatsApp',
    nutritionAskAfter: 'and we’ll share what we have.',
  },
  story: {
    label: 'Our Story',
    eyebrow: 'OUR STORY',
    imageAlt: "The Shah family working together on Shah's Nutrition",
    heading: "Making healthy food that tastes unhealthy.",
    paragraphs: [
      [
        { text: "The typical Indian food does not work for nutrition. Our diet is generally carb and fat heavy, low in Protein and other essential nutrients. But if you decide to start eating healthy, it starts becoming confusing, surprisingly expensive, and you stop enjoying food because it just doesn't taste as good anymore. " },
        { text: 'It tastes...healthy.', highlight: true },
      ],
      [
        { text: "Well, I disagree. I can't make something healthier and accept that it has to taste worse. I've been doing this for years at home. My son says he feels \"betrayed\" when I take the foods he loves and quietly make them more nutritious without changing the taste. Honestly, that's the point. " },
        { text: "Healthy food shouldn't feel like a downgrade.", highlight: true },
      ],
      [
        { text: "And now I'm bringing that to everyone with Shah's Nutrition. We make " },
        { text: 'healthy food that tastes unhealthy', highlight: true },
        { text: ", that's not confusing and is actually affordable. Our Raggi Jaggi, Muesli and Date Bites start with familiar ingredients you can recognize. " },
        { text: 'This is just the beginning', highlight: true },
        { text: ', more product launches coming soon!' },
      ],
    ] satisfies TextSegment[][],
  },
  // Section links in the header and the phone menu, in page order.
  nav: [
    { href: '#products', label: 'Products' },
    { href: '#values', label: 'Our Principles' },
    { href: '#our-story', label: 'Our Story' },
    { href: '#faq', label: 'FAQ' },
  ],
  faq: {
    label: 'Frequently Asked Questions',
    eyebrow: 'FREQUENTLY ASKED QUESTIONS',
    heading: 'Questions you might have',
    // Under the questions: more questions go to the order chat, problems with an order to customer care.
    moreLead: 'Have another question?',
    moreLink: 'Ask us on WhatsApp.',
    careLead: "Need help with an order you've placed?",
  },
  // The header pill and the phone menu.
  header: {
    navLabel: 'Main',
    menuLabel: 'Menu',
    openMenu: 'Open menu',
    closeMenu: 'Close menu',
    emailLabel: 'Email Us',
    emailPill: 'Email us',
    appearance: 'Appearance',
    light: 'Light',
    dark: 'Dark',
    themeSwitchLabel: (to: 'light' | 'dark') => `Switch to ${to} mode`,
  },
  // The order card at the end of the page.
  orderCard: {
    title: 'Ready to give it a try?',
    lead: 'Message us on WhatsApp. We’ll help you choose, and tell you the total with delivery.',
    numberLead: 'Or save our order number:',
  },
  // Under the Order button in the order card at the end of the page.
  replyTime: 'We usually reply the same day.',
  // Two numbers with two jobs. Always show a number with its label, and keep
  // customer care out of the header and hero, where it would compete with ordering.
  contact: {
    order: {
      label: 'Order',
      display: '9850359899',
      // Country code + number, digits only, as wa.me and tel: links expect.
      number: '919850359899',
    },
    care: {
      label: 'Customer care',
      display: '9881191999',
      number: '919881191999',
      call: 'Call',
      callLabel: (display: string) => `Call customer care on ${display}`,
      whatsapp: 'WhatsApp',
      whatsappLabel: (display: string) => `WhatsApp customer care on ${display}`,
    },
  },
  orderMessages: {
    general: "Hi! I'd like to place an order.",
  },
  // The "Your order" popup. It says "we", and names Sunit as the one who gets the
  // message: orders go to him on the order number above. No prices, totals or
  // delivery costs anywhere: we reply with them on WhatsApp. Items read
  // "Muesli, 250 g" in the popup and "Muesli 250 g" in the message.
  order: {
    // Most packs of one product in one size per order. Bigger orders are a chat.
    maxQuantity: 10,

    // Popup
    title: 'Your order',
    intro: "Pick what you'd like and send it to Sunit on WhatsApp. We'll reply with the total, delivery and how to pay.",
    itemsHeading: 'In your order', // visually hidden
    addMoreHeading: 'Add something else',
    detailsHeading: 'Your details',
    droppedNotice: "A pack size you'd picked before isn't available any more, so we've taken it out.",

    // Entry points
    cardAdd: 'Add',
    cardAddLabel: (name: string) => `Add ${name} to your order`,
    addToOrder: 'Add to order',
    sizeLegendProduct: 'Pack size',
    headerOrder: 'Order',
    headerEmptyLabel: 'Start your order',
    headerCountLabel: (packs: number) => `Your order, ${packs} ${packs === 1 ? 'pack' : 'packs'}`,

    // Empty
    emptyTitle: 'Nothing in your order yet.',
    emptyBody: "Pick something to start. You'll choose the pack size and how many next.",
    pickAdd: 'Add',
    pickAddLabel: (name: string, size: string) => `Add ${name}, ${size}`,
    chatLead: 'Rather just chat?',
    chatLink: 'Message us on WhatsApp',

    // Lines
    itemName: (name: string, size: string) => `${name}, ${size}`,
    sizeLegend: (name: string) => `Pack size for ${name}`,
    singleSize: (size: string) => `${size} pack`,
    qtyGroup: (item: string) => `How many ${item}`,
    qtyLess: (item: string) => `One less ${item}`,
    qtyMore: (item: string) => `One more ${item}`,
    qtyRemove: (item: string) => `Remove ${item}`,
    maxNote: '10 is the most we can take here. Need more? Just say so in the chat.',
    mergedNote: (item: string) => `Joined with your other ${item}.`,
    removed: (item: string) => `Removed ${item}.`,
    undo: 'Undo',

    // Details
    nameLabel: 'Your name',
    pincodeLabel: 'Pincode',
    pincodeHint: 'So we can check delivery to you.',
    nameMissing: "Please add your name, so we know who's ordering.",
    pincodeMissing: 'Please add your 6-digit pincode.',
    pincodeInvalid: 'A pincode has 6 digits, like 415001.',

    // Coupon
    couponToggle: 'Have a coupon code?',
    couponLabel: 'Coupon code',
    couponPlaceholder: 'Enter code',
    couponApply: 'Apply',
    couponChecking: 'Checking',
    couponAppliedNote: "We'll take it off your total.",
    couponRemove: 'Remove',
    couponInvalid: "We couldn't find that code. Check the spelling, or mention it in the chat.",
    couponUnavailable: "Couldn't check it just now. We'll add it to your message and check it ourselves.",

    // Message preview. "Usually replies the same day" matches replyTime above:
    // if one changes, change them all (sentBody too).
    previewShow: 'See your message',
    previewHide: 'Hide your message',
    previewTo: "To Sunit, Shah's Nutrition",
    previewReply: 'Usually replies the same day',
    previewBlankName: 'your name',
    previewBlankPincode: 'your pincode',

    // Send
    send: 'Send order on WhatsApp',
    sendNote: 'Opens WhatsApp with your message ready to send.',
    // In place of sendNote when every line is out and Send is off.
    allOutNote: 'Everything in your order is out of stock right now.',
    // The last thing in "Your details", above Send. What's saved with the order on
    // our server (not browser storage, not analytics). Revisit if reorder nudges happen.
    privacyNote: 'We keep your name, pincode and what you ordered, so we can look after your order.',

    // Out of stock. A plain label, never a button. No dates, no "notify me".
    // In place of "Add" / "Add to order" when every pack size is out.
    backSoon: 'Back soon',
    // An "Add something else" tile for a product that's all out.
    backSoonLabel: (name: string) => `${name} is back soon`,
    // Under the product popup's bar, and read out for that size in the switch.
    sizeBackSoon: (size: string) => `${size} is back soon.`,
    // Under a saved line that's out. It stays in the cart but isn't sent or counted.
    lineBackSoon: "Back soon, so it's left out of your message.",
    lineSizeBackSoon: (size: string) => `${size} is back soon, so it's left out of your message.`,
    // Above the lines when every line is out (with the "Message us on WhatsApp" link). Send is disabled.
    allBackSoon: 'Everything here is back soon. Pick something else, or just ask us in the chat.',

    // Sent
    sentTitle: 'Now press send in WhatsApp',
    sentBody: "Your order is written out and waiting there. Once you send it, we'll reply with the total, delivery and how to pay. We usually reply the same day.",
    retryLead: "WhatsApp didn't open?",
    retry: 'Try again',
    // A quiet fallback for when WhatsApp won't open at all (a laptop without it,
    // some in-app browsers): copy the same message and paste it into a chat.
    copyLead: 'or',
    copyMessage: 'copy your message',
    copied: (number: string) => `Copied. Paste it into a WhatsApp chat with ${number}.`,
    copyFailed: (number: string) => `Couldn't copy it here. You can message us on WhatsApp at ${number}.`,
    forgot: 'Forgot something? Just add it in the chat.',
    recapQty: (qty: number) => `× ${qty}`,
    recapCoupon: (code: string) => `Coupon ${code}`,
    sentCode: (code: string) => `Your order code is ${code}.`,
    newOrder: 'Start a new order',
    done: 'Done',

    // Screen reader announcements (polite)
    announceAdded: (item: string, packs: number) => `${item} added. ${packs} ${packs === 1 ? 'pack' : 'packs'} in your order.`,
    announceQty: (item: string, qty: number) => `${item}: ${qty}.`,
    announceAtMax: (item: string) => `${item}: 10. That's the most for one order here.`,
    announceMerged: (item: string, qty: number) => `Joined with your other ${item}. ${qty} now.`,
    announceRemoved: (item: string) => `${item} removed. Undo is available.`,
    announceEmpty: 'Your order is empty.',
    announceBackSoon: (item: string) => `${item} is back soon, so it's left out of your message.`,
    announceCouponValid: (code: string, description: string) => `${code} applied. ${description}`,

    // The WhatsApp message, piece by piece: greeting, lines, then coupon, pincode
    // and order code, then the closing.
    message: {
      greeting: (name: string) => `Hi! I'm ${name}, and I'd like to place an order:`,
      // Never sent in practice, because a name is required. Kept for safety.
      greetingNoName: "Hi! I'd like to place an order:",
      line: (productName: string, size: string, quantity: number) => `• ${productName} ${size} × ${quantity}`,
      coupon: (code: string) => `Coupon: ${code}`,
      couponUnchecked: (code: string) => `Coupon: ${code} (not checked yet)`,
      pincode: (pincode: string) => `Pincode: ${pincode}`,
      // The code Sunit matches to the order book. Always there: it's made when the order starts.
      code: (code: string) => `Order code: ${code}`,
      closing: 'Could you send me the total?',
    },
  },
  social: {
    // Use the founder's confirmed inbox until branded receiving mailboxes are created.
    email: "pranjalishah25@gmail.com",
  },
  waitlist: {
    // Fallback count when Supabase can't be reached. The public page no longer shows a count.
    initialCount: 0,
  },
  // The email sign-up under the order card. Feedback shows inline under the form
  // (the toast is only for failures).
  signup: {
    intro: 'Not ready yet? Hear about new launches.',
    formLabel: 'Get email updates',
    consent: 'Email me about new products from Shah’s Nutrition. I can unsubscribe anytime.',
    emailLabel: 'Email address',
    submit: 'Keep me posted',
    submitting: 'Adding you…',
    emailError: 'That email looks incomplete. Mind checking it?',
    consentError: 'Tick the box so we can email you.',
    doneTitle: 'Check your inbox.',
    doneBody: (email: string) => `We've sent a link to ${email}. Tap it to confirm.`,
    alreadyTitle: "You're already on our list.",
    alreadyBody: "If you haven't confirmed yet, look for our email in your inbox (or spam).",
  },
  // Shown for any URL that isn't a page.
  notFound: {
    pageTitle: 'Page not found',
    title: 'This page wandered off.',
    body: "Let's get you back to the good stuff.",
    home: "Back to Shah's Nutrition",
  },
  footer: {
    linksHeading: 'Quick Links',
    products: 'Products',
    story: 'Our Story',
    updates: 'Get updates',
    contactHeading: 'Get in touch',
  },
  // Small shared bits: the skip link, close buttons and the section error.
  ui: {
    skipLink: 'Skip to main content',
    close: 'Close',
    closeNotification: 'Close notification',
    sectionError: 'Something went wrong loading this section.',
  },
  copyright: `© ${new Date().getFullYear()} Shah's Nutrition. All rights reserved.`,
};
