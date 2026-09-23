import { Product } from '../types/product';

// The English product portfolio is the source for this launch range. It does
// not publish nutrition panels or pack sizes, so those are intentionally blank.
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
    nutritionFacts: [],
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
    nutritionFacts: [],
    weightOptions: [],
  },
];
