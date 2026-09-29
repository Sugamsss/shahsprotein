import { useEffect, useRef } from 'react';

// "I have unsaved work": the one way a screen tells the admin not to reload for
// an update yet (src/admin/update/appUpdate.ts). A screen passes a check, and
// the check is asked only when a reload is being considered, so it reads refs
// and state as they are at that moment and never needs to be kept in sync.
//
//   useUnsavedWork(() => dirty.current);
//
// Open sheets, a focused field and a waiting Undo toast are already covered.
// Use this for what those miss: a form page with typing in it, a field that
// saves as you type but hasn't yet.

type Check = { current: () => boolean };
const checks = new Set<Check>();
/** RPCs on their way (api.ts): a reload would cut a save off mid-air. */
let inFlight = 0;

/** True while any mounted screen says it has unsaved work, or a request is out. */
export const hasUnsavedWork = (): boolean => inFlight > 0 || [...checks].some((check) => check.current());

/** Holds updates while `isUnsaved()` is true. Asked lazily; safe to read refs in it. */
export const useUnsavedWork = (isUnsaved: () => boolean): void => {
  const check = useRef(isUnsaved);
  check.current = isUnsaved;
  useEffect(() => {
    checks.add(check);
    return () => { checks.delete(check); };
  }, []);
};

/** Holds updates until `work` settles. */
export const holdUntilDone = async <T>(work: Promise<T>): Promise<T> => {
  inFlight++;
  try {
    return await work;
  } finally {
    inFlight--;
  }
};
