export interface NutritionFact {
  label: string;
  per100g: string;
  perServing: string;
  isSubItem?: boolean;
}

export type IconType = 'leaf' | 'wheat' | 'dumbbell' | 'currency';

export interface Product {
  id: string;
  name: string;
  tagline: string;
  shortDescription: string;
  fullDescription: string;
  iconType: IconType;
  image: string;
  features: string[];
  ingredients: string[];
  ingredientSprite: { image: string; rows: number };
  nutritionFacts: NutritionFact[];
  /** Pack sizes, e.g. "250 g". Prices are not published yet. */
  weightOptions: string[];
  /** How long it stays fresh. Kept short on purpose: no preservatives. */
  /** How long it keeps, as shown to customers, e.g. "6 months". */
  shelfLife: string;
  /** Made after the order comes in, so it ships fresh. */
  madeToOrder?: boolean;
  /** Allergen line shown under "Good to know", e.g. "Tree nuts (cashew), dairy (ghee)". */
  contains: string;
  isPopular?: boolean;
}
