import { describe, expect, it } from 'vitest';
import { STYLES, buzzPattern, dholHits, dholLength } from './partySound';

const onSixteenth = (at: number) => {
  const n = (at - 0.6) / 0.125;
  return Math.abs(n - Math.round(n)) < 1e-6;
};

describe('the party dhol', () => {
  it.each(STYLES)('%s: a tasha roll with the poppers, then strokes on the 120 bpm sixteenths, in time order', (style) => {
    const hits = dholHits('party', style);
    const intro = hits.filter((h) => h.at < 0.6);
    expect(intro.length).toBeGreaterThan(4);
    expect(intro.every((h) => h.drum === 'tasha')).toBe(true);
    expect(hits.map((h) => h.at)).toEqual([...hits.map((h) => h.at)].sort((a, b) => a - b));
    expect(hits.every((h) => h.level > 0 && h.level <= 1)).toBe(true);
    // Every stroke after the roll lands on the dancers' grid, except a build's rolls.
    const beat = hits.filter((h) => h.at >= 0.6 && !(style === 'build' && h.drum === 'tasha'));
    expect(beat.every((h) => onSixteenth(h.at))).toBe(true);
    expect(dholLength(hits)).toBeLessThan(10);
  });

  it('the pathak ends on everything at once, four bars after the roll', () => {
    const last = dholHits('party').filter((h) => h.at === 8.6);
    expect(last.map((h) => h.drum).sort()).toEqual(['dhol', 'jhanj', 'tasha', 'tipru']);
  });

  it('is one bar when a big order is saved', () => {
    const hits = dholHits('saved');
    expect(Math.max(...hits.map((h) => h.at))).toBe(2.6);
  });
});

describe('the buzz', () => {
  it('bursts with the poppers, then taps on each loud dhol stroke until it rests', () => {
    const pattern = buzzPattern(dholHits('party'), 2.6);
    expect(pattern.slice(0, 3)).toEqual([40, 30, 90]);
    expect(pattern.slice(3).filter((_, i) => i % 2 === 1).every((ms) => ms === 30)).toBe(true);
    expect(pattern.length).toBeGreaterThan(5);
  });

  it.each(STYLES)('%s never asks for a negative pause', (style) => {
    expect(buzzPattern(dholHits('party', style), 2.6).every((ms) => ms >= 0)).toBe(true);
  });
});
