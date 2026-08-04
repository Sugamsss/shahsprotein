export type ValueIconType = 'utensils' | 'scan-search' | 'users-round';

export interface BrandValue {
  id: string;
  title: string;
  description: string;
  iconType: ValueIconType;
}
