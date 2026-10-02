import { describe, expect, it, vi } from 'vitest';
import {
  DARK_CONFETTI_COLORS,
  LIGHT_CONFETTI_COLORS,
  cancelCouponConfetti,
  createConfettiPieces,
  getConfettiColors,
  isReducedMotion,
  shouldCelebrate,
} from './couponConfetti';

describe('couponConfetti', () => {
  describe('shouldCelebrate', () => {
    it('returns false on initial mount when prev is null or undefined', () => {
      expect(shouldCelebrate(null, { status: 'valid', code: 'EXAMPLE10' })).toBe(false);
      expect(shouldCelebrate(undefined, { status: 'valid', code: 'EXAMPLE10' })).toBe(false);
    });

    it('returns true on transition into valid from checking', () => {
      expect(shouldCelebrate({ status: 'checking', code: 'EXAMPLE10' }, { status: 'valid', code: 'EXAMPLE10' })).toBe(true);
    });

    it('returns true on transition into valid from idle', () => {
      expect(shouldCelebrate({ status: 'idle' }, { status: 'valid', code: 'EXAMPLE10' })).toBe(true);
    });

    it('returns false if previous status was already valid', () => {
      expect(shouldCelebrate({ status: 'valid', code: 'EXAMPLE10' }, { status: 'valid', code: 'EXAMPLE10' })).toBe(false);
    });

    it('returns false when next status is invalid', () => {
      expect(shouldCelebrate({ status: 'checking', code: 'BAD' }, { status: 'invalid', code: 'BAD' })).toBe(false);
    });

    it('returns false when next status is unavailable', () => {
      expect(shouldCelebrate({ status: 'checking', code: 'OFFLINE' }, { status: 'unavailable', code: 'OFFLINE' })).toBe(false);
    });

    it('returns false when next status is checking or idle', () => {
      expect(shouldCelebrate({ status: 'idle' }, { status: 'checking', code: 'TRY' })).toBe(false);
      expect(shouldCelebrate({ status: 'checking', code: 'TRY' }, { status: 'idle' })).toBe(false);
    });
  });

  describe('getConfettiColors', () => {
    it('returns light theme colors matching brand tokens', () => {
      const colors = getConfettiColors('light');
      expect(colors).toEqual(LIGHT_CONFETTI_COLORS);
      expect(colors).toContain('#3b82f6'); // blue
      expect(colors).toContain('#16a34a'); // success green
      expect(colors).toContain('#e11d48'); // rose
      expect(colors).not.toContain('#ffffff');
    });

    it('returns dark theme colors matching brand tokens', () => {
      const colors = getConfettiColors('dark');
      expect(colors).toEqual(DARK_CONFETTI_COLORS);
      expect(colors).toContain('#d4af37'); // gold accent
      expect(colors).toContain('#4ade80'); // dark success green
      expect(colors).toContain('#fb7185'); // rose
      expect(colors).not.toContain('#ffffff');
    });
  });

  describe('createConfettiPieces', () => {
    it('creates 64 pieces by default with ~70% rectangles and ~30% circles', () => {
      const pieces = createConfettiPieces({
        theme: 'light',
        originX: 150,
        originY: 200,
      });

      expect(pieces).toHaveLength(64);

      const rectangles = pieces.filter((p) => p.shape === 'rect');
      const circles = pieces.filter((p) => p.shape === 'circle');

      // 64 * 0.7 = 44.8 -> 45 rectangles, 19 circles
      expect(rectangles.length).toBe(45);
      expect(circles.length).toBe(19);

      for (const r of rectangles) {
        expect(r.width).toBeGreaterThanOrEqual(10);
        expect(r.width).toBeLessThanOrEqual(18.01);
        expect(r.height).toBeGreaterThanOrEqual(5);
        expect(r.height).toBeLessThanOrEqual(9.01);
        expect(r.radius).toBe(1.5);
        expect(LIGHT_CONFETTI_COLORS).toContain(r.color);
      }

      for (const c of circles) {
        expect(c.radius).toBeGreaterThanOrEqual(3.5);
        expect(c.radius).toBeLessThanOrEqual(6.01);
        expect(LIGHT_CONFETTI_COLORS).toContain(c.color);
      }
    });

    it('distributes colors evenly across pieces', () => {
      const pieces = createConfettiPieces({
        theme: 'light',
        originX: 100,
        originY: 100,
      });

      // 6 colours across 64 pieces: 10 or 11 each.
      const colorCounts = new Map<string, number>();
      for (const p of pieces) {
        colorCounts.set(p.color, (colorCounts.get(p.color) || 0) + 1);
      }

      expect(colorCounts.size).toBe(LIGHT_CONFETTI_COLORS.length);
      for (const color of LIGHT_CONFETTI_COLORS) {
        const count = colorCounts.get(color) ?? 0;
        expect(count).toBeGreaterThanOrEqual(10);
        expect(count).toBeLessThanOrEqual(11);
      }
    });

    it('positions initial pieces around origin', () => {
      const originX = 250;
      const originY = 400;
      const pieces = createConfettiPieces({
        theme: 'dark',
        originX,
        originY,
      });

      for (const p of pieces) {
        expect(Math.abs(p.x0 - originX)).toBeLessThanOrEqual(10);
        expect(Math.abs(p.y0 - originY)).toBeLessThanOrEqual(6);
        expect(p.vy).toBeLessThan(0); // Upward burst
      }
    });
  });

  describe('isReducedMotion', () => {
    it('returns false when window is undefined', () => {
      expect(isReducedMotion()).toBe(false);
    });

    it('returns true when prefers-reduced-motion matches', () => {
      const originalWindow = (globalThis as unknown as { window?: unknown }).window;
      (globalThis as unknown as { window: unknown }).window = {
        matchMedia: vi.fn().mockReturnValue({ matches: true }),
      };
      try {
        expect(isReducedMotion()).toBe(true);
      } finally {
        if (originalWindow !== undefined) {
          (globalThis as unknown as { window: unknown }).window = originalWindow;
        } else {
          delete (globalThis as unknown as { window?: unknown }).window;
        }
      }
    });

    it('returns false when prefers-reduced-motion does not match', () => {
      const originalWindow = (globalThis as unknown as { window?: unknown }).window;
      (globalThis as unknown as { window: unknown }).window = {
        matchMedia: vi.fn().mockReturnValue({ matches: false }),
      };
      try {
        expect(isReducedMotion()).toBe(false);
      } finally {
        if (originalWindow !== undefined) {
          (globalThis as unknown as { window: unknown }).window = originalWindow;
        } else {
          delete (globalThis as unknown as { window?: unknown }).window;
        }
      }
    });
  });

  describe('cancelCouponConfetti', () => {
    it('can be called safely when no burst is active', () => {
      expect(() => cancelCouponConfetti()).not.toThrow();
    });
  });
});
