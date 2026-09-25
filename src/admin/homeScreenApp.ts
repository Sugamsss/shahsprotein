import { useEffect } from 'react';
import { adminAppCopy } from '../data/adminAppCopy';

// Lets the owners add the admin to their home screen as its own app ("Shah's Orders").
// The tags go in only while the admin is mounted, so the landing page's head and
// bundle never change. iOS reads them when "Add to Home Screen" is tapped.

const MANIFEST = '/admin.webmanifest';
const APPLE_ICON = '/assets/admin-app/shahs-orders-apple-180.png';

/** The site's own manifest and touch icon step aside (their rel is renamed) while the admin's are in. */
const SITE_TAGS = 'link[rel="manifest"], link[rel="apple-touch-icon"]';

const make = <K extends 'link' | 'meta'>(tag: K, attrs: Record<string, string>) => {
  const el = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  return el;
};

export const useHomeScreenApp = (): void => {
  useEffect(() => {
    const head = document.head;
    const stepAside = [...head.querySelectorAll<HTMLLinkElement>(SITE_TAGS)].map((el) => {
      const rel = el.rel;
      el.rel = `x-site-${rel}`;
      return () => { el.rel = rel; };
    });

    const added = [
      make('link', { rel: 'manifest', href: MANIFEST }),
      make('link', { rel: 'apple-touch-icon', sizes: '180x180', href: APPLE_ICON }),
      make('meta', { name: 'mobile-web-app-capable', content: 'yes' }),
      make('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' }),
      make('meta', { name: 'apple-mobile-web-app-title', content: adminAppCopy.name }),
    ];
    added.forEach((el) => head.append(el));

    // Full screen on notched phones: the admin's CSS keeps clear of the notch and
    // home indicator with env(safe-area-inset-*), which only has values with cover.
    const viewport = head.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    const before = viewport?.content;
    if (viewport && before && !before.includes('viewport-fit')) viewport.content = `${before}, viewport-fit=cover`;

    return () => {
      added.forEach((el) => el.remove());
      stepAside.forEach((restore) => restore());
      if (viewport && before !== undefined) viewport.content = before;
    };
  }, []);
};
