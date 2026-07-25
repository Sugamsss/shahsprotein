import { WaitlistSubmission, WaitlistResponse } from '../types/waitlist';
import { siteConfig } from '../data/siteConfig';

const STORAGE_KEY = 'shahsnutrition_waitlist';
const COUNT_KEY = 'shahsnutrition_waitlist_count';

/**
 * Service to handle Waitlist submissions and state persistence.
 * Designed with a plug-and-play interface for future backend integration.
 */
export class WaitlistService {
  /**
   * Validate email syntax
   */
  static validateEmail(email: string): boolean {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email.trim());
  }

  /**
   * Submit an email to the waitlist
   */
  static async submitEmail(
    email: string,
    source = 'hero',
    productId?: string
  ): Promise<WaitlistResponse> {
    const trimmed = email.trim();

    if (!this.validateEmail(trimmed)) {
      return {
        success: false,
        message: 'Please enter a valid email address.',
        totalCount: this.getStoredCount(),
      };
    }

    // Simulate async network request
    await new Promise((resolve) => setTimeout(resolve, 600));

    const existing = this.getStoredSubmissions();
    const isAlreadySubscribed = existing.some(
      (sub) => sub.email.toLowerCase() === trimmed.toLowerCase()
    );

    if (isAlreadySubscribed) {
      return {
        success: true,
        message: "You're already on the VIP waitlist! We'll notify you first.",
        totalCount: this.getStoredCount(),
      };
    }

    // Save new submission
    const newSubmission: WaitlistSubmission = {
      email: trimmed,
      source,
      productId,
      createdAt: new Date().toISOString(),
    };

    existing.push(newSubmission);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));

    // Increment counter
    const newCount = this.getStoredCount() + 1;
    localStorage.setItem(COUNT_KEY, newCount.toString());

    return {
      success: true,
      message: 'Welcome aboard! You have joined the VIP waitlist.',
      totalCount: newCount,
    };
  }

  /**
   * Retrieve total stored waitlist count
   */
  static getStoredCount(): number {
    const stored = localStorage.getItem(COUNT_KEY);
    return stored ? parseInt(stored, 10) : siteConfig.waitlist.initialCount;
  }

  /**
   * Retrieve stored submissions list
   */
  private static getStoredSubmissions(): WaitlistSubmission[] {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  }
}
