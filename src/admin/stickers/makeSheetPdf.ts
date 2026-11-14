import { PDFDocument, rgb, type RGB } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { cellOrigin, GIFT_INK, type SheetSpec, type StampRow } from './sheetSpecs';

// Vector-only variable stamping for /admin/stickers.
//
// Every number that places ink comes from sheetSpecs.ts (measured from the
// shipped sheet PDFs); this file only draws. Values are glyph OUTLINES — no
// font object and no text operator is written for them, so nothing stamped is
// selectable or re-typesettable (CorelDraw rejected live text). RGB here; the
// print file still goes through tools/sheet_to_cmyk.py before print.
//
// All backs ship with no writing rules (owner, 2026-11-14): the value goes
// straight onto the label baseline and no paper is painted, because a paper
// band across the cream card would show. The rule-erase below stays for an
// old sheet that still carries rules, but every live layout lists none.
//
// Currency: the ART prints the rupee sign on the Date Bites container only
// ("MRP ₹"), so that layout sets currencyInArt. The five pouches set it false
// and the STAMPER draws the ₹. Exactly one side draws it, never both. GIFT and
// "for you" never take a rupee sign.
//
// Gift prints both money rows in italic, and its heart in the pack's own maroon.
// Blank fills only the two money rows (MRP and unit price) and leaves the batch
// and both dates empty, so those rows are simply not drawn.

const MM = 72 / 25.4;

/** Inter cap height / em (unitsPerEm 2048, capHeight 1490). */
const CAP_RATIO = 1490 / 2048;

/** How far the paper band reaches past the rule's drawn thickness, each side, mm. */
const RULE_ERASE_PAD = 0.15;

/** Gap between the heart and the "for you" it stands beside, mm. */
const HEART_GAP = 0.8;

/**
 * Air between a left-aligned gift lockup and the value column's right end, mm.
 * On the Date Bites container that end sits on the art's own column divider, so
 * a run ending flush touches the printed hairline.
 */
const RULE_END_PAD = 1.5;

/**
 * pdf-lib's writer hands the event loop back every `objectsPerTick` objects
 * (50 by default) with a `setTimeout(0)` tick. A browser clamps nested timers
 * to ~4 ms, so a 1,200-object sheet spends most of its save waiting on the
 * timer, not writing: 590 ms measured against 8 ms for the same bytes in one
 * slice. Nothing can paint during either version, so the tick only ever costs
 * time here. Keep it large enough to never fire.
 */
const SERIALIZE_OBJECTS_PER_TICK = 1_000_000;

/**
 * The gift heart. A y-down 24-box path whose ink runs x 2–22 and y 3–21.4, so
 * it is 20 wide and 18.4 tall in path units: a scale of capPt / 18.4 makes it
 * exactly one cap height. (pdf-lib's `scale` is in points, not mm — the old
 * 1.08-cap heart was drawn at a third of its intended size because of that.)
 */
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

  const gift = isGift(values);
  const assets = await load(spec);

  // Nothing to print: a back the page has no values for yet. The art is already
  // the answer, so it goes back byte-identical and no font is parsed.
  if (!gift && !stamp.rows.some((row) => filled(bare(rawFor(values, row))))) {
    return new Uint8Array(assets.basePdf);
  }

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
  const giftInk = hex(GIFT_INK);
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

    // A gift pack must not keep the priced build's own words (the 250 g gift
    // twins are that art with them taken out). Cover them with the card first.
    if (gift) {
      for (const cover of stamp.giftCover ?? []) {
        page.drawRectangle({
          x: (x0 + cover.x) * MM,
          y: pageH - (y0 + cover.y + cover.h) * MM,
          width: cover.w * MM,
          height: cover.h * MM,
          color: paper,
        });
      }
    }

    // Legacy erase for a sheet that still carries gold writing rules: cover
    // the rule band with paper before the value goes above it. Only the
    // rule band — never the whole row: the card's gradient must survive.
    // Every live sheet lists no rules, so this draws nothing.
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
        // An inline lockup: "for you ♥" — both on the row's baseline, the heart
        // one cap height tall so it reads with the words instead of floating
        // over the corner. The heart's right edge lands on the value column, so
        // a gift line ends where a priced one would.
        // The heart follows the words, never leads them (owner, 2026-11-10): the
        // pair reads as one run of type that happens to end in a heart.
        // A right-aligned sheet's value column ends at valueRight. A left-aligned
        // one has no right anchor in its rows, so use the value column's right
        // edge (valueRight doubles as the gift lockup anchor there); anchoring
        // to the left edge instead put "for you" on top of the row label.
        const lockupRight = align === 'right'
          ? x0 + (stamp.valueRight as number)
          : x0 + (stamp.valueRight ?? stamp.rules[ri]?.x1 ?? (stamp.valueLeft as number)) - RULE_END_PAD;
        const heartScale = (row.pt * CAP_RATIO) / 18.4;
        const heartLeftPt = lockupRight * MM - 20 * heartScale;
        drawRun(page, text, heartLeftPt / MM - HEART_GAP, baseline, row.pt, fonts.italic, ink, pageH, 'right');
        // pdf-lib maps a path point (px, py) to (x + px·s, y − py·s): the ink's
        // left edge is x + 2s and its seat on the baseline is y − 21.4s.
        page.drawSvgPath(HEART_PATH, {
          x: heartLeftPt - 2 * heartScale,
          y: pageH - baseline * MM + 21.4 * heartScale,
          scale: heartScale,
          color: giftInk,
        });
        continue;
      }

      drawRun(
        page,
        withRupee(row, text),
        anchor,
        baseline,
        row.pt,
        // Gift is set in italic on both money rows: "GIFT" over "for you ♥".
        gift && row.key === 'mrp' ? fonts.italic : faceFont(row, fonts),
        ink,
        pageH,
        align,
      );
    }
  }
  return doc.save({ useObjectStreams: true, objectsPerTick: SERIALIZE_OBJECTS_PER_TICK });
};

