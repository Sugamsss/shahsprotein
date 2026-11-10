import { describe, expect, it } from 'vitest';
import { SHEET_SPECS, type SheetSpec } from './sheetSpecs';
import { ZOOM_TARGET_PX, STAGE_TARGET_PX, rasterScale } from './preview';

// The crop the stage shows is cut by these two numbers, so they are the ones
// that must not drift: they were measured against the sheets the owners
// approved. A change here changes the pixels, and this test says so.
const back: SheetSpec = SHEET_SPECS['rj-250g-back'];
const container: SheetSpec = SHEET_SPECS['db-250g-container'];

describe('rasterScale', () => {
  it('sizes the sheet so the sticker is 1000 px on its long edge', () => {
    // 142 mm long edge at 72 dpi: target × 25.4 / (72 × 142).
    expect(rasterScale(back, STAGE_TARGET_PX)).toBeCloseTo((STAGE_TARGET_PX * 25.4) / (72 * 142), 6);
    expect(rasterScale(back, ZOOM_TARGET_PX)).toBeCloseTo((ZOOM_TARGET_PX * 25.4) / (72 * 142), 6);
  });

  it('gives the container its own scale from its own trim', () => {
    // 96.6 × 82.8, so the long edge is the width.
    expect(rasterScale(container, STAGE_TARGET_PX)).toBeCloseTo((1000 * 25.4) / (72 * 96.6), 6);
  });

  it('never lets the offscreen full-sheet canvas past 26 MP', () => {
    const scale = rasterScale(back, 1_000_000);
    const sheetLongMm = Math.max(back.cols * back.pitch[0], back.rowsCount * back.pitch[1]) + back.bleed * 2 + 24;
    expect(scale).toBeCloseTo(Math.sqrt(26_000_000) / (sheetLongMm * (72 / 25.4)), 6);
    expect(scale).toBeLessThan((1_000_000 * 25.4) / (72 * 142));
  });
});
