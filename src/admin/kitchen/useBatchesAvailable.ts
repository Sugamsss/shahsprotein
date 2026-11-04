import { useEffect, useState } from 'react';
import { getBatches, toAdminError } from '../api';

// Batch numbers ship before their migration (20261104000000). The Batches page, its links
// and "Pick batch" on an order covered by hand wait for one call to answer, and stay hidden
// when the answer is 'missing'. Asked once per page session; any other failure still counts
// as there, so the page can show its own error and Retry. (Batch numbers themselves show
// whenever the answers carry `code`.)
let answer: boolean | null = null;
let asking: Promise<boolean> | null = null;

const ask = (): Promise<boolean> => {
  asking ??= getBatches({ limit: 1 }).then(
    () => { answer = true; return true; },
    (err: unknown) => {
      if (toAdminError(err).kind === 'missing') {
        answer = false;
        return false;
      }
      asking = null;
      return true;
    },
  );
  return asking;
};

/** False until batch numbers are known to be on this database, and for good when they aren't. */
export const useBatchesAvailable = (): boolean => {
  const [on, setOn] = useState(answer === true);
  useEffect(() => {
    if (answer !== null) {
      setOn(answer);
      return;
    }
    let live = true;
    void ask().then((value) => { if (live) setOn(value); });
    return () => { live = false; };
  }, []);
  return on;
};

/** The Batches page, opened on one batch number (or any search). */
export const BATCHES_PATH = '/admin/batches';
export const batchLink = (code: string) => `${BATCHES_PATH}?q=${encodeURIComponent(code)}`;
