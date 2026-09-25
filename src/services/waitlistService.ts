import type { Theme } from '../types/theme';
import { WaitlistResponse } from '../types/waitlist';
import { siteConfig } from '../data/siteConfig';

// Sign-ups are double opt-in (Loops), so a new sign-up is pending until the link is tapped.
const DUPLICATE_MESSAGE = "This email is already on our list. If you haven't confirmed yet, look for our email in your inbox (or spam).";
const CONFIRMATION_MESSAGE = "Almost there. We've sent you an email. Tap the link inside to confirm.";
const FALLBACK_MESSAGE = "Sorry, that didn't go through. Please try again in a moment.";
// Stored with each consenting sign-up so the record shows what the person agreed to.
// waitlist-v1: "I agree to receive an email about the product launch." (pre-launch)
// updates-v1: "Email me about new products from Shah's Nutrition. I can unsubscribe anytime."
const CONSENT_VERSION = 'updates-v1';

export class WaitlistService {
  static validateEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  }

  static async submitEmail(
    email: string,
    source = 'hero',
    productId?: string,
    marketingConsent = false,
    theme?: Theme,
  ): Promise<WaitlistResponse> {
    const trimmed = email.trim();

    if (!this.validateEmail(trimmed)) {
      return { success: false, message: 'Please enter a valid email address.', totalCount: this.getStoredCount() };
    }

    // Loaded on first submit so Supabase stays out of the landing bundle.
    const { supabase } = await import('./supabaseClient');
    if (!supabase) {
      return { success: false, message: FALLBACK_MESSAGE, totalCount: this.getStoredCount() };
    }

    const { data, error } = await supabase.rpc('submit_waitlist_member', {
      p_email: trimmed,
      p_source: source,
      p_product_id: productId || null,
      // The theme is kept on the member. Session fields (dwell, UTM, active time) are no longer sent.
      p_theme: theme || null,
      p_marketing_consent: marketingConsent,
      p_consent_version: marketingConsent ? CONSENT_VERSION : null,
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
      message: result.already_subscribed ? DUPLICATE_MESSAGE : CONFIRMATION_MESSAGE,
      totalCount: Number(result.total_count) || 0,
    };

    if (response.success && !response.alreadySubscribed) {
      // Email delivery is intentionally non-blocking: joining the list should
      // still succeed if the provider is temporarily unavailable.
      void supabase.functions.invoke('sync-waitlist-loops', {
        body: { email: trimmed, source },
      });
    }

    return response;
  }

  static getStoredCount(): number {
    return siteConfig.waitlist.initialCount;
  }
}
