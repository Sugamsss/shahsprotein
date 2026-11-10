// Sticker date, batch, price and sheet rules for /admin/stickers.
// Pure functions only (no React, no copy): every rule Sunit relies on is
// tested in stickerMath.test.ts. Dates are India calendar days "YYYY-MM-DD".

/**
 * Admin product id → batch prefix, the kitchen's own (20261104000000):
 * R and M, and nothing for Date Bites. A number is the prefix plus DDMMYY, so
 * Raggi Jaggi made on 9-11-2026 is R091126. If this drifts from
 * kitchen_products.batch_prefix the sticker and the kitchen disagree.
 */
export const BATCH_PREFIX = {
  'raggi-jaggi': 'R',
  muesli: 'M',
  bites: '',
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

export type ShelfLife = { amount: number; unit: 'days' | 'months' };

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
 * The kitchen's batch number: prefix + DDMMYY of the made-on day, with -2, -3
 * for a second or third batch of that product that day
 * (migration 20261104000000). batchCode("R", "2026-11-09") → "R091126";
 * batchCode("", "2026-11-09") → "091126" (Date Bites has no letter).
 */
export const batchCode = (prefix: string, madeOn: string, sequence = 1): string => {
  const [y, m, d] = madeOn.split('-');
  const suffix = sequence > 1 ? `-${sequence}` : '';
  return `${prefix}${d}${m}${y.slice(2)}${suffix}`;
};

/**
 * Which batch of that product on that day this is, from the kitchen's own
 * numbers: no batch logged, or the first one, is 1; R091126-2 is 2. The page
 * starts from the newest batch the cook logged, so the sticker and the order
 * view print the same handful of characters.
 */
export const batchSequenceFor = (prefix: string, madeOn: string, codes: readonly string[]): number => {
  const base = batchCode(prefix, madeOn);
  let highest = 0;
  for (const code of codes) {
    if (code === base) { highest = Math.max(highest, 1); continue; }
    if (!code.startsWith(`${base}-`)) continue;
    const n = Number(code.slice(base.length + 1));
    if (Number.isInteger(n) && n > 1) highest = Math.max(highest, n);
  }
  return highest || 1;
};

/**
 * Use By is the kitchen's Exp: the last good day, the day before the first
 * past one (`expDay` in the admin: expires_on − 1), never the expiry day
 * itself. A 6-month shelf life from 9-11-2026 expires on 9-5-2027, so the
 * sticker says use by 8-5-2027. Pass the kitchen row's own shelf life when it
 * is loaded, so an owner's change there reaches the label.
 */
export const useByFrom = (shelf: ShelfLife, madeOn: string): string => {
  const expiresOn = shelf.unit === 'months' ? addMonthsClamp(madeOn, shelf.amount) : addDays(madeOn, shelf.amount);
  return addDays(expiresOn, -1);
};

/** The label rule's own shelf life, for a page that has not got the kitchen row yet. */
export const useByDate = (productId: StickerProductId, madeOn: string): string =>
  useByFrom(SHELF_LIFE[productId], madeOn);

const paiseOf = (mrp: number): number => Math.round(mrp * 100);

/**
 * Unit price, ₹ per g to 2 dp, ROUND_HALF_UP, always derived never typed
 * (the label engine's rule). 249/250 → "1.00".
 */
export const unitPrice = (mrp: number, grams: number): string => {
  const hundredths = Math.floor(paiseOf(mrp) / grams + 0.5 + 1e-9);
  return (hundredths / 100).toFixed(2);
};

/** Packs → sheets, rounded up: 40 packs at 6-up → 7 sheets, 2 spare. */
export const sheetsNeeded = (packs: number, perSheet: number): { sheets: number; spare: number } => {
  const sheets = Math.ceil(packs / perSheet);
  return { sheets, spare: sheets * perSheet - packs };
};

export type MrpSource = 'printed' | 'typed' | 'missing';

/**
 * Where the MRP came from. An explicitly typed value (Custom) wins; otherwise
 * the MRP printed on the pack, founder-locked in products.ts. Never the site's
 * price list: that can lag behind the packs, and a wrong MRP on a label is a
 * legal problem, not a display one.
 */
export const mrpSource = (
  printed: number | null | undefined,
  typed: number | null | undefined,
): { mrp: number | null; source: MrpSource } => {
  if (typeof typed === 'number' && Number.isFinite(typed) && typed > 0) return { mrp: typed, source: 'typed' };
  if (typeof printed === 'number' && Number.isFinite(printed) && printed > 0)
    return { mrp: printed, source: 'printed' };
  return { mrp: null, source: 'missing' };
};
