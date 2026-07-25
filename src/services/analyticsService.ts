/**
 * Analytics Service interface for tracking user interactions.
 */
export class AnalyticsService {
  static trackEvent(eventName: string, properties?: Record<string, any>): void {
    if (import.meta.env.DEV) {
      console.log(`[Analytics] Event: ${eventName}`, properties || '');
    }
    // Future integration: Segment / Google Analytics 4 / Mixpanel
  }

  static trackPageView(path: string): void {
    if (import.meta.env.DEV) {
      console.log(`[Analytics] PageView: ${path}`);
    }
  }
}
