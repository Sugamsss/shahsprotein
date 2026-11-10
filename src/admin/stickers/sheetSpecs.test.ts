import { describe, expect, it } from 'vitest';
import { modeOptionsFor, specFor } from './sheetSpecs';

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
