// After a deploy, a page that was already open still asks for the old build's
// lazy chunks (the order popup, the admin, supabase-js). They're gone, so the
// import fails and Vite fires `vite:preloadError`. A reload fetches the new
// build. This is in the landing entry because the admin chunk itself can be the
// one that fails; once the admin is running it takes over with its own safe
// reload (src/admin/update/appUpdate.ts), and the error still reaches the
// screen's own handling either way.

let handler: (() => void) | null = null;

/** The admin sets its safe reload here while it's mounted; null gives it back. */
export const onStaleChunk = (next: (() => void) | null): void => {
  handler = next;
};

const GUARD = 'shahs-chunk-reload';

/** Reloads at most once a minute, so a chunk that's really broken can't loop. No storage, no reload. */
const reloadOnce = () => {
  try {
    if (Date.now() - Number(sessionStorage.getItem(GUARD)) < 60_000) return;
    sessionStorage.setItem(GUARD, String(Date.now()));
  } catch {
    return;
  }
  window.location.reload();
};

/** Something typed on the page (the sign-up email): don't wipe it. */
const typed = () =>
  [...document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea')]
    .some((field) => !/^(checkbox|radio|hidden|button|submit)$/.test(field.type) && field.value.trim() !== '');

export const listenForStaleChunks = (): void => {
  window.addEventListener('vite:preloadError', () => {
    if (handler) return handler();
    if (!typed()) return reloadOnce();
    // Wait until they leave the page, so the typing isn't lost in front of them.
    const onHide = () => {
      if (document.visibilityState !== 'hidden') return;
      document.removeEventListener('visibilitychange', onHide);
      reloadOnce();
    };
    document.addEventListener('visibilitychange', onHide);
  });
};
