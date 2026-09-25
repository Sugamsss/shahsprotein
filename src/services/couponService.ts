import type { CouponCheck } from '../types/order';

// Same format the database enforces (coupons.code and check_coupon()).
const COUPON_CODE_PATTERN = /^[A-Z0-9-]{3,24}$/i;
const CHECK_TIMEOUT_MS = 8000;

/** Trims spaces and upper-cases, so "  example10 " and "EXAMPLE10" are the same code. */
export function normalizeCouponCode(raw: string): string {
  return raw.trim().toUpperCase();
}

/** True if the code could be real, so the UI can skip a check for obvious typos. */
export function looksLikeCouponCode(code: string): boolean {
  return COUPON_CODE_PATTERN.test(code);
}

/**
 * Asks the server whether a code is good. Codes never live in the frontend.
 * `unavailable` means we couldn't find out (offline, timeout, rate limit, no
 * Supabase); never show that as "not valid".
 */
export async function checkCoupon(raw: string): Promise<CouponCheck> {
  const code = normalizeCouponCode(raw);

  if (!looksLikeCouponCode(code)) {
    return { status: 'invalid', code };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);

  try {
    // Loaded on first check so Supabase stays out of the landing bundle.
    const { supabase } = await import('./supabaseClient');
    if (!supabase) {
      return { status: 'unavailable', code };
    }

    const { data, error } = await supabase
      .rpc('check_coupon', { p_code: code })
      .abortSignal(controller.signal);

    if (error) {
      // Log the error only, never the code the person typed.
      console.error('[Coupon] Check failed', error);
      return { status: 'unavailable', code };
    }

    const result = data as { valid?: unknown; description?: unknown } | null;
    if (!result || typeof result !== 'object' || typeof result.valid !== 'boolean') {
      console.error('[Coupon] Unexpected response shape');
      return { status: 'unavailable', code };
    }

    if (result.valid && typeof result.description === 'string' && result.description.trim()) {
      return { status: 'valid', code, description: result.description.trim() };
    }

    return { status: 'invalid', code };
  } catch (error) {
    console.error('[Coupon] Check failed', error);
    return { status: 'unavailable', code };
  } finally {
    clearTimeout(timer);
  }
}
