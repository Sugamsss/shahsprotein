import { describe, expect, it } from 'vitest';
import {
  BATCH_PREFIX,
  SHEETS_PER,
  addDays,
  addMonthsClamp,
  batchCode,
  batchSequenceFor,
  formatDDMMYYYY,
  layoutFor,
  mrpSource,
  sheetsNeeded,
  unitPrice,
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
  it('builds the kitchen numbers: R/M + DDMMYY, and no letter for Date Bites', () => {
    expect(BATCH_PREFIX).toEqual({ 'raggi-jaggi': 'R', muesli: 'M', bites: '' });
    expect(batchCode(BATCH_PREFIX['raggi-jaggi'], '2026-11-09')).toBe('R091126');
    expect(batchCode(BATCH_PREFIX.muesli, '2026-11-09')).toBe('M091126');
    expect(batchCode(BATCH_PREFIX.bites, '2026-11-09')).toBe('091126');
  });

  it('adds -2, -3 for a second or third batch of that product that day', () => {
    expect(batchCode('R', '2026-11-09', 1)).toBe('R091126');
    expect(batchCode('R', '2026-11-09', 2)).toBe('R091126-2');
    expect(batchCode('R', '2026-11-09', 3)).toBe('R091126-3');
    expect(batchCode('', '2026-11-09', 2)).toBe('091126-2');
  });
});

describe('batchSequenceFor', () => {
  const codes = ['R091126', 'R091126-2'];
  it('is the first batch when the kitchen has none that day', () => {
    expect(batchSequenceFor('R', '2026-11-09', [])).toBe(1);
  });
  it('follows the numbers the cook logged, -2 included', () => {
    expect(batchSequenceFor('R', '2026-11-09', ['R091126'])).toBe(1);
    expect(batchSequenceFor('R', '2026-11-09', codes)).toBe(2);
    expect(batchSequenceFor('R', '2026-11-09', ['R091126-3'])).toBe(3);
  });
  it('ignores another product, another day, and a lookalike code', () => {
    expect(batchSequenceFor('R', '2026-11-09', ['M091126', 'R081126', 'R091126-99x'])).toBe(1);
  });
});

describe('useByDate', () => {
  // The sticker prints the kitchen's Exp: the day before expires_on, so no
  // sticker ever tells someone a pack is good on a day the kitchen calls past.
  it('gives Raggi Jaggi the last good day of a 6-month life (09-11-2026 → 08-05-2027)', () => {
    expect(useByDate('raggi-jaggi', '2026-11-09')).toBe('2027-05-08');
  });

  it('gives Muesli the same (09-11-2026 → 08-05-2027)', () => {
    expect(useByDate('muesli', '2026-11-09')).toBe('2027-05-08');
  });

  it('gives Date Bites the day before its 21 days (09-11-2026 → 29-11-2026)', () => {
    expect(useByDate('bites', '2026-11-09')).toBe('2026-11-29');
  });

  it('clamps the month end on a 31st start (28-02 minus a day)', () => {
    expect(useByDate('raggi-jaggi', '2026-08-31')).toBe('2027-02-27');
  });
});

describe('unitPrice', () => {
  it('rounds 249/250 g to 1.00, ROUND_HALF_UP', () => {
    expect(unitPrice(249, 250)).toBe('1.00');
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
  it('uses the MRP printed on the pack by default', () => {
    expect(mrpSource(249, null)).toEqual({ mrp: 249, source: 'printed' });
  });

  it('prefers an explicitly typed MRP', () => {
    expect(mrpSource(249, 259)).toEqual({ mrp: 259, source: 'typed' });
  });

  it('says missing when there is no printed price', () => {
    expect(mrpSource(null, null)).toEqual({ mrp: null, source: 'missing' });
    expect(mrpSource(undefined, null)).toEqual({ mrp: null, source: 'missing' });
  });
});
