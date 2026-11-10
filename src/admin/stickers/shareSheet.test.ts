import { describe, expect, it } from 'vitest';
import { canSharePdf, pdfFile, shareCancelled } from './shareSheet';

// The decision that turns Send from "open a chat" into "hand over the PDF".
const host = (canShare?: (data?: ShareData) => boolean) => ({
  share: async () => {},
  canShare,
});

describe('canSharePdf', () => {
  it('says no where the browser has no Web Share, or no file support', () => {
    expect(canSharePdf(undefined)).toBe(false);
    expect(canSharePdf({ canShare: () => true })).toBe(false);
    expect(canSharePdf({ share: async () => {} })).toBe(false);
    expect(canSharePdf(host(() => false))).toBe(false);
  });

  it('asks with a real PDF, because a browser can take text and still refuse files', () => {
    let asked: ShareData | undefined;
    const yes = canSharePdf(host((data) => {
      asked = data;
      return true;
    }));
    expect(yes).toBe(true);
    const file = asked?.files?.[0];
    expect(file).toBeInstanceOf(File);
    expect(file?.type).toBe('application/pdf');
    expect(file?.name).toMatch(/\.pdf$/);
  });

  it('treats a throwing canShare as no', () => {
    expect(canSharePdf(host(() => { throw new Error('nope'); }))).toBe(false);
  });
});

describe('pdfFile', () => {
  it('hands over the file by the name Download would save', () => {
    const bytes = new Uint8Array([37, 80, 68, 70]);
    const file = pdfFile(bytes, 'Shahs-Nutrition-Sticker-R09112026.pdf');
    expect(file.type).toBe('application/pdf');
    expect(file.name).toBe('Shahs-Nutrition-Sticker-R09112026.pdf');
    expect(file.size).toBe(4);
  });

  it('takes only the bytes of a view, not the whole buffer behind it', async () => {
    const big = new Uint8Array([9, 1, 2, 3, 9]);
    const file = pdfFile(big.subarray(1, 4), 'view.pdf');
    expect(file.size).toBe(3);
    expect([...new Uint8Array(await file.arrayBuffer())]).toEqual([1, 2, 3]);
  });
});

describe('shareCancelled', () => {
  it('is only the sheet being closed', () => {
    expect(shareCancelled(new DOMException('cancelled', 'AbortError'))).toBe(true);
    expect(shareCancelled(new DOMException('denied', 'NotAllowedError'))).toBe(false);
    expect(shareCancelled(new Error('failed'))).toBe(false);
    expect(shareCancelled(null)).toBe(false);
  });
});
