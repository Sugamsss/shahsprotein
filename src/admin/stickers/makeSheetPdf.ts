import { PDFDocument, rgb, type RGB } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { cellOrigin, type SheetSpec, type StampRow } from './sheetSpecs';

// Vector-only variable stamping for /admin/stickers.
//
// Every number that places ink comes from sheetSpecs.ts (measured from the
// shipped sheet PDFs); this file only draws. Values are glyph OUTLINES — no
// font object and no text operator is written for them, so nothing stamped is
// selectable or re-typesettable (CorelDraw rejected live text). RGB here; the
// print file still goes through tools/sheet_to_cmyk.py before print.
//
// Two arrangements exist on the art:
//   * backs with gold writing rules (250 g pouches, Date Bites container): the
//     rule is covered with the card's paper hex first, then the value is drawn
//     above it on the row's baseline;
//   * backs with no rules (the 100 g pouches): the value goes straight onto
//     the label baseline and no paper is painted, because a paper band across
//     the cream card would show.
//
// Currency: the ART prints the rupee sign on the Date Bites container only
// ("MRP ₹"), so that layout sets currencyInArt. The five pouches set it false
// and the STAMPER draws the ₹. Exactly one side draws it, never both. GIFT and
// "for you" never take a rupee sign.

const MM = 72 / 25.4;

/** Inter cap height / em (unitsPerEm 2048, capHeight 1490). */
const CAP_RATIO = 1490 / 2048;

/** How far the paper band reaches past the rule's drawn thickness, each side, mm. */
const RULE_ERASE_PAD = 0.15;

/** "for you" ends this far left of the heart (the label engine's own lockup). */
const HEART_GAP = 0.8;

/** The gift heart, a 24-box y-down path from the label engine. */
const HEART_PATH =
  'M12 21.4l-1.4-1.3C5.4 15.4 2 12.3 2 8.5 2 5.4 4.4 3 7.5 3c1.7 0 3.4.8 4.5 2.1C13.1 3.8 14.8 3 16.5 3 19.6 3 22 5.4 22 8.5c0 3.8-3.4 6.9-8.6 11.6z';

/** Font files stay where they are (public/assets/stickers/). */
export const STICKER_FONTS = {
  semiBold: '/assets/stickers/inter-semibold-stickers-v1.ttf',
  bold: '/assets/stickers/inter-bold-stickers-v1.ttf',
  italic: '/assets/stickers/inter-italic-stickers-v1.ttf',
} as const;

/**
 * The bare values on the sticker. The page formats them; the stamper only
 * decides the rupee sign (from the layout) and the gift wording.
 */
export interface StampValues {
  /** "249.00" or "GIFT". No rupee sign. */
  mrp: string;
  /** "1.00 per g" or "for you". No rupee sign. */
  unit: string;
  /** True for a gift pack: MRP prints GIFT, the unit row prints "for you" + heart. */
  gift?: boolean;
  /** @deprecated old name for `gift`; kept so a caller mid-update still builds. */
  unitIsGift?: boolean;
  /** "R09112026". */
  batch: string;
  /** DD-MM-YYYY. */
  madeOn: string;
  /** DD-MM-YYYY. */
  useBy: string;
}

export interface SheetAssets {
  basePdf: ArrayBuffer;
  semiBold: ArrayBuffer;
  bold: ArrayBuffer;
  italic: ArrayBuffer;
}

/** Injectable for tests/proof scripts; the page uses the fetch default. */
export type AssetLoader = (spec: SheetSpec) => Promise<SheetAssets>;

const fetchBytes = async (url: string): Promise<ArrayBuffer> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`sticker asset missing: ${url}`);
  return res.arrayBuffer();
};

const loadStickerAssets: AssetLoader = async (spec) => {
  const [basePdf, semiBold, bold, italic] = await Promise.all([
    fetchBytes(spec.asset),
    fetchBytes(STICKER_FONTS.semiBold),
    fetchBytes(STICKER_FONTS.bold),
    fetchBytes(STICKER_FONTS.italic),
  ]);
  return { basePdf, semiBold, bold, italic };
};

type KitFont = ReturnType<typeof fontkit.create>;
type Page = ReturnType<PDFDocument['addPage']>;

// The bundled types omit the runtime's affine helpers (scale/transform),
// which the outline step needs. Declared here, not widened elsewhere.
interface FlippablePath { scale: (sx: number, sy?: number) => { toSVG: () => string } }

