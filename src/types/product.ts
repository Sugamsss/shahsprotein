export type IconType = 'leaf' | 'wheat' | 'dumbbell' | 'currency';

export interface Product {
  id: string;
  name: string;
  iconType: IconType;
  image: string;
}
