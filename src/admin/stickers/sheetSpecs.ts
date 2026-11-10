// Sheet registry for /admin/stickers.
//
// WHY THIS FILE EXISTS
// One blank print sheet per pack version lives in public/assets/stickers/. A
// sticker is made by stamping the variable values (MRP, unit price, batch, made
// on, use by) onto every cell of that sheet as glyph OUTLINES. This file holds
// where "every cell" is and where each value row sits. There are no numbers in
// the page or the PDF writer — they all come from here, so a wrong number is
// fixed in one place.
//
// HOW THE CELL GEOMETRY WAS MEASURED (do not re-derive by eye)
// Every sheet places one Form XObject per sticker. pikepdf gives that object's
// /Matrix; the translate part is the top-left of the cell's BLEED box in sheet
// mm (y measured down from the sheet top, i.e. the print-view convention the
// label repo's tools/build_sheet.py uses). Pitch equals the bleed box size.
// Trim origin = bleed origin + bleed on both axes.
//
// HOW THE STAMP GEOMETRY WAS MEASURED
// From the same PDFs' vector content (the gold hairline rules under each value
// field), in label-local mm from the TRIM top-left, y down. Each entry in STAMP
// carries its own source note. A back with no STAMP entry must refuse to build —
// see makeSheetPdf.ts. Never invent a row.
//
// Sides: fronts print no variable data, so their spec carries stamp: null and
// the sheet is returned byte-identical. The Date Bites 250 g pack is the
// container sticker and has no front.

import type { StickerProductId } from './stickerMath';

export type StickerSide = 'front' | 'back';

export type SheetId =
  | 'rj-250g-back'
  | 'ms-250g-back'
  | 'rj-100g-back'
  | 'ms-100g-back'
  | 'db-100g-back'
  | 'db-250g-container'
  | 'rj-250g-front'
  | 'ms-250g-front'
  | 'rj-100g-front'
  | 'ms-100g-front'
  | 'db-100g-front';

/** Which value a row prints. The order here is the order on the sticker. */
export type StampKey = 'mrp' | 'unit' | 'batch' | 'made' | 'useBy';

export type StampFace = 'bold' | 'semi' | 'italic';

export interface StampRow {
  key: StampKey;
  /** Baseline, label-local mm from the trim top. */
  baseline: number;
  /** Type size in points (before any document scale). */
  pt: number;
  face: StampFace;
}

/** One gold hairline the value is written over. Erase it before stamping. */
export interface StampRule {
  /** Rule centre, label-local mm from the trim top. */
  y: number;
  /** Label-local mm. */
  x0: number;
  x1: number;
  /** Drawn thickness, mm. The erase band is a little taller than this. */
  thickness: number;
}

export interface StampLayout {
  /** Which edge the value run is anchored to. */
  align: 'right' | 'left';
  /** Right edge of a right-aligned run, label-local mm from the trim left. */
  valueRight?: number;
  /** Left edge of a left-aligned run (the Date Bites container only). */
  valueLeft?: number;
  rows: StampRow[];
  /** Rules to erase where a value is printed. Empty when the art has none. */
  rules: StampRule[];
  /** Hex of the paper behind the values, used to cover the rules. */
  paper: string;
  /** Hex of the value ink (the art's own ink). */
  ink: string;
  /**
   * Whether the ART already prints the rupee sign on both money labels
   * ("MRP ₹", "Unit Sale Price ₹" — the Date Bites container only). When
   * false the stamper draws one; never both. GIFT and "for you" never take
   * a rupee sign either way.
   */
  currencyInArt: boolean;
}

