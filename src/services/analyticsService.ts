import { Theme } from '../types/theme';
import { WaitlistAnalytics } from '../types/waitlist';

type SectionEntry = { enteredAt: number; totalSeconds: number };

let sessionKey = '';
let startedAt = 0;
let activeSeconds = 0;
let activeSince = 0;
let currentTheme: Theme = 'dark';
let sectionEntries = new Map<string, SectionEntry>();
let observer: IntersectionObserver | null = null;

const getDeviceType = (): WaitlistAnalytics['deviceType'] => {
  if (window.matchMedia('(max-width: 640px)').matches) return 'mobile';
  if (window.matchMedia('(max-width: 1024px)').matches) return 'tablet';
  return 'desktop';
};

const finishActiveTime = () => {
  if (activeSince) {
    activeSeconds += Math.max(0, Math.floor((Date.now() - activeSince) / 1000));
    activeSince = Date.now();
  }
};

export class AnalyticsService {
  static startSession(theme: Theme): () => void {
    sessionKey = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    startedAt = Date.now();
    activeSince = document.visibilityState === 'visible' ? startedAt : 0;
    activeSeconds = 0;
    currentTheme = theme;
    sectionEntries = new Map();

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        finishActiveTime();
        this.closeSections();
        activeSince = 0;
      } else {
        activeSince = Date.now();
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const sectionId = (entry.target as HTMLElement).id;
        if (!sectionId) return;
        const existing = sectionEntries.get(sectionId) || { enteredAt: 0, totalSeconds: 0 };
        if (entry.isIntersecting && !existing.enteredAt) {
          existing.enteredAt = Date.now();
        } else if (!entry.isIntersecting && existing.enteredAt) {
          existing.totalSeconds += Math.floor((Date.now() - existing.enteredAt) / 1000);
          existing.enteredAt = 0;
        }
        sectionEntries.set(sectionId, existing);
      });
    }, { threshold: 0.5 });

    document.querySelectorAll('section[id]').forEach((section) => observer?.observe(section));

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      observer?.disconnect();
      observer = null;
    };
  }

  static setTheme(theme: Theme): void {
    currentTheme = theme;
  }

  static closeSections(): void {
    const now = Date.now();
    sectionEntries.forEach((section) => {
      if (section.enteredAt) {
        section.totalSeconds += Math.floor((now - section.enteredAt) / 1000);
        section.enteredAt = now;
      }
    });
  }

  static getSessionSnapshot(): WaitlistAnalytics {
    finishActiveTime();
    this.closeSections();
    return {
      sessionKey,
      startedAt: startedAt ? new Date(startedAt).toISOString() : undefined,
      endedAt: new Date().toISOString(),
      activeSeconds,
      sectionDwell: Object.fromEntries([...sectionEntries].map(([id, value]) => [id, value.totalSeconds])),
      theme: currentTheme,
      deviceType: getDeviceType(),
      referrer: document.referrer || undefined,
      utmSource: new URLSearchParams(window.location.search).get('utm_source') || undefined,
      utmMedium: new URLSearchParams(window.location.search).get('utm_medium') || undefined,
      utmCampaign: new URLSearchParams(window.location.search).get('utm_campaign') || undefined,
    };
  }

  static trackEvent(eventName: string, properties?: Record<string, unknown>): void {
    if (import.meta.env.DEV) console.log(`[Analytics] Event: ${eventName}`, properties || '');
  }

  static trackPageView(path: string): void {
    if (import.meta.env.DEV) console.log(`[Analytics] PageView: ${path}`);
  }
}
