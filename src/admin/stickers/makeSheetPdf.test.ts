import { describe, expect, it, vi } from 'vitest';
import { PDFDocument, rgb } from 'pdf-lib';
import { makeSheetPdf, type SheetAssets } from './makeSheetPdf';
import { specFor, type SheetSpec } from './sheetSpecs';

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
  it('returns a front sheet byte-identical to the shipped asset', async () => {
    const front = specFor('raggi-jaggi', '250 g', 'front', 'default') as SheetSpec;
    const basePdf = await blankSheet();
    const bytes = await makeSheetPdf(values, front, loader(basePdf));
    expect(bytes.length).toBe(basePdf.byteLength);
    expect(Array.from(bytes)).toEqual(Array.from(new Uint8Array(basePdf)));
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
    // stamping path below.
    const blank = specFor('raggi-jaggi', '500 g', 'back', 'blank') as SheetSpec;
    const basePdf = await blankSheet();
    const bytes = await makeSheetPdf(values, blank, loader(basePdf));
    expect(bytes.length).toBe(basePdf.byteLength);
    expect(Array.from(bytes)).toEqual(Array.from(new Uint8Array(basePdf)));
  });
});