export interface SheetSpec {
  id: SheetId;
  side: StickerSide;
  /** File under public/assets/stickers/. */
  asset: string;
  /** Gift-blank twin, used when the MRP mode is Gift. Absent = no gift art. */
  giftAsset?: string;
  /** Cells on page 1, laid out row-major: `cols` across, then down. */
  cols: number;
  rowsCount: number;
  cells: number;
  /** Top-left of cell 1's bleed box, sheet mm from the sheet top-left. */
  bleedOrigin: readonly [number, number];
  /** Cell pitch = bleed box size, sheet mm. */
  pitch: readonly [number, number];
  /** Print size, mm. */
  trim: readonly [number, number];
  /** Bleed on each edge, mm. */
  bleed: number;
  /** null = nothing variable prints on this sheet. */
  stamp: StampLayout | null;
}

const spec = (s: SheetSpec): SheetSpec => s;

// -------------------------------------------------------------------------
// STAMP GEOMETRY (measured 2026-11-10)
//
// Label-local mm, origin at the trim top-left of one sticker, y down. Every
// number was measured from ink in the shipped sheet PDFs at 1200 dpi and then
// confirmed by diffing the stamped sheet against the approved delivery. Full
// table, method and the proof: temp/stickers/SPEC-GEOMETRY.md plus
// temp/stickers/geo/RESULT.md in shahsnutrition-design. Do not nudge by eye.
//
// On all five pouches the value baseline is the row label's own baseline
// (value baseline = label baseline, verified within 0.02 mm on every row).
// The gold writing rule sits 0.24 mm below that baseline, so the glyphs clear
// the line without touching it.
//
// The three 100 g pouch backs carry NO rules (their configs set
// `no_stamp_rules`), so their `rules` list is empty and nothing is erased.
// Their MRP labels keep "(incl. of all taxes)" inline on the same line, which
// leaves only the width between that note and valueRight free.
//
// `rules` is always one entry per row, in row order: the stamper pairs
// rules[i] with rows[i]. A layout with rules must list five.

/**
 * The ink every stamped value uses: pure black (owner, 2026-11-10).
 *
 * The approved deliveries stamped #262426, the body-copy near-black. The owner
 * asked for fully black instead, and it is the better print choice: #000000
 * converts to K only, so the numbers stay sharp without four-plate
 * registration on a small sticker. Do not "correct" this back to #262426 —
 * that is a measured fact about the old files, not a rule.
 */
const VALUE_INK = '#000000';

/** 250 g pouches (Raggi Jaggi + Muesli): 2 x 3, trim 114 x 142. */
const stamp250g = (): StampLayout => ({
  align: 'right',
  valueRight: 73.8,
  rows: [
    { key: 'mrp', baseline: 119.573, pt: 9.0, face: 'bold' },
    { key: 'unit', baseline: 123.673, pt: 5.2, face: 'semi' },
    { key: 'batch', baseline: 126.073, pt: 5.2, face: 'semi' },
    { key: 'made', baseline: 128.473, pt: 5.2, face: 'semi' },
    { key: 'useBy', baseline: 130.873, pt: 5.2, face: 'semi' },
  ],
  rules: [
    { y: 119.819, x0: 58.17, x1: 73.8, thickness: 0.17 },
    { y: 123.919, x0: 58.17, x1: 73.8, thickness: 0.17 },
    { y: 126.319, x0: 58.17, x1: 73.8, thickness: 0.17 },
    { y: 128.719, x0: 58.17, x1: 73.8, thickness: 0.17 },
    { y: 131.119, x0: 58.17, x1: 73.8, thickness: 0.17 },
  ],
  paper: '#FCF9F0',
  ink: VALUE_INK,
  currencyInArt: false,
});

/** 250 g — Raggi Jaggi and Muesli: one block, because the value ink is shared. */
const STAMP_RJ_250G = stamp250g();
const STAMP_MS_250G = stamp250g();

