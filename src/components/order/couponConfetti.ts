/**
 * Confetti blast when a discount coupon is accepted in "Your order".
 *
 * Designed to feel warm, short, and food-brand (not a casino cannon):
 * - ~64 pieces (70% rounded rectangles, 30% circles)
 * - Light & dark palettes derived directly from site tokens
 * - Originates at the green applied chip (.order-coupon__applied)
 * - Arcs up and out, drifts down with gravity and gentle 3D flutter
 * - Fades in the final 30% of its ~1.2s duration
 * - Skips entirely when prefers-reduced-motion is requested
 * - One burst at a time (cancels any in-flight burst)
 */

export type ConfettiTheme = 'light' | 'dark';
export type ConfettiShape = 'rect' | 'circle';

export interface ConfettiPiece {
  shape: ConfettiShape;
  color: string;
  width: number;
  height: number;
  radius: number;
  x0: number;
  y0: number;
  vx: number;
  vy: number;
  drag: number;
  gravity: number;
  wobbleFreq: number;
  wobbleAmp: number;
  wobblePhase: number;
  rotation0: number;
  rotationSpeed: number;
  tiltPhase: number;
  tiltSpeed: number;
}

/**
 * Palette colors matching the theme tokens:
 * Saturated on purpose. Cream and white disappear on the light popup,
 * so the art tints stay out. Hex values match the theme tokens.
 *
 * Light: blue, deeper blue, success green, peach, gold, rose.
 * Dark: gold, deeper gold, success green, peach, sky, rose.
 */
export const LIGHT_CONFETTI_COLORS = [
  '#3b82f6',
  '#2563eb',
  '#16a34a',
  '#f4a57a',
  '#e8c56b',
  '#e11d48',
] as const;

export const DARK_CONFETTI_COLORS = [
  '#e5c158',
  '#d4af37',
  '#4ade80',
  '#f4a57a',
  '#93c5fd',
  '#fb7185',
] as const;

export function getConfettiColors(theme: ConfettiTheme): readonly string[] {
  return theme === 'dark' ? DARK_CONFETTI_COLORS : LIGHT_CONFETTI_COLORS;
}

export function isReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export interface CouponTransitionState {
  status: string;
  code?: string;
}

/**
 * Fires celebration only on a fresh transition into 'valid'.
 * Skips initial mount (when prev is null/undefined), invalid, unavailable,
 * or repeat checks when already valid.
 */
export function shouldCelebrate(
  prev: CouponTransitionState | null | undefined,
  next: CouponTransitionState,
): boolean {
  if (!prev) return false;
  if (next.status !== 'valid') return false;
  return prev.status !== 'valid';
}

/**
 * Creates ~64 pieces (~70% rectangles, ~30% circles) evenly colored with the theme palette.
 */
export function createConfettiPieces(options: {
  count?: number;
  theme: ConfettiTheme;
  originX: number;
  originY: number;
}): ConfettiPiece[] {
  const count = options.count ?? 64;
  const colors = getConfettiColors(options.theme);
  const pieces: ConfettiPiece[] = [];

  // ~70% small rectangles, ~30% circles
  const rectCount = Math.round(count * 0.7);

  for (let i = 0; i < count; i++) {
    const isRect = i < rectCount;
    const color = colors[i % colors.length];

    // Rectangles: 10–18px by 5–9px. Circles: 7–12px across.
    const width = isRect ? 10 + Math.random() * 8 : 7 + Math.random() * 5;
    const height = isRect ? 5 + Math.random() * 4 : width;
    const radius = isRect ? 1.5 : width / 2;

    // A fountain from the chip: straight up, fanning a little either side.
    // Speed is px/s. Drag is low, so the first moments are a real launch.
    const spread = (Math.random() - 0.5) * (Math.PI * 0.85);
    const angle = -Math.PI / 2 + spread;
    const speed = 380 + Math.random() * 520;

    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;

    const x0 = options.originX + (Math.random() - 0.5) * 16;
    const y0 = options.originY + (Math.random() - 0.5) * 8;

    pieces.push({
      shape: isRect ? 'rect' : 'circle',
      color,
      width,
      height,
      radius,
      x0,
      y0,
      vx,
      vy,
      drag: 0.35 + Math.random() * 0.35,
      gravity: 1400 + Math.random() * 400,
      wobbleFreq: 3.5 + Math.random() * 3.5,
      wobbleAmp: 8 + Math.random() * 14,
      wobblePhase: Math.random() * Math.PI * 2,
      rotation0: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 10,
      tiltPhase: Math.random() * Math.PI * 2,
      tiltSpeed: 4 + Math.random() * 6,
    });
  }

  return pieces;
}

