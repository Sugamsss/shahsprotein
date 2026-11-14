import { describe, expect, it } from 'vitest';
import { SHEET_SPECS, FRONT_PAPER_RGB, modeOptionsFor, specFor } from './sheetSpecs';

describe('specFor gift swap', () => {
  it('swaps to the gift twin on a 250 g back', () => {
    const spec = specFor('raggi-jaggi', '250 g', 'back', 'gift');
    expect(spec?.asset.endsWith('gift-v2.pdf')).toBe(true);
  });
  it('front ignores the kind', () => {
    expect(specFor('raggi-jaggi', '250 g', 'front', 'gift')?.stamp).toBeNull();
  });
  it('swaps the Date Bites container to its gift art', () => {
    const spec = specFor('bites', '250 g', 'back', 'gift');
    expect(spec?.asset.endsWith('container-15up-gift-v2.pdf')).toBe(true);
  });
  it('a default container build stays priced', () => {
    const spec = specFor('bites', '250 g', 'back', 'default');
    expect(spec?.asset.endsWith('db-250g-container-15up-v2.pdf')).toBe(true);
  });
  it('the container has no front', () => {
    expect(specFor('bites', '250 g', 'front', 'default')).toBeNull();
  });
});

describe('gift on a back with no gift twin (the 500 g backs)', () => {
  for (const productId of ['raggi-jaggi', 'muesli'] as const) {
    it(`${productId} 500 g gift prints on the blank art`, () => {
      const priced = specFor(productId, '500 g', 'back', 'default');
      const gift = specFor(productId, '500 g', 'back', 'gift');
      // The sheet has no gift twin, so the two are the same art and the layout's
      // giftCover paints "(incl. of all taxes)" out instead.
      expect(gift).not.toBeNull();
      expect(gift?.asset).toBe(priced?.asset);
      expect(gift?.stamp).toBe(priced?.stamp);
      expect(gift?.stamp?.giftCover).toHaveLength(1);
    });
  }

  it('every back offers Gift, priced or not', () => {
    for (const [productId, pack] of [['raggi-jaggi', '100 g'], ['muesli', '250 g'], ['bites', '100 g'], ['muesli', '500 g']] as const) {
      expect(modeOptionsFor(specFor(productId, pack, 'back'), true).gift).toBe(true);
      expect(modeOptionsFor(specFor(productId, pack, 'back'), false).gift).toBe(true);
    }
  });

  it('the gift cover only ever sits on the shared 114 x 142 block', () => {
    // 250 g backs keep a real gift twin, so their cover would paint paper on
    // paper; it stays off the 100 g backs and the container entirely.
    expect(specFor('raggi-jaggi', '250 g', 'back')?.stamp?.giftCover).toHaveLength(1);
    expect(specFor('raggi-jaggi', '100 g', 'back')?.stamp?.giftCover).toBeUndefined();
    expect(specFor('bites', '250 g', 'back')?.stamp?.giftCover).toBeUndefined();
  });
});

describe('specFor blank', () => {
  it('prints on the sheet’s own blank art, never a gift twin', () => {
    for (const productId of ['raggi-jaggi', 'muesli', 'bites'] as const) {
      for (const pack of ['100 g', '250 g'] as const) {
        const blank = specFor(productId, pack, 'back', 'blank');
        const priced = specFor(productId, pack, 'back', 'default');
        expect(blank?.asset).toBe(priced?.asset);
        expect(blank?.asset.endsWith('gift-v1.pdf')).toBe(false);
      }
    }
  });
  it('a 500 g blank is the 500 g art', () => {
    expect(specFor('muesli', '500 g', 'back', 'blank')?.asset).toBe('/assets/stickers/ms-500g-back-6up-blank-v2.pdf');
  });
  it('a front ignores blank too', () => {
    expect(specFor('raggi-jaggi', '250 g', 'front', 'blank')?.stamp).toBeNull();
  });
  it('a pack with no sheet has no blank either', () => {
    expect(specFor('bites', '500 g', 'back', 'blank')).toBeNull();
  });
});