/** 100 g pouch backs (93.75 x 127.5) — Raggi Jaggi: MRP 7.8, rest 6.0 pt. */
const STAMP_RJ_100G: StampLayout = {
  align: 'right',
  valueRight: 60.4,
  rows: [
    { key: 'mrp', baseline: 105.071, pt: 7.8, face: 'bold' },
    { key: 'unit', baseline: 107.821, pt: 6.0, face: 'semi' },
    { key: 'batch', baseline: 110.571, pt: 6.0, face: 'semi' },
    { key: 'made', baseline: 113.321, pt: 6.0, face: 'semi' },
    { key: 'useBy', baseline: 116.071, pt: 6.0, face: 'semi' },
  ],
  rules: [],
  paper: '#FCF9F0',
  ink: VALUE_INK,
  currencyInArt: false,
};

/** 100 g pouch backs — Muesli: MRP 8.25, rest 6.35 pt, its own column. */
const STAMP_MS_100G: StampLayout = {
  align: 'right',
  valueRight: 59.2,
  rows: [
    { key: 'mrp', baseline: 104.373, pt: 8.25, face: 'bold' },
    { key: 'unit', baseline: 107.273, pt: 6.35, face: 'semi' },
    { key: 'batch', baseline: 110.173, pt: 6.35, face: 'semi' },
    { key: 'made', baseline: 113.073, pt: 6.35, face: 'semi' },
    { key: 'useBy', baseline: 115.973, pt: 6.35, face: 'semi' },
  ],
  rules: [],
  paper: '#FCF9F0',
  ink: VALUE_INK,
  currencyInArt: false,
};

/** 100 g pouch backs — Date Bites: MRP 8.25, rest 6.35 pt, own column. */
const STAMP_DB_100G: StampLayout = {
  align: 'right',
  valueRight: 61.2,
  rows: [
    { key: 'mrp', baseline: 104.273, pt: 8.25, face: 'bold' },
    { key: 'unit', baseline: 107.173, pt: 6.35, face: 'semi' },
    { key: 'batch', baseline: 110.073, pt: 6.35, face: 'semi' },
    { key: 'made', baseline: 112.973, pt: 6.35, face: 'semi' },
    { key: 'useBy', baseline: 115.873, pt: 6.35, face: 'semi' },
  ],
  rules: [],
  paper: '#FCF9F0',
  ink: VALUE_INK,
  currencyInArt: false,
};

/**
 * Date Bites container (96.6 x 82.8): five rows in a different order — Batch,
 * Mfg, Use By, then MRP and Unit Sale Price — left-aligned, with plain writing
 * rules that are erased under a filled value. Both money labels already print
 * their own rupee sign ("MRP ₹"), so the stamper draws none here.
 *
 * The rules are read off the current blank asset (db-250g-container-15up-v1),
 * not the 2026-10-25 notes: three of that build's rules sit 0.688 mm lower
 * than this asset's. A value sits 0.231 mm above its rule's centre line
 * (baseline = y - 0.231), the same gap the pouches have.
 */
const STAMP_CONTAINER: StampLayout = {
  align: 'left',
  valueLeft: 22.353,
  rows: [
    { key: 'batch', baseline: 26.049, pt: 6.9, face: 'semi' },
    { key: 'made', baseline: 30.282, pt: 6.9, face: 'semi' },
    { key: 'useBy', baseline: 34.505, pt: 6.9, face: 'semi' },
    { key: 'mrp', baseline: 38.738, pt: 7.82, face: 'bold' },
    { key: 'unit', baseline: 42.972, pt: 6.9, face: 'semi' },
  ],
  rules: [
    { y: 26.28, x0: 20.05, x1: 47.482, thickness: 0.17 },
    { y: 30.513, x0: 20.05, x1: 47.482, thickness: 0.17 },
    { y: 34.736, x0: 20.05, x1: 47.482, thickness: 0.17 },
    { y: 38.969, x0: 20.05, x1: 47.482, thickness: 0.17 },
    { y: 43.203, x0: 20.05, x1: 47.482, thickness: 0.17 },
  ],
  paper: '#FCF9F0',
  ink: VALUE_INK,
  currencyInArt: true,
};

