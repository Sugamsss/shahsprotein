import { useSyncExternalStore } from 'react';

// Slice A's RPCs (`get_website_offer`, `quote_website_order`,
// `submit_website_request_v2`) ship before their migrations. Until those are
// applied, PostgREST answers 404 for each of them, and the site must keep the
// behaviour it has in production today: the live price book's MRPs, a priced
// message and the legacy save. Whichever call sees the first 404 flips this
// one flag; an ordinary network failure or timeout never does, so a flaky
// connection cannot silently switch the pricing model.
//
// It lives in memory for the visit: a fresh load asks again (one cheap 404).

let missing = false;
const listeners = new Set<() => void>();

export const markSliceAMissing = (): void => {
  if (missing) return;
  missing = true;
  listeners.forEach((listener) => listener());
};

export const sliceAMissing = (): boolean => missing;

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

/** Re-renders when the answer changes; components that price or send read this. */
export const useSliceAMissing = (): boolean => useSyncExternalStore(subscribe, sliceAMissing);

/** Tests only: forget what this visit learned. */
export const resetSliceA = (): void => {
  if (!missing) return;
  missing = false;
  listeners.forEach((listener) => listener());
};
