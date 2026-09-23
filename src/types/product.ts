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
  weightOptions: string[];
  isPopular?: boolean;
}