export const SHEET_SPECS: Record<SheetId, SheetSpec> = {
  // 250 g backs — 6-up, 2 x 3. bleed 2, trim 114 x 142.
  'rj-250g-back': spec({
    id: 'rj-250g-back', side: 'back', asset: '/assets/stickers/rj-250g-back-6up-blank-v1.pdf',
    giftAsset: '/assets/stickers/rj-250g-back-6up-gift-v1.pdf',
    cols: 2, rowsCount: 3, cells: 6,
    bleedOrigin: [34.4, 9.6], pitch: [118, 146], trim: [114, 142], bleed: 2,
    stamp: STAMP_RJ_250G,
  }),
  'ms-250g-back': spec({
    id: 'ms-250g-back', side: 'back', asset: '/assets/stickers/ms-250g-back-6up-template-v1.pdf',
    giftAsset: '/assets/stickers/ms-250g-back-6up-gift-v1.pdf',
    cols: 2, rowsCount: 3, cells: 6,
    bleedOrigin: [34.4, 9.6], pitch: [118, 146], trim: [114, 142], bleed: 2,
    stamp: STAMP_MS_250G,
  }),
  // 100 g backs — 9-up, 3 x 3. bleed 2, trim 93.75 x 127.5.
  'rj-100g-back': spec({
    id: 'rj-100g-back', side: 'back', asset: '/assets/stickers/rj-100g-back-9up-v1.pdf',
    giftAsset: '/assets/stickers/rj-100g-back-9up-gift-v1.pdf',
    cols: 3, rowsCount: 3, cells: 9,
    bleedOrigin: [5.775, 31.35], pitch: [97.74, 131.5], trim: [93.75, 127.5], bleed: 2,
    stamp: STAMP_RJ_100G,
  }),
  'ms-100g-back': spec({
    id: 'ms-100g-back', side: 'back', asset: '/assets/stickers/ms-100g-back-9up-v1.pdf',
    giftAsset: '/assets/stickers/ms-100g-back-9up-gift-v1.pdf',
    cols: 3, rowsCount: 3, cells: 9,
    bleedOrigin: [5.775, 31.35], pitch: [97.74, 131.5], trim: [93.75, 127.5], bleed: 2,
    stamp: STAMP_MS_100G,
  }),
  'db-100g-back': spec({
    id: 'db-100g-back', side: 'back', asset: '/assets/stickers/db-100g-back-9up-v1.pdf',
    giftAsset: '/assets/stickers/db-100g-back-9up-gift-v1.pdf',
    cols: 3, rowsCount: 3, cells: 9,
    bleedOrigin: [5.775, 31.35], pitch: [97.74, 131.5], trim: [93.75, 127.5], bleed: 2,
    stamp: STAMP_DB_100G,
  }),
  // Date Bites container — 15-up, 3 x 5, single sided. bleed 1.84, trim 96.6 x 82.8.
  'db-250g-container': spec({
    id: 'db-250g-container', side: 'back', asset: '/assets/stickers/db-250g-container-15up-v1.pdf',
    giftAsset: '/assets/stickers/db-250g-container-15up-gift-v1.pdf',
    cols: 3, rowsCount: 5, cells: 15,
    bleedOrigin: [1.98, 12.4], pitch: [100.28, 86.48], trim: [96.6, 82.8], bleed: 1.84,
    stamp: STAMP_CONTAINER,
  }),
  // Fronts — nothing variable. 250 g 8-up (2 x 4, bleed 3, trim 120 x 100).
  'rj-250g-front': spec({
    id: 'rj-250g-front', side: 'front', asset: '/assets/stickers/rj-250g-front-8up-v1.pdf',
    cols: 2, rowsCount: 4, cells: 8,
    bleedOrigin: [26.4, 16.6], pitch: [126, 106], trim: [120, 100], bleed: 3,
    stamp: null,
  }),
  'ms-250g-front': spec({
    id: 'ms-250g-front', side: 'front', asset: '/assets/stickers/ms-250g-front-8up-v1.pdf',
    cols: 2, rowsCount: 4, cells: 8,
    bleedOrigin: [26.4, 16.6], pitch: [126, 106], trim: [120, 100], bleed: 3,
    stamp: null,
  }),
  // 100 g fronts — 12-up, 2 x 6, bleed 2, trim 112.5 x 67.5.
  'rj-100g-front': spec({
    id: 'rj-100g-front', side: 'front', asset: '/assets/stickers/rj-100g-front-12up-v1.pdf',
    cols: 2, rowsCount: 6, cells: 12,
    bleedOrigin: [35.9, 14.1], pitch: [116.5, 71.5], trim: [112.5, 67.5], bleed: 2,
    stamp: null,
  }),
  'ms-100g-front': spec({
    id: 'ms-100g-front', side: 'front', asset: '/assets/stickers/ms-100g-front-12up-v1.pdf',
    cols: 2, rowsCount: 6, cells: 12,
    bleedOrigin: [35.9, 14.1], pitch: [116.5, 71.5], trim: [112.5, 67.5], bleed: 2,
    stamp: null,
  }),
  'db-100g-front': spec({
    id: 'db-100g-front', side: 'front', asset: '/assets/stickers/db-100g-front-12up-v1.pdf',
    cols: 2, rowsCount: 6, cells: 12,
    bleedOrigin: [35.9, 14.1], pitch: [116.5, 71.5], trim: [112.5, 67.5], bleed: 2,
    stamp: null,
  }),
};

