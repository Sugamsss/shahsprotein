import { describe, expect, it, vi } from 'vitest';
import { PDFDocument, PDFPage, rgb } from 'pdf-lib';
import { makeSheetPdf, type SheetAssets } from './makeSheetPdf';
import { FRONT_PAPER_RGB, specFor, type SheetSpec } from './sheetSpecs';

// What this can check without the 4.3 MB print assets on disk: the shapes of
// the paths that do no glyph work. The stamping itself — GIFT and "for you" in
// italic, the maroon heart, the tax line covered, and Blank printing just its
// two money rows — is checked by the proof driver in temp/sticker-gift/, which
// builds the real sheet and looks at it.

const blankSheet = async (): Promise<ArrayBuffer> => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([864, 1296]);
  page.drawRectangle({ x: 0, y: 0, width: 864, height: 1296, color: rgb(0.99, 0.98, 0.94) });
  const bytes = await doc.save();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
};

/** No fonts at all: enough for every path that draws no glyph. */
const loader = (basePdf: ArrayBuffer): (() => Promise<SheetAssets>) => async () => ({
  basePdf,
  semiBold: new ArrayBuffer(0),
  bold: new ArrayBuffer(0),
  italic: new ArrayBuffer(0),
});

const values = { mrp: '', unit: '', batch: '', madeOn: '', useBy: '' };

describe('makeSheetPdf', () => {
  it('a front with no cover returns the shipped asset byte-identical', async () => {
    const front = { ...(specFor('raggi-jaggi', '250 g', 'front', 'default') as SheetSpec), cover: undefined };
    const basePdf = await blankSheet();
    const bytes = await makeSheetPdf(values, front, loader(basePdf));
    expect(bytes.length).toBe(basePdf.byteLength);
    expect(Array.from(bytes)).toEqual(Array.from(new Uint8Array(basePdf)));
  });

  it('a front paints its cover (the net weight line out) on one page', async () => {
    // The shipped fronts carry "Net Quantity: …" as live text; the writer
    // covers it with the card's paper hex on every cell. The fake sheet here
    // stands in for the art: what matters is the cover path runs and keeps
    // the page count, without touching the back stamp path.
    const front = specFor('raggi-jaggi', '250 g', 'front', 'default') as SheetSpec;
    expect(front.cover?.rects).toHaveLength(1);
    const basePdf = await blankSheet();
    const bytes = await makeSheetPdf(values, front, loader(basePdf));
    expect(Array.from(bytes)).not.toEqual(Array.from(new Uint8Array(basePdf)));
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });

  it('the front cover paints the art\'s exact DeviceRGB cream', async () => {
    // #F7F2E4 rounds to the same 8-bit channels, so only the painted color
    // object tells the two apart: the writer must pass the exact triplet, not
    // the rounded hex. Spying avoids decoding pdf-lib's deflated streams.
    const front = specFor('raggi-jaggi', '250 g', 'front', 'default') as SheetSpec;
    const seen: Array<{ red: number; green: number; blue: number }> = [];
    const spy = vi.spyOn(PDFPage.prototype, 'drawRectangle').mockImplementation(function (this: PDFPage) {
      const color = (arguments[0] as { color?: { red: number; green: number; blue: number } }).color;
      if (color) seen.push(color);
      return this;
    });
    await makeSheetPdf(values, front, loader(await blankSheet()));
    spy.mockRestore();
    // One cover rect per cell carries the exact triplet (the fake sheet's own
    // background rect is a different color, so count the match, not the draw).
    const [r, g, b] = FRONT_PAPER_RGB;
    const exact = seen.filter((c) => c.red === r && c.green === g && c.blue === b);
    expect(exact).toHaveLength(front.cells);
  });

  it('refuses a back whose stamp geometry is missing, before loading any asset', async () => {
    const back = specFor('raggi-jaggi', '250 g', 'back', 'default') as SheetSpec;
    const load = vi.fn(loader(new ArrayBuffer(0)));
    await expect(makeSheetPdf({ ...values, mrp: '249.00' }, { ...back, stamp: null } as SheetSpec, load))
      .rejects.toThrow(/no stamp geometry/);
    expect(load).not.toHaveBeenCalled();
  });

  it('a back with no values hands the art straight back', async () => {
    // No values at all — no batch, dates or price — and no font is parsed. A
    // Blank sheet is not this case: it always sends its price, so it takes the
    // stamping path.
    const blank = specFor('raggi-jaggi', '500 g', 'back', 'blank') as SheetSpec;
    const basePdf = await blankSheet();
    const bytes = await makeSheetPdf(values, blank, loader(basePdf));
    expect(bytes.length).toBe(basePdf.byteLength);
    expect(Array.from(bytes)).toEqual(Array.from(new Uint8Array(basePdf)));
  });
});
