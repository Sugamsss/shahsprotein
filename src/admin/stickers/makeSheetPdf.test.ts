import { describe, expect, it, vi } from 'vitest';
import { PDFDocument, rgb } from 'pdf-lib';
import { makeSheetPdf, type SheetAssets } from './makeSheetPdf';
import { specFor, type SheetSpec } from './sheetSpecs';

// What this can check without the 4.3 MB print assets on disk: the shapes of
// the two paths that do no glyph work. The stamping itself is covered by the
// byte-for-byte diff against the approved delivery (temp/stickers/).

const blankSheet = async (): Promise<ArrayBuffer> => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([864, 1296]);
  page.drawRectangle({ x: 0, y: 0, width: 864, height: 1296, color: rgb(0.99, 0.98, 0.94) });
  const bytes = await doc.save();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
};

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
});
