import { WaitlistAnalytics, WaitlistResponse } from '../types/waitlist';
import { siteConfig } from '../data/siteConfig';
import { supabase } from './supabaseClient';

const DUPLICATE_MESSAGE = "Love your enthusiasm! You've signed up already. We'll make sure you're the first one to get the updates as we launch.";
const FALLBACK_MESSAGE = 'The waitlist is temporarily unavailable. Please try again in a moment.';

export class WaitlistService {
  static validateEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  }

  static async submitEmail(
    email: string,
    source = 'hero',
    productId?: string,
    marketingConsent = false,
    analytics?: WaitlistAnalytics,
  ): Promise<WaitlistResponse> {
    const trimmed = email.trim();

    if (!this.validateEmail(trimmed)) {
      return { success: false, message: 'Please enter a valid email address.', totalCount: this.getStoredCount() };
    }

    if (!supabase) {
      return { success: false, message: FALLBACK_MESSAGE, totalCount: this.getStoredCount() };
    }

    const { data, error } = await supabase.rpc('submit_waitlist_member', {
      p_email: trimmed,
      p_source: source,
      p_product_id: productId || null,
      p_theme: analytics?.theme || null,
      p_marketing_consent: marketingConsent,
      p_consent_version: marketingConsent ? 'waitlist-v1' : null,
      p_session_key: analytics?.sessionKey || null,
      p_session_started_at: analytics?.startedAt || null,
      p_session_ended_at: analytics?.endedAt || null,
      p_active_seconds: analytics?.activeSeconds || 0,
      p_section_dwell: analytics?.sectionDwell || {},
      p_device_type: analytics?.deviceType || 'unknown',
      p_referrer: analytics?.referrer || null,
      p_utm_source: analytics?.utmSource || null,
      p_utm_medium: analytics?.utmMedium || null,
      p_utm_campaign: analytics?.utmCampaign || null,
    });

    if (error) {
      console.error('[Waitlist] Submission failed', error);
      return { success: false, message: FALLBACK_MESSAGE, totalCount: this.getStoredCount() };
    }

    const result = data as {
      success: boolean;
      already_subscribed: boolean;
      message: string;
      total_count: number;
    };

    const response = {
      success: result.success,
      alreadySubscribed: result.already_subscribed,
      message: result.already_subscribed ? DUPLICATE_MESSAGE : result.message,
      totalCount: Number(result.total_count) || 0,
    };

    if (response.success && !response.alreadySubscribed) {
      // Email delivery is intentionally non-blocking: joining the list should
      // still succeed if the provider is temporarily unavailable.
      void supabase.functions.invoke('send-waitlist-confirmation', { body: { email: trimmed } });
    }

    return response;
  }

  static getStoredCount(): number {
    return siteConfig.waitlist.initialCount;
  }

  static async getCount(): Promise<number> {
    if (!supabase) return this.getStoredCount();
    const { data, error } = await supabase.rpc('get_waitlist_count');
    if (error) return this.getStoredCount();
    return Number(data) || this.getStoredCount();
  }
}
