import { describe, expect, it } from 'vitest';
import type { Overview, Totals } from '../types';
import { packingHint, readyHint, sentences } from './homeHints';

type Ready = Overview['queue']['ready'];
const ready = (r: Partial<Ready>): Ready => ({ count: 1, not_paid: 0, part_paid: 0, oldest_since: null, oldest: null, ...r });
const names = (unpaid: string[], part: string[] = []) => ({ unpaid_names: unpaid, part_paid_names: part }) as unknown as Totals['overall']['ready'];

describe('packingHint: the To pack line', () => {
  it('a part-paid order is not paid in full', () => {
    expect(packingHint({ count: 2, paid: 1, part_paid: 1 }, 3)).toBe('3 packs. 1 paid, 1 not paid in full');
  });
  it('with nothing paid in part, the rest are not paid yet', () => {
    expect(packingHint({ count: 2, paid: 1, part_paid: 0 }, undefined)).toBe('1 paid, 1 not paid yet');
    expect(packingHint({ count: 1, paid: 1, part_paid: 0 }, 1)).toBe('1 pack. 1 paid');
  });
});

describe('readyHint: the To drop off line joins cleanly', () => {
  const cases: [string, Ready, Totals['overall']['ready'] | undefined, string | null, string | null, string][] = [
    ['waited, all paid', ready({ oldest_since: 'x' }), undefined, '4 days', 'Farah', "Farah's has waited 4 days. All paid."],
    ['no wait, all paid', ready({}), undefined, null, null, 'All paid.'],
    ['waited, named not paid', ready({ not_paid: 1 }), names(['Farah']), '4 days', 'Farah', "Farah's has waited 4 days. Farah hasn't paid yet."],
    ['waited, counted not paid', ready({ count: 2, not_paid: 2 }), undefined, '4 days', null, 'The oldest has waited 4 days. 2 not paid yet.'],
    ['waited, part paid only', ready({ not_paid: 1, part_paid: 1 }), names(['Farah'], ['Farah']), '4 days', 'Farah', "Farah's has waited 4 days. Farah paid part."],
    ['waited, both kinds', ready({ count: 2, not_paid: 2, part_paid: 1 }), names(['Om', 'Farah'], ['Farah']), '4 days', 'Farah',
      "Farah's has waited 4 days. Om hasn't paid. Farah paid part."],
    ['no wait, both kinds', ready({ count: 2, not_paid: 2, part_paid: 1 }), names(['Om', 'Farah'], ['Farah']), null, null, "Om hasn't paid. Farah paid part."],
  ];
  it.each(cases)('%s', (_, r, n, age, name, want) => {
    const got = readyHint(r, n, age, name);
    expect(got).toBe(want);
    expect(got).not.toMatch(/\.\.|\. {2}|[a-z]\. ?[a-z]/);
  });
  it('sentences drops empty parts and never doubles a stop', () => {
    expect(sentences(['One.', '', null, 'two'])).toBe('One. two.');
    expect(sentences([])).toBe('');
  });
});
