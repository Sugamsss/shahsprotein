import { useEffect, useState } from 'react';
import { getKitchenHistory, toAdminError } from '../api';

// The cooking history ships before its migration (20261010000000). Every link to it
// waits for one call to answer, and stays hidden when the answer is 'missing'. Asked
// once per page session. Any other failure still counts as there, so the history page
// can show its own error and Retry.
let answer: boolean | null = null;
let asking: Promise<boolean> | null = null;

const ask = (): Promise<boolean> => {
  asking ??= getKitchenHistory({ limit: 1 }).then(
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

/** False until the history is known to be on this database, and for good when it isn't. */
export const useHistoryAvailable = (): boolean => {
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
