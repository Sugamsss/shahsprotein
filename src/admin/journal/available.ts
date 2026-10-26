import { useEffect, useState } from 'react';
import { getHomeExtras, toAdminError } from '../api';

// The journal, to-dos and ingredients ship before their migration (20261026000000).
// Until it's live, their RPCs answer 'missing': the tab bar and header keep the old
// Customers tab, and every link to them stays hidden. The last answer is kept on the
// device so the tab bar doesn't change under the finger on each load; a device that has
// never asked assumes it's live (the migration goes in with the release).

const KEY = 'adm-journal-on';
let answer: boolean | null = null;
let asking: Promise<boolean> | null = null;
const listeners = new Set<(on: boolean) => void>();

const stored = (): boolean | null => {
  try {
    const value = localStorage.getItem(KEY);
    return value === '1' ? true : value === '0' ? false : null;
  } catch {
    return null;
  }
};

/** Home's own get_admin_home_extras answer says it too, so nothing asks twice. */
export const noteJournalAnswer = (on: boolean): void => {
  answer = on;
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    // Not kept; asked again next time.
  }
  for (const listener of listeners) listener(on);
};

/** Any failure but 'missing' still counts as there, so a page shows its own error and Retry. */
export const noteJournalError = (error: unknown): void => {
  if (toAdminError(error).kind === 'missing') noteJournalAnswer(false);
};

const ask = (): Promise<boolean> => {
  asking ??= getHomeExtras().then(
    () => { noteJournalAnswer(true); return true; },
    (error: unknown) => {
      asking = null;
      if (toAdminError(error).kind === 'missing') { noteJournalAnswer(false); return false; }
      return answer ?? stored() ?? true;
    },
  );
  return asking;
};

/** Whether the journal, to-dos and ingredients are on this database. */
export const useJournalAvailable = (): boolean => {
  const [on, setOn] = useState<boolean>(() => answer ?? stored() ?? true);
  useEffect(() => {
    listeners.add(setOn);
    if (answer === null) void ask().then(setOn);
    else setOn(answer);
    return () => { listeners.delete(setOn); };
  }, []);
  return on;
};
