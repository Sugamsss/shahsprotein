// The admin as a home-screen app ("Shah's Orders"). Its manifest, icons and app
// tags are static in admin.html, which Vercel serves for /admin and /admin/*:
// Safari reads the manifest once, as the HTML loads, so tags added later by JS
// are never seen. Nothing here touches the head.

/**
 * True when the admin runs as the installed app (from the home screen, or as a
 * desktop app), not in a browser tab. `navigator.standalone` is iOS's own flag;
 * the media query covers Chrome and current Safari.
 */
export const isInstalledApp = (): boolean =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;