/**
 * Which sheet a pick prints on, or null when that combination does not exist.
 * The Date Bites 250 g is the plastic container, which has one sticker and no
 * front. 500 g is deliberately absent: only recovered artwork exists for it.
 */
export const specFor = (
  productId: StickerProductId,
  size: '100 g' | '250 g',
  side: StickerSide,
  mode: 'default' | 'gift' | 'custom' = 'default',
): SheetSpec | null => {
  const found = productId === 'bites' && size === '250 g'
    ? (side === 'back' ? SHEET_SPECS['db-250g-container'] : null)
    : SHEET_SPECS[`${productId === 'raggi-jaggi' ? 'rj' : productId === 'muesli' ? 'ms' : 'db'}-${size === '250 g' ? '250g' : '100g'}-${side}` as SheetId] ?? null;
  if (!found) return null;
  // A front prints nothing variable, so the kind never changes its art.
  if (found.side === 'front') return found;
  // Gift swaps in the gift-blank twin. With no gift art there is no honest
  // gift sticker: refuse rather than stamp GIFT onto priced art.
  if (mode === 'gift') return found.giftAsset ? { ...found, asset: found.giftAsset } : null;
  return found;
}

/** Which pack kinds a sheet can print, from its own art and the prices we have. */
export const modeOptionsFor = (spec: SheetSpec | null, hasLivePrice: boolean) => {
  const stamps = spec?.stamp != null;
  return {
    default: stamps && hasLivePrice,
    gift: stamps && Boolean(spec?.giftAsset),
    custom: stamps,
  };
};

export type ModeOptions = ReturnType<typeof modeOptionsFor>;

/** Cell i (0-based, row-major) → top-left of that cell's bleed box, sheet mm. */
export const cellOrigin = (s: SheetSpec, i: number): [number, number] => [
  s.bleedOrigin[0] + (i % s.cols) * s.pitch[0],
  s.bleedOrigin[1] + Math.floor(i / s.cols) * s.pitch[1],
];

/** Top-left of one cell's TRIM box, sheet mm — the crop for the sticker preview. */
export const cellTrimOrigin = (s: SheetSpec, i = 0): [number, number] => {
  const [x, y] = cellOrigin(s, i);
  return [x + s.bleed, y + s.bleed];
};
