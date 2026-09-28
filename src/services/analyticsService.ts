import { Theme } from '../types/theme';
import { isLiveSite, postPublicRpc } from './publicRpc';

/** Events the `track_site_event` RPC accepts. Adding one needs a migration too. */
export type SiteEvent = 'whatsapp_order_click';

type DeviceType = 'mobile' | 'tablet' | 'desktop';

const getDeviceType = (): DeviceType => {
  if (window.matchMedia('(max-width: 640px)').matches) return 'mobile';
  if (window.matchMedia('(max-width: 1024px)').matches) return 'tablet';
  return 'desktop';
};

/** The theme on screen right now, as the inline script and ThemeContext set it. */
const getTheme = (): Theme | null => {
  const theme = document.documentElement.dataset.theme;
  return theme === 'light' || theme === 'dark' ? theme : null;
};

export class AnalyticsService {
  /**
   * Records an anonymous event in Supabase (`site_events`). Fire and forget: the
   * request starts and the caller moves on, so a click is never delayed.
   * `keepalive` lets it finish if the page is closing. Failures are ignored.
   */
  static trackSiteEvent(event: SiteEvent, source: string): void {
    this.trackEvent(event, { source });
    if (!isLiveSite()) return;
    postPublicRpc('track_site_event', {
      p_event: event,
      p_source: source,
      p_device_type: getDeviceType(),
      p_theme: getTheme(),
    });
  }

  static trackEvent(eventName: string, properties?: Record<string, unknown>): void {
    if (import.meta.env.DEV) console.log(`[Analytics] Event: ${eventName}`, properties || '');
  }
}
