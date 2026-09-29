import { describe, expect, it } from 'vitest';
import { adminCopy } from './adminCopy';

// The admin's sentences that change with the order or the day's numbers.
const { order, orders } = adminCopy;

describe("a Cooking order's hint", () => {
  it('names what it waits on, and agrees with one or more', () => {
    expect(order.hints.cooking(['Raggi Jaggi'])).toBe('Waiting on the Raggi Jaggi. It moves to Packing by itself once that’s cooked.');
    expect(order.hints.cooking(['Raggi Jaggi', 'Muesli']))
      .toBe('Waiting on the Raggi Jaggi and Muesli. It moves to Packing by itself once they’re cooked.');
  });

  it('says it plainly when nothing is short (moved back by hand, a fill still to come)', () => {
    expect(order.hints.cooking([])).toBe('It moves to Packing by itself once it’s all cooked.');
  });
});

describe('a ready product in the order', () => {
  it('says the day, or the days, its food was made', () => {
    expect(order.readyMade(['Thu 17 Sep'])).toBe('Ready, made Thu 17 Sep');
    expect(order.readyMade(['Thu 17 Sep', 'Sat 19 Sep'])).toBe('Ready, made Thu 17 Sep and Sat 19 Sep');
  });
});

describe("Done's line on the Orders page", () => {
  it('mentions free samples only when there are some', () => {
    expect(orders.doneSub(6, 0, 1)).toBe('6 delivered and paid, 1 cancelled');
    expect(orders.doneSub(6, 1, 1)).toBe('6 delivered and paid, 1 free sample, 1 cancelled');
  });
});
