import { describe, expect, it } from 'vitest';
import { DHOL_HITS, PLAY_FOR, buzzPattern } from './partySound';

describe('the party dhol', () => {
  it('plays the whole clip at the party and a short bit when a big order is saved', () => {
    expect(PLAY_FOR.party).toBe(10);
    expect(PLAY_FOR.saved).toBeLessThan(PLAY_FOR.party);
  });

  it("knows the clip's first drum hits, in order", () => {
    expect([...DHOL_HITS].sort((a, b) => a - b)).toEqual(DHOL_HITS);
    expect(DHOL_HITS.every((at) => at > 0 && at < PLAY_FOR.party)).toBe(true);
  });
});

describe('the buzz', () => {
  it('bursts with the poppers, then taps on each drum hit until it rests', () => {
    const pattern = buzzPattern(DHOL_HITS, 2.6);
    expect(pattern.slice(0, 3)).toEqual([40, 30, 90]);
    // On/off alternate: odd places are pauses, even places 30 ms taps.
    expect(pattern.slice(3).filter((_, i) => i % 2 === 1).every((ms) => ms === 30)).toBe(true);
    // A tap for each of the eight hits before 2.6 s.
    expect(pattern.length).toBe(3 + 2 * 8);
    // The first pause runs from the end of the popper burst (0.16 s) to the first hit (0.31 s).
    expect(pattern[3]).toBe(150);
  });

  it('rests after `until`, and never asks for a negative pause', () => {
    const short = buzzPattern(DHOL_HITS, 1.2);
    expect(short.length).toBe(3 + 2 * 3);
    expect(short.every((ms) => ms >= 0)).toBe(true);
    expect(buzzPattern([0.1, 0.12, 0.5], 2).every((ms) => ms >= 0)).toBe(true);
  });
});
