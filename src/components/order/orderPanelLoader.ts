import React from 'react';

// The popup body is its own chunk, so the landing page stays light. It's
// fetched when the browser is idle after load, and again (a no-op by then) as
// soon as a pointer or focus reaches any button that opens it.

let pending: Promise<typeof import('./OrderPanel')> | null = null;

export const preloadOrderPanel = (): Promise<typeof import('./OrderPanel')> => {
  if (!pending) {
    pending = import('./OrderPanel').catch((error: unknown) => {
      // Let a later open try again (a flaky network shouldn't stick).
      pending = null;
      throw error;
    });
  }
  return pending;
};

export const LazyOrderPanel = React.lazy(() => preloadOrderPanel().then((m) => ({ default: m.OrderPanel })));
