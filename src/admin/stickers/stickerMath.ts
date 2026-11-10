// Sticker date, batch, price and sheet rules for /admin/stickers.
// Pure functions only (no React, no copy): every rule Sunit relies on is
// tested in stickerMath.test.ts. Dates are India calendar days "YYYY-MM-DD".

/**
 * Admin product id → batch-code letter (owner, 2026-11-10, final).
 * R / M / D followed by the full made-on date, e.g. R09112026.
 * The old RJ/MS/DS + DDMMYY and the SRB/SMB print codes are gone — never
 * reintroduce them here.
 */
export const BATCH_PREFIX = {
  'raggi-jaggi': 'R',
  muesli: 'M',
  bites: 'D',
} as const;

/**
 * Shelf life per product (owner, 2026-11-10, final): Raggi Jaggi and Muesli
 * are +6 calendar months, Date Bites is +21 days. These are printed rules, not
 * kitchen defaults — the label used to say 15 days for Date Bites, which is
 * superseded. Keep them here so the page, the test and the proof cannot drift.
 */
export const SHELF_LIFE = {
  'raggi-jaggi': { unit: 'months', amount: 6 },
  muesli: { unit: 'months', amount: 6 },
  bites: { unit: 'days', amount: 21 },
} as const;

export type ShelfLife = (typeof SHELF_LIFE)[StickerProductId];

export type StickerProductId = keyof typeof BATCH_PREFIX;

/** Stickers per printed sheet, from the label repo's sheet inventory. */
export const SHEETS_PER = {
  '250g-back': 6,
  '100g-back': 9,
  container: 15,
} as const;

export type StickerLayout = keyof typeof SHEETS_PER;

/** Which sheet a pack prints on: Date Bites 250 g is the container sticker. */
export const layoutFor = (productId: StickerProductId, size: '100 g' | '250 g'): StickerLayout =>
  productId === 'bites' && size === '250 g' ? 'container' : size === '250 g' ? '250g-back' : '100g-back';

/** "2026-11-10" → "10-11-2026". The only date format on a sticker. */
export const formatDDMMYYYY = (day: string): string => {
  const [y, m, d] = day.split('-');
  return `${d}-${m}-${y}`;
};

const daysInMonth = (year: number, monthIndex: number): number => new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();

/**
 * Calendar-month addition with month-end clamp (the label engine's _add_months):
 * 2026-08-31 + 6 → 2027-02-28, never a 30-day sum.
 */
export const addMonthsClamp = (day: string, months: number): string => {
  const [y, m, d] = day.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = daysInMonth(target.getUTCFullYear(), target.getUTCMonth());
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
};

/** Day addition: 2026-11-10 + 15 → 2026-11-25. */
export const addDays = (day: string, n: number): string => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * "R" + DDMMYYYY of the made-on day:
 * batchCode("R", "2026-11-09") → "R09112026".
 */
export const batchCode = (prefix: string, madeOn: string): string => {
  const [y, m, d] = madeOn.split('-');
  return `${prefix}${d}${m}${y}`;
};

/** Use By from the made-on day and that product's shelf life. */
export const useByDate = (productId: StickerProductId, madeOn: string): string => {
  const shelf = SHELF_LIFE[productId];
  return shelf.unit === 'months' ? addMonthsClamp(madeOn, shelf.amount) : addDays(madeOn, shelf.amount);
};

const paiseOf = (mrp: number): number => Math.round(mrp * 100);

/**
 * Unit price, ₹ per g to 2 dp, ROUND_HALF_UP, always derived never typed
 * (the label engine's rule). 249/250 → "1.00".
 */
export const unitPrice = (mrp: number, grams: number): string => {
  const hundredths = Math.floor(paiseOf(mrp) / grams + 0.5 + 1e-9);
  return (hundredths / 100).toFixed(2);
};

/** The exact figure beside the rounded one: 249/250 → 0.996. */
export const unitPriceExact = (mrp: number, grams: number): number => mrp / grams;

/** Packs → sheets, rounded up: 40 packs at 6-up → 7 sheets, 2 spare. */
export const sheetsNeeded = (packs: number, perSheet: number): { sheets: number; spare: number } => {
  const sheets = Math.ceil(packs / perSheet);
  return { sheets, spare: sheets * perSheet - packs };
};

export type MrpSource = 'price-book' | 'website' | 'typed' | 'missing';

/**
 * Where the MRP came from. An explicitly typed value (Custom) wins; otherwise
 * the admin price book, then the website fallback, else missing.
 */
export const mrpSource = (
  priceBook: number | null | undefined,
  fallback: number | null | undefined,
  typed: number | null | undefined,
): { mrp: number | null; source: MrpSource } => {
  if (typeof typed === 'number' && Number.isFinite(typed) && typed > 0) return { mrp: typed, source: 'typed' };
  if (typeof priceBook === 'number' && Number.isFinite(priceBook) && priceBook > 0)
    return { mrp: priceBook, source: 'price-book' };
  if (typeof fallback === 'number' && Number.isFinite(fallback) && fallback > 0)
    return { mrp: fallback, source: 'website' };
  return { mrp: null, source: 'missing' };
};
