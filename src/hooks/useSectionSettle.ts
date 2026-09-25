import { useEffect } from 'react';

/**
 * Desktop "settle": when a scroll comes to rest just short of the next
 * section, glide the rest of the way to that section's top.
 *
 * This replaces CSS `scroll-snap-type: y proximity`. The browser's proximity
 * zone is fixed (a third of the screen in Chrome) and pulls in both
 * directions, so a mouse-wheel step (about 100px) out of a section always
 * landed inside the zone and got pulled straight back: people were trapped.
 * Here we only settle forward, in the direction of travel, so a step away
 * from a section is never undone.
 *
 * Same screens that used to snap: 901px+ wide, 601px+ tall, a fine pointer.
 * Touch, phones and short screens scroll freely, and reduced motion never
 * gets the extra movement.
 */
const SETTLE_MEDIA = '(min-width: 901px) and (min-height: 601px) and (pointer: fine) and (prefers-reduced-motion: no-preference)';
const SECTION_SELECTOR = '.snap-section, .final-page-section';
/** Settle when the next section's top is within this share of the screen. */
const REACH = 0.25;
/** Browsers without `scrollend` (older Safari): treat this much quiet as the end. */
const IDLE_MS = 150;
/** A mouse wheel that's still turning isn't done: wait this long after its last notch. */
const WHEEL_QUIET_MS = 180;

export function useSectionSettle() {
  useEffect(() => {
    const media = window.matchMedia(SETTLE_MEDIA);
    const hasScrollEnd = 'onscrollend' in window;
    let lastY = window.scrollY;
    let direction = 0;
    let idleTimer: number | undefined;
    let wheelTimer: number | undefined;
    let lastWheel = 0;
    let gliding = false;

    const settle = () => {
      // Still wheeling: a fast wheel's notches come ~120ms apart, and scrollend
      // fires between them. Settle once the wheel stops, not between notches.
      const sinceWheel = performance.now() - lastWheel;
      if (sinceWheel < WHEEL_QUIET_MS) {
        window.clearTimeout(wheelTimer);
        wheelTimer = window.setTimeout(settle, WHEEL_QUIET_MS - sinceWheel);
        return;
      }
      gliding = false;
      // The popup and the phone menu lock the page with overflow: hidden.
      if (!media.matches || document.body.style.overflow === 'hidden') return;

      const y = window.scrollY;
      const reach = window.innerHeight * REACH;
      const maxY = document.documentElement.scrollHeight - window.innerHeight;
      const tops = Array.from(document.querySelectorAll<HTMLElement>(SECTION_SELECTOR), (el) =>
        Math.round(el.getBoundingClientRect().top + y),
      );

      const target =
        direction > 0
          ? tops.find((top) => top > y + 1 && top - y <= reach)
          : direction < 0
            ? tops.reverse().find((top) => top < y - 1 && y - top <= reach)
            : undefined;

      if (target === undefined || target > maxY) return;
      gliding = true;
      window.scrollTo({ top: target, behavior: 'smooth' });
    };

    const onScroll = () => {
      const y = window.scrollY;
      if (y !== lastY) direction = Math.sign(y - lastY);
      lastY = y;
      if (!hasScrollEnd) {
        window.clearTimeout(idleTimer);
        idleTimer = window.setTimeout(settle, IDLE_MS);
      }
    };

    // A notch that lands mid-glide stops the glide, so the wheel is never ignored.
    const onWheel = () => {
      lastWheel = performance.now();
      if (gliding) {
        gliding = false;
        window.scrollTo({ top: window.scrollY, behavior: 'instant' });
      }
    };

    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    if (hasScrollEnd) window.addEventListener('scrollend', settle);

    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('scroll', onScroll);
      if (hasScrollEnd) window.removeEventListener('scrollend', settle);
      window.clearTimeout(idleTimer);
      window.clearTimeout(wheelTimer);
    };
  }, []);
}
