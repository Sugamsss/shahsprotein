import { adminCopy } from '../../data/adminCopy';
import { formatWeight } from '../format';
import type { Ingredient, IngredientBook } from '../types';

// Ingredients' pure parts: amounts in kitchen words, how many batches are left, the bar,
// and kilos typed in a field.

const copy = adminCopy.ingredients;

/** "1½ kg", "750 g", "140 pieces". Below nothing reads as nothing. */
export const formatAmount = (amount: number, unit: Ingredient['unit']): string =>
  (unit === 'g' ? formatWeight(Math.max(0, amount)) : copy.pieces(Math.max(0, Math.round(amount))));

/**
 * Whole batches left for the product it runs out on first, using each product's usual
 * batch (the average of its last five) and how much goes into a kilo. null when there's
 * no stock, no amounts set, or no batches logged yet.
 */
export const batchesLeft = (
  ingredient: Pick<Ingredient, 'stock' | 'uses'>,
  batches: IngredientBook['batches'],
): { productId: string; batches: number } | null => {
  if (ingredient.stock === null) return null;
  let best: { productId: string; batches: number } | null = null;
  for (const use of ingredient.uses) {
    const usual = batches.find((b) => b.product_id === use.product_id)?.grams;
    if (!usual) continue;
    const perBatch = (usual / 1000) * use.per_kg;
    if (perBatch <= 0) continue;
    const n = Math.floor(Math.max(0, ingredient.stock) / perBatch);
    if (!best || n < best.batches) best = { productId: use.product_id, batches: n };
  }
  return best;
};

/** How full the bar is, 0–100: against four times its low mark, or full when there's no mark. */
export const fillShare = (ingredient: Pick<Ingredient, 'stock' | 'low_at'>): number => {
  if (ingredient.stock === null || ingredient.stock <= 0) return 0;
  if (!ingredient.low_at) return 100;
  return Math.min(100, Math.round((ingredient.stock / (ingredient.low_at * 4)) * 100));
};

/** Low ones first (least left first), then the rest in the list's own order. */
export const splitLow = (ingredients: Ingredient[]): { low: Ingredient[]; rest: Ingredient[] } => ({
  low: ingredients.filter((i) => i.low).sort((a, b) => (a.stock ?? 0) - (b.stock ?? 0)),
  rest: ingredients.filter((i) => !i.low),
});

/** A field's text to the stored unit: kilos to grams for food, whole pieces for packaging. null when it isn't a number. */
export const fromField = (text: string, unit: Ingredient['unit']): number | null => {
  const clean = text.replace(/,/g, '').trim();
  if (!/^\d+(\.\d+)?$/.test(clean)) return null;
  const n = Number(clean);
  return unit === 'g' ? Math.round(n * 1000) : Math.round(n);
};

/** The stored amount as a field's text: grams to kilos ("1.25"), pieces as they are. */
export const toField = (amount: number | null, unit: Ingredient['unit']): string => {
  if (amount === null || amount === undefined) return '';
  return unit === 'g' ? String(Number((amount / 1000).toFixed(3))) : String(Math.round(amount));
};

/** The products' own ingredient names, once each, in the order the products list them. */
export const productIngredientNames = (lists: string[][]): string[] => {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const name of lists.flat()) {
    const key = name.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    names.push(name.trim());
  }
  return names;
};