describe('modeOptionsFor', () => {
  it('250 g back offers all four kinds with a price', () => {
    const spec = specFor('raggi-jaggi', '250 g', 'back');
    expect(modeOptionsFor(spec, true)).toEqual({ default: true, gift: true, custom: true, blank: true });
  });
  it('250 g back without a price offers gift and custom only', () => {
    // Blank prints the two money rows, so like Default it needs a price.
    const spec = specFor('raggi-jaggi', '250 g', 'back');
    expect(modeOptionsFor(spec, false)).toEqual({ default: false, gift: true, custom: true, blank: false });
  });
  it('container offers all four with a price', () => {
    const spec = specFor('bites', '250 g', 'back');
    expect(modeOptionsFor(spec, true)).toEqual({ default: true, gift: true, custom: true, blank: true });
  });
  it('front offers nothing', () => {
    const spec = specFor('raggi-jaggi', '250 g', 'front');
    expect(modeOptionsFor(spec, true)).toEqual({ default: false, gift: false, custom: false, blank: false });
  });
  it('no sheet offers nothing', () => {
    expect(modeOptionsFor(null, true)).toEqual({ default: false, gift: false, custom: false, blank: false });
  });
  it('Blank needs a price on every back, like Default', () => {
    // Blank prints the MRP and unit price and nothing else, so it needs a
    // price like Default does. The loop passes one in (`true`): with no price
    // (every 100 g pack today, since products.ts has no printed 100 g MRP)
    // Blank is off. Gift and Custom always can print.
    for (const [productId, pack] of [['raggi-jaggi', '100 g'], ['muesli', '250 g'], ['bites', '250 g'], ['muesli', '500 g']] as const) {
      const spec = specFor(productId, pack, 'back');
      expect(modeOptionsFor(spec, false).blank).toBe(false);
      expect(modeOptionsFor(spec, true).blank).toBe(true);
      expect(modeOptionsFor(spec, false).gift).toBe(true);
      expect(modeOptionsFor(spec, false).custom).toBe(true);
    }
  });
});

describe('front covers (net weight line painted out)', () => {
  it('every front carries one cover rect on the front card cream, no back does', () => {
    for (const spec of Object.values(SHEET_SPECS)) {
      if (spec.side === 'front') {
        expect(spec.stamp).toBeNull();
        expect(spec.cover?.paper).toBe('#F7F2E4');
        // The painted fill is the art's own DeviceRGB, not the rounded hex.
        expect(spec.cover?.rgb).toEqual([...FRONT_PAPER_RGB]);
        expect(FRONT_PAPER_RGB).toEqual([0.9686, 0.949, 0.8941]);
        expect(spec.cover?.rects).toHaveLength(1);
        const [rect] = spec.cover?.rects ?? [];
        // The rect stays inside the trim box with room to spare.
        expect(rect.x).toBeGreaterThan(0);
        expect(rect.y).toBeGreaterThan(0);
        expect(rect.x + rect.w).toBeLessThan(spec.trim[0]);
        expect(rect.y + rect.h).toBeLessThan(spec.trim[1]);
      } else {
        expect(spec.cover).toBeUndefined();
      }
    }
  });

  it('250 g fronts share one line position, 100 g fronts another', () => {
    const line = (id: keyof typeof SHEET_SPECS) => SHEET_SPECS[id].cover?.rects[0];
    expect(line('rj-250g-front')).toEqual(line('ms-250g-front'));
    expect(line('rj-500g-front')).toEqual(line('ms-500g-front'));
    expect(line('rj-100g-front')).toEqual(line('ms-100g-front'));
    expect(line('rj-250g-front')).not.toEqual(line('rj-500g-front'));
    expect(line('rj-100g-front')).not.toEqual(line('db-100g-front'));
  });
});

describe('500 g sheets', () => {  it('a 500 g back stamps the 250 g rows (same 114 x 142 art block)', () => {
    const big = specFor('raggi-jaggi', '500 g', 'back');
    const small = specFor('raggi-jaggi', '250 g', 'back');
    expect(big?.asset).toBe('/assets/stickers/rj-500g-back-6up-blank-v2.pdf');
    expect(big?.stamp).toEqual(small?.stamp);
    expect(big?.cells).toBe(6);
    expect(big?.trim).toEqual([114, 142]);
  });

  it('has no gift twin, so Gift prints on the blank art', () => {
    const spec = specFor('muesli', '500 g', 'back');
    expect(spec?.giftAsset).toBeUndefined();
    expect(modeOptionsFor(spec, true)).toEqual({ default: true, gift: true, custom: true, blank: true });
    expect(specFor('muesli', '500 g', 'back', 'gift')?.asset).toBe(spec?.asset);
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

describe('no writing rules on any back (owner, 2026-11-14)', () => {
  it('every back lists no rules, so values print with no underlines', () => {
    for (const spec of Object.values(SHEET_SPECS)) {
      if (spec.side === 'back') expect(spec.stamp?.rules).toEqual([]);
    }
  });
  it('the container gift lockup still ends at the value column', () => {
    const spec = specFor('bites', '250 g', 'back');
    expect(spec?.stamp?.align).toBe('left');
    expect(spec?.stamp?.valueRight).toBe(47.482);
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
