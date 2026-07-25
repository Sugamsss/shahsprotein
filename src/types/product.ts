export interface NutritionFact {
  label: string;
  value: string;
  unit?: string;
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
  nutritionFacts: NutritionFact[];
  weightOptions: string[];
  isPopular?: boolean;
}
