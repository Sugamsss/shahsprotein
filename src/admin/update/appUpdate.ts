import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { onStaleChunk } from '../../utils/staleChunk';
import { hasUnsavedWork } from '../unsavedWork';

// Updates install themselves (temp/changelog-brief.md). No service worker: each
// build writes /admin-release.json ({ build }, served no-store) and bakes the
// same id in here. The open admin asks for that file when it comes back into
// view, on focus and every 5 minutes, and when the ids differ it reloads, but
// only at a safe moment:
//   - no sheet or popup open, no field focused, not on Add or Edit order;
//   - nothing unsaved (useUnsavedWork: typing, a save as you type, a toast
//     with Undo waiting, an admin call on its way);
// and then only when a reload won't yank the page from under them: as it
// comes back into view, as it's hidden, right after an in-app page change, or
// once they've left it alone for a little while. Otherwise it waits.
//
// Loop guard: before reloading for build X it notes X in sessionStorage, and
// it never reloads for X again this session (a cached page that's still old
// can't loop). Without storage it doesn't reload at all.

/** This build's id (vite.config.ts). */
export const BUILD = __ADMIN_BUILD__;

const RELEASE_URL = '/admin-release.json';
const CHECK_EVERY_MS = 5 * 60_000;
/** A focus right after a check doesn't ask again. */
const CHECK_THROTTLE_MS = 10_000;
/** "Left alone": no tap, key, scroll or wheel for this long. */
const IDLE_MS = 20_000;
const IDLE_POLL_MS = 5_000;
/** After a page change, the old page's sheet may still be playing its exit. */
const AFTER_ROUTE_MS = 400;
const GUARD_KEY = 'shahs-admin-reloaded-for';

/** Add order and Edit order: never reload there, typed or not. */
const FORM_PAGE = /^\/admin\/orders\/(new|[^/]+\/edit)\/?$/;
/** Fields you type in (not switches, radios or buttons). */
const TYPING = 'input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]), textarea, select, [contenteditable="true"]';

/** The build to reload into, once it's safe; null when there's nothing newer. */
let pending: string | null = null;
let lastInput = Date.now();
let lastCheck = 0;

/** The newest build on the server, or null when it can't tell (offline, no file). */
const latestBuild = async (): Promise<string | null> => {
  try {
    const res = await fetch(RELEASE_URL, { cache: 'no-store' });
    if (!res.ok) return null;
    const { build } = (await res.json()) as { build?: unknown };
    return typeof build === 'string' && build ? build : null;
  } catch {
    return null;
  }
};

const reloadedFor = (): string | null => {
  try {
    return sessionStorage.getItem(GUARD_KEY);
  } catch {
    return null;
  }
};

/** Why not now; null when it's safe. */
const blocker = (): string | null => {
  if (FORM_PAGE.test(window.location.pathname)) return 'form page';
  if (document.querySelector('[role="dialog"]')) return 'sheet open';
  if (document.activeElement?.matches(TYPING)) return 'field focused';
  if (hasUnsavedWork()) return 'unsaved work';
  return null;
};

/**
 * Reloads into the pending build if it's safe. `idle` also asks that they've
 * left the page alone for a while (for checks that land while they're using it).
 */
const tryReload = (when: 'now' | 'idle'): void => {
  if (!pending || blocker()) return;
  if (when === 'idle' && Date.now() - lastInput < IDLE_MS) return;
  const target = pending;
  pending = null;
  try {
    if (reloadedFor() === target) return;
    sessionStorage.setItem(GUARD_KEY, target);
  } catch {
    return; // no guard, no reload
  }
  window.location.reload();
};

/** Asks the server; a newer build becomes pending (unless we already reloaded for it). */
const check = async (when: 'now' | 'idle'): Promise<void> => {
  lastCheck = Date.now();
  const latest = await latestBuild();
  if (!latest || latest === BUILD || latest === reloadedFor()) return;
  pending = latest;
  tryReload(when);
};

/**
 * Runs the update checks and the safe reload while the signed-in admin is
 * mounted (AdminLayout). Nothing in dev: there's no release file there.
 */
export const useAppUpdates = (): void => {
  const { pathname } = useLocation();

  useEffect(() => {
    if (import.meta.env.DEV) return;
    const onInput = () => { lastInput = Date.now(); };
    const inputs = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;
    inputs.forEach((type) => window.addEventListener(type, onInput, { capture: true, passive: true }));

    // Coming back: ask, and reload straight away if it's safe. Going away: the quietest moment of all.
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') tryReload('now');
      else void check('now');
    };
    const onFocus = () => {
      if (Date.now() - lastCheck > CHECK_THROTTLE_MS) void check('now');
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);
    const checkTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void check('idle');
    }, CHECK_EVERY_MS);
    const idleTimer = window.setInterval(() => tryReload('idle'), IDLE_POLL_MS);

    // A lazy chunk that failed to load (a deploy since this page opened): the same safe reload.
    // The target is this build's own marker, so it retries once a session at most.
    onStaleChunk(() => {
      pending ??= `chunk:${BUILD}`;
      tryReload('now');
    });

    void check('idle');
    return () => {
      inputs.forEach((type) => window.removeEventListener(type, onInput, { capture: true }));
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
      window.clearInterval(checkTimer);
      window.clearInterval(idleTimer);
      onStaleChunk(null);
    };
  }, []);

  // An in-app page change is a fine moment: the screen is changing anyway, and
  // the old page's leave guard (Add order's "Leave?") has already let them go.
  useEffect(() => {
    if (import.meta.env.DEV || !pending) return;
    const timer = window.setTimeout(() => tryReload('now'), AFTER_ROUTE_MS);
    return () => window.clearTimeout(timer);
  }, [pathname]);
};
