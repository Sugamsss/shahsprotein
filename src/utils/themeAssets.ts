import type { Theme } from '../types/theme';

/**
 * The files that change with the theme: the logo and the hero art. Header,
 * Footer, 404 and Hero all read their paths from here, so the warm-up below
 * fetches exactly what they will show. index.html preloads the same hero
 * srcset for the saved theme; keep the two in sync.
 */
export const logoSrc = (theme: Theme): string =>
  theme === 'dark' ? '/assets/logo-dark-v2.webp' : '/assets/logo-v2.webp';

const heroBase = (theme: Theme) => `/assets/generated-muesli/muesli-hero-accurate-v2-${theme}`;

export const heroArt = (theme: Theme) => ({
  src: `${heroBase(theme)}.webp`,
  srcSet: [
    `${heroBase(theme)}-828w.webp 828w`,
    `${heroBase(theme)}-1242w.webp 1242w`,
    `${heroBase(theme)}.webp 1672w`,
  ].join(', '),
  sizes: '100vw',
});

const warmed = new Set<Theme>();

/**
 * Starts loading a theme's logo and hero art, once. Called when someone
 * reaches for a theme switch (pointer over it or focus on it), so the other
 * theme's files are usually in cache by the time they click, and the logo
 * never shows blank. People who never switch download nothing extra.
 */
export const warmTheme = (theme: Theme): void => {
  if (warmed.has(theme)) return;
  warmed.add(theme);

  new Image().src = logoSrc(theme);

  // Same srcset and sizes as the hero, so the browser picks the file it will show.
  const { src, srcSet, sizes } = heroArt(theme);
  const hero = new Image();
  hero.sizes = sizes;
  hero.srcset = srcSet;
  hero.src = src;
};