export function getBurstOrigin(): { x: number; y: number } {
  if (typeof document === 'undefined') return { x: 0, y: 0 };
  const chip = document.querySelector<HTMLElement>('.order-coupon__applied');
  if (chip) {
    const rect = chip.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    }
  }
  const dialog = document.querySelector<HTMLElement>('.order-dialog');
  if (dialog) {
    const rect = dialog.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    }
  }
  return {
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
  };
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.fill();
}

let activeBurstCleanup: (() => void) | null = null;

export function cancelCouponConfetti(): void {
  if (activeBurstCleanup) {
    activeBurstCleanup();
    activeBurstCleanup = null;
  }
}

/**
 * Fires a 1.2s celebratory confetti blast on document.body.
 * Cancels any existing burst first.
 */
export function fireCouponConfetti(): void {
  if (isReducedMotion()) return;
  if (typeof document === 'undefined') return;

  // One burst at a time: cancel previous burst if still running.
  cancelCouponConfetti();

  const theme: ConfettiTheme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  const origin = getBurstOrigin();
  const pieces = createConfettiPieces({
    theme,
    originX: origin.x,
    originY: origin.y,
  });

  const canvas = document.createElement('canvas');
  canvas.className = 'coupon-confetti';
  canvas.setAttribute('aria-hidden', 'true');

  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  document.body.appendChild(canvas);

  let animationFrameId: number | null = null;
  const startTime = performance.now();
  const duration = 1600;

  const cleanup = () => {
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    if (canvas.parentNode) {
      canvas.parentNode.removeChild(canvas);
    }
  };

  activeBurstCleanup = cleanup;

  const tick = (now: number) => {
    const elapsed = now - startTime;
    const progress = Math.min(1, Math.max(0, elapsed / duration));

    if (progress >= 1) {
      cleanup();
      if (activeBurstCleanup === cleanup) {
        activeBurstCleanup = null;
      }
      return;
    }

    // Fade in the last 30% of duration (progress 0.70 to 1.0)
    const alpha = progress < 0.7 ? 1 : (1 - progress) / 0.3;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(dpr, dpr);

    const s = elapsed / 1000;

    for (const p of pieces) {
      const dragTerm = (1 - Math.exp(-p.drag * s)) / p.drag;
      const wobble = Math.sin(s * p.wobbleFreq + p.wobblePhase) * p.wobbleAmp;

      const currentX = p.x0 + p.vx * dragTerm + wobble;
      const currentY = p.y0 + p.vy * dragTerm + 0.5 * p.gravity * s * s;

      const currentRot = p.rotation0 + p.rotationSpeed * s;
      const tiltScaleY = Math.cos(p.tiltPhase + p.tiltSpeed * s);

      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      ctx.translate(currentX, currentY);
      ctx.rotate(currentRot);
      ctx.scale(1, tiltScaleY);
      ctx.fillStyle = p.color;

      if (p.shape === 'rect') {
        drawRoundedRect(ctx, -p.width / 2, -p.height / 2, p.width, p.height, p.radius);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }

    ctx.restore();
    animationFrameId = requestAnimationFrame(tick);
  };

  animationFrameId = requestAnimationFrame(tick);
}