const hex = (hexColour: string): RGB => {
  const n = Number.parseInt(hexColour.replace('#', ''), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

const isGift = (values: StampValues): boolean => values.gift ?? values.unitIsGift ?? false;

/** A value is printed only when the page actually filled it in. */
const filled = (text: string): boolean => text.trim().length > 0;

/** Older callers passed "₹249.00"; strip that one sign so a currency never doubles. */
const bare = (value: string): string => value.trim().replace(/^₹\s*/, '');

/**
 * One run of glyph outlines. `anchor` is the edge the run ends on: 'right'
 * ends at xAnchor, 'left' starts there. Returns the run's width in mm.
 */
const drawRun = (
  page: Page,
  text: string,
  xAnchorMm: number,
  baselineMm: number,
  pt: number,
  font: KitFont,
  ink: RGB,
  pageHeight: number,
  anchor: 'right' | 'left',
): number => {
  const run = font.layout(text);
  const totalPt = (run.advanceWidth / font.unitsPerEm) * pt;
  let x = anchor === 'right' ? xAnchorMm * MM - totalPt : xAnchorMm * MM;
  const y = pageHeight - baselineMm * MM;
  const scale = pt / font.unitsPerEm;
  for (const glyph of run.glyphs) {
    const flipped = (glyph.path as unknown as FlippablePath).scale(1, -1).toSVG();
    page.drawSvgPath(flipped, { x, y, scale, color: ink });
    x += (glyph.advanceWidth / font.unitsPerEm) * pt;
  }
  return totalPt / MM;
};

const faceFont = (row: StampRow, fonts: { semi: KitFont; bold: KitFont; italic: KitFont }): KitFont =>
  row.face === 'bold' ? fonts.bold : row.face === 'italic' ? fonts.italic : fonts.semi;

const rawFor = (values: StampValues, row: StampRow): string => {
  switch (row.key) {
    case 'mrp': return values.mrp;
    case 'unit': return values.unit;
    case 'batch': return values.batch;
    case 'made': return values.madeOn;
    case 'useBy': return values.useBy;
  }
};

/**
 * Stamps the variable values onto every cell of a back sheet as glyph
 * outlines. A spec with no stamp (every front) returns the shipped asset
 * untouched; a back with no stamp throws rather than print a blank field.
 */
export const makeSheetPdf = async (
  values: StampValues,
  spec: SheetSpec,
  load: AssetLoader = loadStickerAssets,
): Promise<Uint8Array> => {
  const stamp = spec.stamp;
  if (!stamp) {
    if (spec.side !== 'front') throw new Error(`sticker sheet ${spec.id} has no stamp geometry`);
    const assets = await load(spec);
    return new Uint8Array(assets.basePdf);
  }

  if (stamp.rules.length > 0 && stamp.rules.length !== stamp.rows.length) {
    throw new Error(`sticker sheet ${spec.id}: rules must pair 1:1 with rows`);
  }

  const assets = await load(spec);
  const doc = await PDFDocument.load(new Uint8Array(assets.basePdf));
  doc.registerFontkit(fontkit);
  const fonts = {
    semi: fontkit.create(new Uint8Array(assets.semiBold)) as KitFont,
    bold: fontkit.create(new Uint8Array(assets.bold)) as KitFont,
    italic: fontkit.create(new Uint8Array(assets.italic)) as KitFont,
  };

  const page = doc.getPages()[0];
  const pageH = page.getHeight();
  const paper = hex(stamp.paper);
  const ink = hex(stamp.ink);
  const gift = isGift(values);
  const align = stamp.align;
  if ((align === 'right' && stamp.valueRight == null) || (align === 'left' && stamp.valueLeft == null)) {
    throw new Error(`sticker sheet ${spec.id}: ${align} alignment needs its anchor`);
  }

  /** What this row prints, or null when the page left it blank. */
  const textFor = (row: StampRow): string | null => {
    if (gift && row.key === 'mrp') return 'GIFT';
    if (gift && row.key === 'unit') return 'for you';
    const text = bare(rawFor(values, row));
    return filled(text) ? text : null;
  };

  /**
   * "₹" belongs to the stamper only on the two money rows, and only where the
   * art does not already print it. Never on gift. Gating on "starts with a
   * digit" instead put a rupee in front of the dates (₹09-11-2026).
   */
  const MONEY_ROWS = new Set(['mrp', 'unit']);
  const withRupee = (row: StampRow, text: string): string =>
    stamp.currencyInArt || gift || !MONEY_ROWS.has(row.key) ? text : `₹${text}`;

  for (let i = 0; i < spec.cells; i++) {
    const [bleedX, bleedY] = cellOrigin(spec, i);
    const x0 = bleedX + spec.bleed;
    const y0 = bleedY + spec.bleed;

    // Cover the gold writing rule before the value goes above it. Only the
    // rule band — never the whole row: the card's gradient must survive.
    stamp.rows.forEach((row, index) => {
      const rule = stamp.rules[index];
      if (!rule || !textFor(row)) return;
      const pad = rule.thickness / 2 + RULE_ERASE_PAD;
      page.drawRectangle({
        x: (x0 + rule.x0) * MM,
        y: pageH - (y0 + rule.y + pad) * MM,
        width: (rule.x1 - rule.x0) * MM,
        height: pad * 2 * MM,
        color: paper,
      });
    });

    for (let ri = 0; ri < stamp.rows.length; ri++) {
      const row = stamp.rows[ri];
      const text = textFor(row);
      if (!text) continue;
      const baseline = y0 + row.baseline;
      const anchor = align === 'right' ? x0 + (stamp.valueRight as number) : x0 + (stamp.valueLeft as number);

      if (row.key === 'unit' && gift) {
        // The label engine's lockup: heart flush on the value column, the
        // words ending HEART_GAP to its left. Values: cap = the row's cap
        // height, k = cap * 1.08 / 18.4 (heart height 1.08 cap, path 18.4 tall).
        const capMm = (row.pt / 72) * 25.4 * CAP_RATIO;
        const k = (capMm * 1.08) / 18.4;
        // A right-aligned sheet's value column ends at valueRight. A left-aligned
        // one has no right anchor, so use the writing rule's right end; anchoring
        // to the left edge instead put "for you" on top of the row label.
        const lockupRight = align === 'right'
          ? x0 + (stamp.valueRight as number)
          : x0 + (stamp.rules[ri]?.x1 ?? (stamp.valueLeft as number));
        const heartX = lockupRight - 20 * k;
        drawRun(page, text, heartX - HEART_GAP, baseline, row.pt, fonts.italic, ink, pageH, 'right');
        page.drawSvgPath(HEART_PATH, {
          x: (heartX - 2 * k) * MM,
          y: pageH - (baseline - capMm - 3 * k) * MM,
          scale: k,
          color: ink,
        });
        continue;
      }

      drawRun(
        page,
        withRupee(row, text),
        anchor,
        baseline,
        row.pt,
        faceFont(row, fonts),
        ink,
        pageH,
        align,
      );
    }
  }
  return doc.save({ useObjectStreams: true });
};

