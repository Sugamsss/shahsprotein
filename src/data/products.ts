import { Product } from '../types/product';

// The English product portfolio is the source for this launch range. Nutrition
// is populated only where a product label has been supplied; pack sizes remain blank.
// Each ingredient sprite follows its ingredient list in row-major order, three columns per row.
export const productsData: Product[] = [
  {
    id: 'raggi-jaggi',
    name: 'Raggi Jaggi',
    tagline: 'Traditional goodness for modern days.',
    shortDescription: 'Millet-based snack made with real ingredients.',
    fullDescription: 'A ragi snack sweetened with organic jaggery, with cashew, ghee and elaichi.',
    iconType: 'wheat',
    image: '/assets/english-product-portfolio.png',
    features: ['Millet-based', 'Organic jaggery sweetened', 'Cashew goodness'],
    ingredients: ['Ragi', 'Organic Jaggery', 'Cashew', 'Ghee', 'Elaichi'],
    ingredientSprite: { image: '/assets/ingredients/raggi-jaggi.webp', rows: 2 },
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
    weightOptions: [],
  },
  {
    id: 'muesli',
    name: 'Muesli',
    tagline: 'A bowl of complete nutrition.',
    shortDescription: 'Crunchy roasted blend with flakes, nuts, seeds and fruit.',
    fullDescription: 'Made with oats, wheat flakes, jowar flakes, ragi crisps, almonds, raisins, cranberries, pumpkin seeds and flax seeds.',
    iconType: 'wheat',
    image: '/assets/english-product-portfolio.png',
    features: ['Flakes', 'Nuts', 'Seeds', 'Dried fruit'],
    ingredients: ['Oats', 'Wheat Flakes', 'Jowar Flakes', 'Ragi Crisps', 'Almonds', 'Raisins', 'Cranberries', 'Pumpkin Seeds', 'Flax Seeds'],
    ingredientSprite: { image: '/assets/ingredients/muesli.webp', rows: 3 },
    nutritionFacts: [],
    weightOptions: [],
  },
  {
    id: 'bites',
    name: 'Date Bites',
    tagline: 'Natural energy in every bite.',
    shortDescription: 'Nut-and-seed date bites for smart snacking.',
    fullDescription: 'Date bites made with almonds, cashew, sunflower seeds, pumpkin seeds, haliv and cranberry.',
    iconType: 'leaf',
    image: '/assets/english-product-portfolio.png',
    features: ['Dates', 'Nuts', 'Seeds', 'Cranberry'],
    ingredients: ['Dates', 'Almonds', 'Cashew', 'Sunflower Seeds', 'Pumpkin Seeds', 'Haliv', 'Cranberry'],
    ingredientSprite: { image: '/assets/ingredients/date-bites.webp', rows: 3 },
    nutritionFacts: [],
    weightOptions: [],
  },
];
