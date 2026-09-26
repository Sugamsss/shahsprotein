import { describe, expect, it } from 'vitest';
import { adminCopy } from './adminCopy';

// Pranjali's Home: the sentences that change with the day's numbers.
const { cards, cookMaybe } = adminCopy.homePage;

describe("a product card's maybe", () => {
  // It follows "Maybe 1¾ kg". "More" only makes sense when there's already something to make.
  it.each([
    [4, true, 'Maybe 1¾ kg more, if 4 new orders go ahead'],
    [4, false, 'Maybe 1¾ kg, if 4 new orders go ahead'],
    [1, false, 'Maybe 1¾ kg, if a new order goes ahead'],
  ])('%i orders, something to make: %s', (orders, more, expected) => {
    expect(`${cards.maybe} 1¾ kg${cards.maybeIf(orders, more)}`).toBe(expected);
  });

  it('the short form adds a + only when there is something to make', () => {
    expect(cards.maybeShort('1¾ kg', true)).toBe('+1¾ kg');
    expect(cards.maybeShort('1¾ kg', false)).toBe('1¾ kg');
  });
});

describe('the maybe under "Nothing to make right now."', () => {
  it('names the products when only some might be needed', () => {
    expect(cookMaybe(true, ['Raggi Jaggi', 'Muesli'], false)).toBe('A new order might need some Raggi Jaggi and Muesli.');
  });

  it('says "some of each" instead of listing every product', () => {
    expect(cookMaybe(false, ['Raggi Jaggi', 'Muesli', 'Date Bites'], true)).toBe('New orders might need some of each.');
  });
});
