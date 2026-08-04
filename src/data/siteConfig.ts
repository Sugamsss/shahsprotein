import type { TextSegment } from '../types/content';

export const siteConfig = {
  name: "Shah's Nutrition",
  tagline: "Healthy Food that Tastes Unhealthy 😉",
  motto: "Complete Nutrition for Every Day and Every One",
  heroHeading: [
    { text: 'To make ' },
    { text: 'tasty', highlight: true },
    { text: ' and ' },
    { text: 'healthy', highlight: true },
    { text: ' food for ' },
    { text: 'you', highlight: true },
    { text: ' and your ' },
    { text: 'family', highlight: true },
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
        { text: ", that's not confusing and is actually affordable. Every recipe is designed to complete the nutrition our Indian diet leaves out, so your body gets what it needs. " },
        { text: 'This is just the beginning', highlight: true },
        { text: ', more product launches coming soon!' },
      ],
    ] satisfies TextSegment[][],
  },
  social: {
    instagram: "https://instagram.com/shahsnutrition",
    // Use the founder's confirmed inbox until branded receiving mailboxes are created.
    email: "pranjalishah25@gmail.com",
    business: "pranjalishah25@gmail.com",
  },
  waitlist: {
    initialCount: 524,
  },
  copyright: `© ${new Date().getFullYear()} Shah's Nutrition. All rights reserved.`,
};
