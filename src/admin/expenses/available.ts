import { useEffect, useState } from 'react';
import { getExpenses, toAdminError } from '../api';

// Expenses ship before their migration (20261114000000). More's link and the page
// wait for one call to answer, and stay hidden when the answer is 'missing'. Asked
// once per page session; any other failure still counts as there, so the screen can
// show its own error and Retry.
let answer: boolean | null = null;
let asking: Promise<boolean> | null = null;

const ask = (): Promise<boolean> => {
  asking ??= getExpenses().then(
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

/** False until expenses are known to be on this database, and for good when they aren't. */
export const useExpensesAvailable = (): boolean => {
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
