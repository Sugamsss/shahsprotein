import { describe, expect, it } from 'vitest';
import { SHEET_SPECS, modeOptionsFor, specFor } from './sheetSpecs';

describe('specFor gift swap', () => {
  it('swaps to the gift twin on a 250 g back', () => {
    const spec = specFor('raggi-jaggi', '250 g', 'back', 'gift');
    expect(spec?.asset.endsWith('gift-v1.pdf')).toBe(true);
  });
  it('front ignores the kind', () => {
    expect(specFor('raggi-jaggi', '250 g', 'front', 'gift')?.stamp).toBeNull();
  });
  it('swaps the Date Bites container to its gift art', () => {
    const spec = specFor('bites', '250 g', 'back', 'gift');
    expect(spec?.asset.endsWith('container-15up-gift-v1.pdf')).toBe(true);
  });
  it('a default container build stays priced', () => {
    const spec = specFor('bites', '250 g', 'back', 'default');
    expect(spec?.asset.endsWith('db-250g-container-15up-v1.pdf')).toBe(true);
  });
  it('the container has no front', () => {
    expect(specFor('bites', '250 g', 'front', 'default')).toBeNull();
  });
});

describe('modeOptionsFor', () => {
  it('250 g back offers all three kinds with a price', () => {
    const spec = specFor('raggi-jaggi', '250 g', 'back');
    expect(modeOptionsFor(spec, true)).toEqual({ default: true, gift: true, custom: true });
  });
  it('250 g back without a price offers gift and custom', () => {
    const spec = specFor('raggi-jaggi', '250 g', 'back');
    expect(modeOptionsFor(spec, false)).toEqual({ default: false, gift: true, custom: true });
  });
  it('container offers all three with a price', () => {
    const spec = specFor('bites', '250 g', 'back');
    expect(modeOptionsFor(spec, true)).toEqual({ default: true, gift: true, custom: true });
  });
  it('front offers nothing', () => {
    const spec = specFor('raggi-jaggi', '250 g', 'front');
    expect(modeOptionsFor(spec, true)).toEqual({ default: false, gift: false, custom: false });
  });
  it('no sheet offers nothing', () => {
    expect(modeOptionsFor(null, true)).toEqual({ default: false, gift: false, custom: false });
  });
});

describe('500 g sheets', () => {
  it('a 500 g back stamps the 250 g rows (same 114 x 142 art block)', () => {
    const big = specFor('raggi-jaggi', '500 g', 'back');
    const small = specFor('raggi-jaggi', '250 g', 'back');
    expect(big?.asset).toBe('/assets/stickers/rj-500g-back-6up-blank-v1.pdf');
    expect(big?.stamp).toEqual(small?.stamp);
    expect(big?.cells).toBe(6);
    expect(big?.trim).toEqual([114, 142]);
  });

  it('has no gift twin yet, so Gift is off and Default still works', () => {
    const spec = specFor('muesli', '500 g', 'back');
    expect(spec?.giftAsset).toBeUndefined();
    expect(modeOptionsFor(spec, true)).toEqual({ default: true, gift: false, custom: true });
  });

  it('the 500 g front prints nothing, at 2 mm bleed', () => {
    const front = specFor('muesli', '500 g', 'front');
    expect(front?.stamp).toBeNull();
    expect(front?.bleed).toBe(2);
    expect(front?.pitch).toEqual([124, 104]);
  });

  it('Date Bites has no 500 g pack at all', () => {
    expect(specFor('bites', '500 g', 'back')).toBeNull();
    expect(specFor('bites', '500 g', 'front')).toBeNull();
  });
});

describe('every sheet is one grid whose pitch is its bleed box', () => {
  for (const [id, spec] of Object.entries(SHEET_SPECS)) {
    it(id, () => {
      expect(spec.cells).toBe(spec.cols * spec.rowsCount);
      expect(spec.pitch[0]).toBeCloseTo(spec.trim[0] + 2 * spec.bleed, 1);
      expect(spec.pitch[1]).toBeCloseTo(spec.trim[1] + 2 * spec.bleed, 1);
      expect(spec.stamp?.rules.length ?? 0).toBe(spec.stamp?.rules.length ? spec.stamp.rows.length : 0);
    });
  }
});
