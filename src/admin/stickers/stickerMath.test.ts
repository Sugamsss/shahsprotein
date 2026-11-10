import { describe, expect, it } from 'vitest';
import {
  BATCH_PREFIX,
  SHEETS_PER,
  addDays,
  addMonthsClamp,
  batchCode,
  formatDDMMYYYY,
  layoutFor,
  mrpSource,
  sheetsNeeded,
  unitPrice,
  unitPriceExact,
  useByDate,
} from './stickerMath';

describe('formatDDMMYYYY', () => {
  it('prints the sticker date format', () => {
    expect(formatDDMMYYYY('2026-11-10')).toBe('10-11-2026');
  });
});

describe('addMonthsClamp', () => {
  it('clamps the month end (31-08 + 6 months is 28-02)', () => {
    expect(addMonthsClamp('2026-08-31', 6)).toBe('2027-02-28');
  });

  it('keeps an ordinary day (26-10 + 6 months is 26-04)', () => {
    expect(addMonthsClamp('2026-10-26', 6)).toBe('2027-04-26');
  });

  it('lands on 10-05-2027 from 10-11-2026', () => {
    expect(addMonthsClamp('2026-11-10', 6)).toBe('2027-05-10');
  });
});

describe('addDays', () => {
  it('adds 21 days (09-11-2026 + 21 is 30-11-2026)', () => {
    expect(addDays('2026-11-09', 21)).toBe('2026-11-30');
  });
});

describe('batchCode', () => {
  it('builds the owner codes: R/M/D + DDMMYYYY', () => {
    expect(BATCH_PREFIX).toEqual({ 'raggi-jaggi': 'R', muesli: 'M', bites: 'D' });
    expect(batchCode(BATCH_PREFIX['raggi-jaggi'], '2026-11-09')).toBe('R09112026');
    expect(batchCode(BATCH_PREFIX.muesli, '2026-11-09')).toBe('M09112026');
    expect(batchCode(BATCH_PREFIX.bites, '2026-11-09')).toBe('D09112026');
  });
});

describe('useByDate', () => {
  it('gives Raggi Jaggi 6 months (09-11-2026 → 09-05-2027)', () => {
    expect(useByDate('raggi-jaggi', '2026-11-09')).toBe('2027-05-09');
  });

  it('gives Muesli 6 months (09-11-2026 → 09-05-2027)', () => {
    expect(useByDate('muesli', '2026-11-09')).toBe('2027-05-09');
  });

  it('gives Date Bites 21 days (09-11-2026 → 30-11-2026)', () => {
    expect(useByDate('bites', '2026-11-09')).toBe('2026-11-30');
  });

  it('clamps the month end on a 31st start', () => {
    expect(useByDate('raggi-jaggi', '2026-08-31')).toBe('2027-02-28');
  });
});

describe('unitPrice', () => {
  it('rounds 249/250 g to 1.00, ROUND_HALF_UP', () => {
    expect(unitPrice(249, 250)).toBe('1.00');
  });

  it('keeps the exact figure beside it (0.996)', () => {
    expect(unitPriceExact(249, 250)).toBeCloseTo(0.996, 6);
  });

  it('prices a 100 g pack (80/100 is 0.80)', () => {
    expect(unitPrice(80, 100)).toBe('0.80');
  });
});

describe('sheetsNeeded', () => {
  it('rounds 40 packs at 6-up to 7 sheets with 2 spare', () => {
    expect(sheetsNeeded(40, 6)).toEqual({ sheets: 7, spare: 2 });
  });

  it('uses the right per-sheet counts', () => {
    expect(SHEETS_PER).toEqual({ '250g-back': 6, '100g-back': 9, container: 15 });
    expect(layoutFor('raggi-jaggi', '250 g')).toBe('250g-back');
    expect(layoutFor('bites', '250 g')).toBe('container');
    expect(layoutFor('bites', '100 g')).toBe('100g-back');
  });
});

describe('mrpSource', () => {
  it('prefers an explicitly typed MRP', () => {
    expect(mrpSource(249, 249, 259)).toEqual({ mrp: 259, source: 'typed' });
  });

  it('prefers the price book over the website fallback', () => {
    expect(mrpSource(249, 399, null)).toEqual({ mrp: 249, source: 'price-book' });
  });

  it('falls back to the website price offline', () => {
    expect(mrpSource(null, 249, null)).toEqual({ mrp: 249, source: 'website' });
  });

  it('says missing when there is no price anywhere', () => {
    expect(mrpSource(null, null, null)).toEqual({ mrp: null, source: 'missing' });
  });
});
