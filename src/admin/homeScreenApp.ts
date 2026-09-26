// The admin as a home-screen app ("Shah's Orders"). Its manifest, icons and app
// tags are static in admin.html, which Vercel serves for /admin and /admin/*:
// Safari reads the manifest once, as the HTML loads, so tags added later by JS
// are never seen. The only thing changed here is theme-color's content, which
// browsers do follow live (the status bar and toolbar colour).

/**
 * True when the admin runs as the installed app (from the home screen, or as a
 * desktop app), not in a browser tab. `navigator.standalone` is iOS's own flag;
 * the media query covers Chrome and current Safari.
 */
export const isInstalledApp = (): boolean =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

type Rgba = [number, number, number, number];

/** "#eef4fc", "rgb(…)" or "rgba(…)" (what tokens and computed styles give) → channels; null otherwise. */
const parseColor = (value: string): Rgba | null => {
  const text = value.trim();
  const hex = /^#([0-9a-f]{6})$/i.exec(text)?.[1];
  if (hex) return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)).concat(1) as Rgba;
  const parts = /^rgba?\(([^)]+)\)$/.exec(text)?.[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  if (!parts || parts.length < 3 || parts.some(Number.isNaN)) return null;
  return [parts[0], parts[1], parts[2], parts[3] ?? 1];
};

/**
 * While a sheet's backdrop covers the page, the status bar takes the page's
 * colour under that backdrop, so no pale strip shows above a dimmed app.
 * theme-color is what iOS (and Android) paint the bar with. Returns the undo;
 * a sheet over a sheet puts back what it found.
 */
export const dimStatusBar = (layer: HTMLElement): (() => void) => {
  const page = parseColor(getComputedStyle(document.documentElement).getPropertyValue('--adm-page'));
  const scrim = parseColor(getComputedStyle(layer).backgroundColor);
  const metas = [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')];
  if (!page || !scrim || !metas.length) return () => {};
  const a = scrim[3];
  const dimmed = `#${[0, 1, 2].map((i) => Math.round(page[i] * (1 - a) + scrim[i] * a).toString(16).padStart(2, '0')).join('')}`;
  const before = metas.map((meta) => meta.content);
  metas.forEach((meta) => meta.setAttribute('content', dimmed));
  return () => metas.forEach((meta, i) => meta.setAttribute('content', before[i]));
};
