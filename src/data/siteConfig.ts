import type { TextSegment } from '../types/content';

export const siteConfig = {
  name: "Shah's Nutrition",
  tagline: "Tasty food. Healthy habits. A brighter you.",
  motto: "A curated range of wholesome everyday foods made with real ingredients and honest nutrition.",
  heroHeading: [
    { text: 'Simple ingredients. ' },
    { text: 'Extraordinary benefits.', highlight: true },
  ] satisfies TextSegment[],
  story: {
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

    // Sent
    sentTitle: 'Now press send in WhatsApp',
    sentBody: "Your order is written out and waiting there. Once you send it, we'll reply with the total, delivery and how to pay. We usually reply the same day.",
    retryLead: "WhatsApp didn't open?",
    retry: 'Try again',
    forgot: 'Forgot something? Just add it in the chat.',
    recapQty: (qty: number) => `× ${qty}`,
    recapCoupon: (code: string) => `Coupon ${code}`,
    newOrder: 'Start a new order',
    done: 'Done',

    // Screen reader announcements (polite)
    announceAdded: (item: string, packs: number) => `${item} added. ${packs} ${packs === 1 ? 'pack' : 'packs'} in your order.`,
    announceQty: (item: string, qty: number) => `${item}: ${qty}.`,
    announceAtMax: (item: string) => `${item}: 10. That's the most for one order here.`,
    announceMerged: (item: string, qty: number) => `Joined with your other ${item}. ${qty} now.`,
    announceRemoved: (item: string) => `${item} removed. Undo is available.`,
    announceEmpty: 'Your order is empty.',
    announceCouponValid: (code: string, description: string) => `${code} applied. ${description}`,

    // The WhatsApp message, piece by piece: greeting, lines, coupon and pincode, closing.
    message: {
      greeting: (name: string) => `Hi! I'm ${name}, and I'd like to place an order:`,
      // Never sent in practice, because a name is required. Kept for safety.
      greetingNoName: "Hi! I'd like to place an order:",
      line: (productName: string, size: string, quantity: number) => `• ${productName} ${size} × ${quantity}`,
      coupon: (code: string) => `Coupon: ${code}`,
      couponUnchecked: (code: string) => `Coupon: ${code} (not checked yet)`,
      pincode: (pincode: string) => `Pincode: ${pincode}`,
      closing: 'Could you send me the total?',
    },
  },
  social: {
    instagram: "https://instagram.com/shahsnutrition",
    // Use the founder's confirmed inbox until branded receiving mailboxes are created.
    email: "pranjalishah25@gmail.com",
    business: "pranjalishah25@gmail.com",
  },
  waitlist: {
    // Fallback count when Supabase can't be reached. The public page no longer shows a count.
    initialCount: 0,
  },
  // Email sign-up feedback, shown inline under the form (the toast is only for failures).
  signup: {
    emailError: 'That email looks incomplete. Mind checking it?',
    consentError: 'Tick the box so we can email you.',
    doneTitle: 'Check your inbox.',
    doneBody: (email: string) => `We've sent a link to ${email}. Tap it to confirm.`,
    alreadyTitle: "You're already on our list.",
    alreadyBody: "If you haven't confirmed yet, look for our email in your inbox (or spam).",
  },
  // Shown for any URL that isn't a page.
  notFound: {
    title: 'This page wandered off.',
    body: "Let's get you back to the good stuff.",
    home: "Back to Shah's Nutrition",
  },
  copyright: `© ${new Date().getFullYear()} Shah's Nutrition. All rights reserved.`,
};
