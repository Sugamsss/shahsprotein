// The decisions under the instant-Create cache.
//
// Create is a paint, not a build: while the picks sit still, their sheet is made
// and its sticker drawn, and the tap collects what is already there. That cache
// has two ways to hand back bytes that can no longer be saved, and neither shows
// up in the types, because a revoked blob URL is still a string:
//
//   1. A finished prepare is not join-state. It resolved against the URL that was
//      live at that moment; any later build for other picks revokes it. So a tap
//      may only join a job that is still running, and a settled one is forgotten.
//   2. Even a running job can resolve after a newer build landed, so whatever it
//      hands over is checked against the live URL once more, at use.
//
// Kept out of the page so both rules can be tested without a browser.

/** One prepare in flight: a build and its sticker, for exactly these picks. */
export interface PrepareJob<P> {
  key: string;
  promise: Promise<P | null>;
}

/** Something made ahead of the tap; its blob URL is the only handle we can check. */
export interface LiveBuild {
  key: string;
  build: { url: string };
}

/**
 * What may be painted: these picks, and only while their pixels can still be
 * saved. A build whose URL was revoked is dropped, never shown.
 */
export function livePrepared<P extends LiveBuild>(
  ready: P | null | undefined,
  key: string,
  liveUrl: string | null,
): P | null {
  return ready != null && ready.key === key && ready.build.url === liveUrl ? ready : null;
}

/** A tap may join an in-flight job for these picks; a finished one is never handed back. */
export function joinablePrepare<P>(job: PrepareJob<P> | null, key: string): Promise<P | null> | null {
  return job !== null && job.key === key ? job.promise : null;
}

/**
 * Forget a job once it settles, but only the one that settled: a newer job that
 * replaced it meanwhile is how the next tap joins, so it stays.
 */
export function clearPrepare<P>(current: PrepareJob<P> | null, finished: PrepareJob<P>): PrepareJob<P> | null {
  return current === finished ? null : current;
}
