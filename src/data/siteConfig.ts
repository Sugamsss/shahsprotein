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
    product: (productName: string) => `Hi! I'd like to order ${productName}.`,
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
  copyright: `© ${new Date().getFullYear()} Shah's Nutrition. All rights reserved.`,
};
