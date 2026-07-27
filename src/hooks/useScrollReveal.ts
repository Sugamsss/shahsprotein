import { useEffect, useRef } from 'react';

interface ScrollRevealOptions {
  threshold?: number;
}

/**
 * Attaches an IntersectionObserver to reveal sections on scroll.
 * Ensures offscreen sections only trigger their reveal animation when scrolled to.
 */
export function useScrollReveal<T extends Element = HTMLDivElement>(
  options: ScrollRevealOptions = {}
) {
  const { threshold = 0.05 } = options;
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Only auto-reveal immediately on mount if element is in the top hero viewport
    const rect = el.getBoundingClientRect();
    if (window.scrollY === 0 && rect.top >= 0 && rect.top < 250) {
      el.classList.add('is-visible');
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('is-visible');
          observer.disconnect();
        }
      },
      { threshold, rootMargin: '0px 0px -20px 0px' }
    );

    observer.observe(el);

    return () => observer.disconnect();
  }, [threshold]);

  return ref;
}
