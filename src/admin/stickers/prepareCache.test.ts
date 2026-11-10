import { describe, expect, it } from 'vitest';
import { clearPrepare, joinablePrepare, livePrepared, type PrepareJob } from './prepareCache';

// What the stage paints, in miniature: a prepared build is these picks plus the
// blob URL its bytes are behind.
interface Prepared {
  key: string;
  build: { url: string };
}

const prepared = (key: string, url: string): Prepared => ({ key, build: { url } });

describe('livePrepared', () => {
  it('hands over a build for these picks while its URL is the live one', () => {
    const ready = prepared('rj|250 g|back', 'blob:one');
    expect(livePrepared(ready, 'rj|250 g|back', 'blob:one')).toBe(ready);
  });

  it('drops a build whose URL a newer build revoked', () => {
    // The bug this guards: the pixels are still in memory, but Download and the
    // laptop Save both point at a blob URL that no longer exists.
    const ready = prepared('rj|250 g|back', 'blob:old');
    expect(livePrepared(ready, 'rj|250 g|back', 'blob:new')).toBeNull();
    expect(livePrepared(ready, 'rj|250 g|back', null)).toBeNull();
  });

  it('drops a build made for other picks, however live its URL', () => {
    expect(livePrepared(prepared('rj|250 g|back', 'blob:one'), 'rj|100 g|back', 'blob:one')).toBeNull();
  });

  it('has nothing to hand over when nothing was prepared', () => {
    expect(livePrepared(null, 'rj|250 g|back', 'blob:one')).toBeNull();
    expect(livePrepared(undefined, 'rj|250 g|back', 'blob:one')).toBeNull();
  });
});

describe('joinablePrepare', () => {
  it('joins the job already running for the same picks', () => {
    const job: PrepareJob<Prepared> = { key: 'rj|250 g|back', promise: Promise.resolve(null) };
    expect(joinablePrepare(job, 'rj|250 g|back')).toBe(job.promise);
  });

  it('does not hand the old promise to a different key', () => {
    const job: PrepareJob<Prepared> = { key: 'rj|250 g|back', promise: Promise.resolve(null) };
    expect(joinablePrepare(job, 'rj|500 g|back')).toBeNull();
  });

  it('has nothing to join when no job is running', () => {
    expect(joinablePrepare<Prepared>(null, 'rj|250 g|back')).toBeNull();
  });
});

describe('clearPrepare', () => {
  it('forgets the job that settled', () => {
    const job: PrepareJob<Prepared> = { key: 'rj|250 g|back', promise: Promise.resolve(null) };
    expect(clearPrepare(job, job)).toBeNull();
  });

  it('keeps a newer job that replaced it while it was running', () => {
    const older: PrepareJob<Prepared> = { key: 'rj|250 g|back', promise: Promise.resolve(null) };
    const newer: PrepareJob<Prepared> = { key: 'rj|100 g|back', promise: Promise.resolve(null) };
    expect(clearPrepare(newer, older)).toBe(newer);
  });
});

describe('the prepare cache, end to end', () => {
  it('rebuilds the same picks after their job settled and their URL died', async () => {
    // Exactly the repro from the review: a 250 g prepare finishes, a 100 g build
    // then revokes its URL, and he comes back to 250 g.
    const job: PrepareJob<Prepared> = { key: 'rj|250 g|back', promise: Promise.resolve(prepared('rj|250 g|back', 'blob:250')) };
    let current: PrepareJob<Prepared> | null = job;

    const settledValue = await job.promise;
    expect(livePrepared(settledValue, 'rj|250 g|back', 'blob:100')).toBeNull();

    current = clearPrepare(current, job);
    expect(joinablePrepare(current, 'rj|250 g|back')).toBeNull();
    // With nothing to join and nothing live, the tap builds again rather than
    // opening the stage on bytes that cannot be saved.
    expect(current).toBeNull();
  });
});
