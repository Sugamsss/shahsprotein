import { describe, expect, it } from 'vitest';
import { buzzPattern, dholHits, dholLength } from './partySound';

describe('the party dhol', () => {
  it('rolls with the poppers, then plays four bars of chaal on the 120 bpm beat and ends on one DHA', () => {
    const hits = dholHits('party');
    expect(hits.slice(0, 6).every((h) => h.drum === 'treble' && h.at < 0.5)).toBe(true);
    const groove = hits.slice(6, -1);
    expect(groove).toHaveLength(4 * 6);
    // Every hit lands on an eighth (250 ms) after the groove starts, and each bar opens with an accented DHA.
    expect(groove.every((h) => { const n = (h.at - 0.6) / 0.25; return Math.abs(n - Math.round(n)) < 1e-9; })).toBe(true);
    expect(groove.filter((h) => h.accent).map((h) => h.at)).toEqual([0.6, 2.6, 4.6, 6.6]);
    expect(hits[hits.length - 1]).toEqual({ at: 8.6, drum: 'both', accent: true });
    expect(dholLength(hits)).toBeCloseTo(9.2);
  });

  it('is short when a big order is saved', () => {
    const hits = dholHits('saved');
    expect(hits).toHaveLength(6 + 6 + 1);
    expect(dholLength(hits)).toBeCloseTo(3.2);
  });
});

describe('the buzz', () => {
  it('bursts with the poppers, then taps on each bass hit until it rests', () => {
    const pattern = buzzPattern(dholHits('party'), 2.6);
    expect(pattern.slice(0, 3)).toEqual([40, 30, 90]);
    // On/off alternate: odd places are pauses, even places 30 ms taps.
    expect(pattern.slice(3).filter((_, i) => i % 2 === 1).every((ms) => ms === 30)).toBe(true);
    // Bass hits in the first bar: 0.6, 1.35 and 2.1 s, then the next bar's DHA at 2.6 s.
    expect(pattern.slice(3)).toEqual([440, 30, 720, 30, 720, 30, 470, 30]);
  });

  it('never asks for a negative pause', () => {
    expect(buzzPattern(dholHits('saved'), 1.2).every((ms) => ms >= 0)).toBe(true);
  });
});
