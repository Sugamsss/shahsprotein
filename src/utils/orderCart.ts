import { productsData } from '../data/products';
import { siteConfig } from '../data/siteConfig';
import type { Product } from '../types/product';
import type { AddResult, OrderLine } from '../types/order';

// Pure cart functions: no React, no storage. Every change returns a new array,
// or the same array when nothing changed, so React can skip needless renders.
// Stored lines keep the order they were first added; show them with sortLines().

const DEFAULT_MAX = siteConfig.order.maxQuantity;

const findProduct = (products: readonly Product[], productId: string): Product | undefined =>
  products.find((p) => p.id === productId);

const isKnownSize = (products: readonly Product[], productId: string, size: string): boolean =>
  findProduct(products, productId)?.weightOptions.includes(size) ?? false;

const sameLine = (line: OrderLine, productId: string, size: string): boolean =>
  line.productId === productId && line.size === size;

/** A whole number from 1 to max, or null for anything that isn't a usable number. */
const toQuantity = (value: unknown, max: number): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const whole = Math.floor(value);
  return whole < 1 ? null : Math.min(whole, max);
};

/**
 * Adds packs, merging into an existing line for the same product and size.
 * No size means the product's first pack size. The quantity is clamped to max,
 * and the result says `capped` when it was.
 */
export const addLine = (
  lines: OrderLine[],
  productId: string,
  size?: string,
  quantity = 1,
  products: readonly Product[] = productsData,
  max = DEFAULT_MAX,
): { lines: OrderLine[]; result: AddResult } => {
  const product = findProduct(products, productId);
  const packSize = size ?? product?.weightOptions[0];
  const amount = toQuantity(quantity, max);
  if (!product || !packSize || !product.weightOptions.includes(packSize) || amount === null) {
    return { lines, result: 'invalid' };
  }

  const index = lines.findIndex((l) => sameLine(l, productId, packSize));
  const current = index === -1 ? 0 : lines[index].quantity;
  const total = Math.min(current + amount, max);
  const result: AddResult = current + amount > max ? 'capped' : 'added';
  if (index === -1) {
    return { lines: [...lines, { productId, size: packSize, quantity: total }], result };
  }
  if (total === current) return { lines, result };

  const next = lines.slice();
  next[index] = { ...lines[index], quantity: total };
  return { lines: next, result };
};

/**
 * Lines in product order (as in productsData), then pack-size order (as in
 * weightOptions). The popup, the preview and the message all use this, so they
 * always match. The stored order doesn't matter.
 */
export const sortLines = (
  lines: readonly OrderLine[],
  products: readonly Product[] = productsData,
): OrderLine[] => {
  const rank = (line: OrderLine): [number, number] => {
    const productIndex = products.findIndex((p) => p.id === line.productId);
    const sizeIndex = productIndex === -1 ? -1 : products[productIndex].weightOptions.indexOf(line.size);
    return [productIndex === -1 ? products.length : productIndex, sizeIndex];
  };
  return [...lines].sort((a, b) => {
    const [pa, sa] = rank(a);
    const [pb, sb] = rank(b);
    return pa - pb || sa - sb;
  });
};

/** Sets a line's quantity, as a whole number clamped to 1..max. Removing a line is `removeLine`. */
export const setLineQuantity = (
  lines: OrderLine[],
  productId: string,
  size: string,
  quantity: number,
  max = DEFAULT_MAX,
): OrderLine[] => {
  if (!Number.isFinite(quantity)) return lines;
  const clamped = Math.min(Math.max(Math.floor(quantity), 1), max);
  const index = lines.findIndex((l) => sameLine(l, productId, size));
  if (index === -1 || lines[index].quantity === clamped) return lines;

  const next = lines.slice();
  next[index] = { ...lines[index], quantity: clamped };
  return next;
};

/**
 * Moves a line to another pack size. If that size already has a line, the two
 * merge (clamped to max) and the merged line stays where the edited line was,
 * so the row the person is touching doesn't jump.
 */
export const changeLineSize = (
  lines: OrderLine[],
  productId: string,
  from: string,
  to: string,
  products: readonly Product[] = productsData,
  max = DEFAULT_MAX,
): OrderLine[] => {
  if (from === to || !isKnownSize(products, productId, to)) return lines;
  const index = lines.findIndex((l) => sameLine(l, productId, from));
  if (index === -1) return lines;

  const existing = lines.find((l) => sameLine(l, productId, to));
  const quantity = Math.min(lines[index].quantity + (existing?.quantity ?? 0), max);
  return lines
    .map((l, i) => (i === index ? { productId, size: to, quantity } : l))
    .filter((l) => l !== existing);
};

export const removeLine = (lines: OrderLine[], productId: string, size: string): OrderLine[] => {
  const next = lines.filter((l) => !sameLine(l, productId, size));
  return next.length === lines.length ? lines : next;
};

/**
 * The lines that go in the message and the save: out-of-stock ones are left out
 * (they stay in the cart with a "Back soon" note). In display order.
 */
export const inStockLines = (
  lines: readonly OrderLine[],
  isOut: (productId: string, size: string) => boolean,
): OrderLine[] => sortLines(lines.filter((line) => !isOut(line.productId, line.size)));

/** Total packs across all lines, for the header count. */
export const countItems = (lines: readonly OrderLine[]): number =>
  lines.reduce((sum, l) => sum + l.quantity, 0);

/** What goes in localStorage. */
export const serializeCart = (lines: readonly OrderLine[]): string =>
  JSON.stringify({ v: 1, lines });

/**
 * Reads a saved cart and checks it against today's products. Anything that isn't
 * `{ v: 1, lines: [...] }` is an empty cart. A line is dropped (and counted) when its
 * product or pack size no longer exists or its quantity isn't a number of at least 1.
 * Duplicate lines merge, which isn't a drop. Never throws.
 */
export const parseStoredCart = (
  raw: string | null,
  products: readonly Product[] = productsData,
  max = DEFAULT_MAX,
): { lines: OrderLine[]; dropped: number } => {
  const empty = { lines: [], dropped: 0 };
  if (!raw) return empty;

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return empty;
  }
  if (typeof data !== 'object' || data === null) return empty;
  const { v, lines: stored } = data as { v?: unknown; lines?: unknown };
  if (v !== 1 || !Array.isArray(stored)) return empty;

  const lines: OrderLine[] = [];
  let dropped = 0;
  for (const item of stored) {
    const line = (typeof item === 'object' && item !== null ? item : {}) as Partial<Record<keyof OrderLine, unknown>>;
    const { productId, size } = line;
    const quantity = toQuantity(line.quantity, max);
    if (typeof productId !== 'string' || typeof size !== 'string'
      || !isKnownSize(products, productId, size) || quantity === null) {
      dropped += 1;
      continue;
    }
    const existing = lines.find((l) => sameLine(l, productId, size));
    if (existing) existing.quantity = Math.min(existing.quantity + quantity, max);
    else lines.push({ productId, size, quantity });
  }
  return { lines, dropped };
};
