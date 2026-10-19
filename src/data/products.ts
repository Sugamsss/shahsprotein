import { ImageSet, Product } from '../types/product';

// The "Add something else" tiles show a 4:5 crop of the whole pouch, exported
// 180, 360 and 540 wide: 3x the 48px desktop tile and the ~109px and ~170px
// phone tiles. Masters and crop notes are in Private/order-tiles.
const orderTile = (name: string): ImageSet => ({
  src: `/assets/order-tiles/${name}-360w-v1.webp`,
  srcSet: [180, 360, 540].map((w) => `/assets/order-tiles/${name}-${w}w-v1.webp ${w}w`).join(', '),
});

// The English product portfolio is the source for this launch range. Nutrition
// is populated only where a product label has been supplied. Prices come later,
// so weightOptions lists pack sizes only.
// Each ingredient sprite follows its ingredient list in row-major order, three columns per row.
// Sprites are served with a one-year immutable cache, so a changed sprite needs a new filename.
// Sprites are exported at 216px per tile as WebP; the chips crop each tile into a round picture.
export const productsData: Product[] = [
  {
    id: 'raggi-jaggi',
    name: 'Raggi Jaggi',
    tagline: 'Traditional goodness for modern days.',
    shortDescription: 'Millet-based snack made with real ingredients.',
    iconType: 'wheat',
    image: '/assets/product-cards/raggi-jaggi-light-v5.webp',
    imageDark: '/assets/product-cards/raggi-jaggi-dark-v5.webp',
    features: ['Millet-based', 'Jaggery sweetened', 'Cashew goodness'],
    ingredients: ['Ragi', 'Jaggery', 'Cashew', 'Ghee', 'Elaichi'],
    ingredientSprite: { image: '/assets/ingredients/raggi-jaggi-648w.webp', rows: 2 },
    benefits:
      "Ragi is the slow, steady kind of energy. It takes its time to digest, so it keeps you going for hours, and it's one of the richest grains in calcium. The jaggery is there for a quick lift. A spoon of ghee helps all of it last a little longer, and the cashew and elaichi make it taste like home. Fair warning: it's hard to stop at one spoon.",
    orderThumb: '/assets/order-thumbs/raggi-jaggi-light-192w-v1.webp',
    orderThumbDark: '/assets/order-thumbs/raggi-jaggi-dark-192w-v1.webp',
    orderTile: orderTile('raggi-jaggi-light'),
    orderTileDark: orderTile('raggi-jaggi-dark'),
    nutritionFacts: [
      { label: 'Energy', per100g: '423 kcal', perServing: '127 kcal' },
      { label: 'Protein', per100g: '6.2 g', perServing: '1.9 g' },
      { label: 'Carbohydrate', per100g: '68.2 g', perServing: '20.5 g' },
      { label: 'Total Sugars', per100g: '26.9 g', perServing: '8.1 g', isSubItem: true },
      { label: 'Added Sugars', per100g: '25.3 g', perServing: '7.6 g', isSubItem: true },
      { label: 'Total Fat', per100g: '14.7 g', perServing: '4.4 g' },
      { label: 'Saturated Fat', per100g: '6.1 g', perServing: '1.8 g', isSubItem: true },
      { label: 'Dietary Fibre', per100g: '2.4 g', perServing: '0.7 g' },
      { label: 'Sodium', per100g: '4 mg', perServing: '1.2 mg' },
    ],
    weightOptions: ['250 g', '500 g'],
    shelfLife: '6 months',
    contains: 'Tree nuts (cashew), dairy (ghee)',
  },
  {
    id: 'muesli',
    name: 'Muesli',
    tagline: 'A bowl of complete nutrition.',
    shortDescription: 'Crunchy roasted blend with flakes, nuts, seeds and fruit.',
    iconType: 'wheat',
    image: '/assets/product-cards/muesli-light-v4.webp',
    imageDark: '/assets/product-cards/muesli-dark-v4.webp',
    features: ['Flakes', 'Nuts', 'Seeds', 'Dried fruit'],
    ingredients: [
      'Almonds',
      'Sugar',
      'Black Raisins',
      'Tutti Frutti',
      'Corn Flakes',
      'Ragi Balls',
      'Wheat Flakes',
      'Jowar Flakes',
      'Oats',
      'Golden Raisins',
      'Cranberries',
      'Pumpkin Seeds',
      'Flaxseeds',
      'Ghee',
      'Liquid Glucose',
      'Cocoa Powder',
      'Vanilla Powder',
    ],
    ingredientSprite: { image: '/assets/ingredients/muesli-v5-648w.webp', rows: 6 },
    benefits:
      "Most muesli is mostly flakes with a few nuts thrown in. Ours starts with almonds, and we don't hold back on pumpkin seeds and flaxseeds either, so you get real protein and good fats in every bowl. Add five grains, two kinds of raisins, cranberries and a hint of cocoa and vanilla, and there's a little surprise in every spoon.",
    orderThumb: '/assets/order-thumbs/muesli-light-192w-v1.webp',
    orderThumbDark: '/assets/order-thumbs/muesli-dark-192w-v1.webp',
    orderTile: orderTile('muesli-light'),
    orderTileDark: orderTile('muesli-dark'),
    nutritionFacts: [
      { label: 'Energy', per100g: '413 kcal', perServing: '124 kcal' },
      { label: 'Protein', per100g: '10.0 g', perServing: '3.0 g' },
      { label: 'Carbohydrate', per100g: '64.7 g', perServing: '19.4 g' },
      { label: 'Total Sugars', per100g: '35.4 g', perServing: '10.6 g', isSubItem: true },
      { label: 'Added Sugars', per100g: '23.4 g', perServing: '7.0 g', isSubItem: true },
      { label: 'Total Fat', per100g: '14.5 g', perServing: '4.4 g' },
      { label: 'Saturated Fat', per100g: '2.2 g', perServing: '0.7 g', isSubItem: true },
      { label: 'Dietary Fibre', per100g: '7.2 g', perServing: '2.2 g' },
      { label: 'Sodium', per100g: '92.5 mg', perServing: '27.7 mg' },
    ],
    weightOptions: ['250 g', '500 g'],
    shelfLife: '6 months',
    contains: 'Tree nuts (almonds; may contain traces of cashews), dairy (ghee), gluten (oats)',
  },
  {
    id: 'bites',
    name: 'Date Bites',
    tagline: 'Natural energy in every bite.',
    shortDescription: 'Nut-and-seed date bites for smart snacking.',
    iconType: 'leaf',
    image: '/assets/product-cards/bites-light-v3.webp',
    imageDark: '/assets/product-cards/bites-dark-v3.webp',
    features: ['Dates', 'Nuts', 'Seeds', 'Cranberry'],
    ingredients: ['Dates', 'Sunflower Seeds', 'Pumpkin Seeds', 'Almonds', 'Cashew', 'Cranberry', 'Haliv', 'Ghee'],
    ingredientSprite: { image: '/assets/ingredients/date-bites-v3-648w.webp', rows: 3 },
    benefits:
      "Dates give you natural sweetness and quick energy. The nuts and seeds add protein and good fats, so a couple of bites actually fill you up. Haliv has been used in Indian homes for generations as a source of iron, and a little ghee holds it all together. Try eating just one. I never can.",
    orderThumb: '/assets/order-thumbs/bites-light-192w-v1.webp',
    orderThumbDark: '/assets/order-thumbs/bites-dark-192w-v1.webp',
    orderTile: orderTile('bites-light'),
    orderTileDark: orderTile('bites-dark'),
    nutritionFacts: [],
    weightOptions: ['250 g'],
    shelfLife: '15 days',
    madeToOrder: true,
    contains: 'Tree nuts (almonds, cashew), dairy (ghee)',
  },
];
