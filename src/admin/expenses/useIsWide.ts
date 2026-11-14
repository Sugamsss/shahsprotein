import { useEffect, useState } from 'react';

// Kept out of PickerSheet.tsx so that file exports only its component: a module
// with a hook and a component loses Fast Refresh.

const WIDE = '(min-width: 960px)';

/** True from 960px up, the admin's laptop layout. */
export const useIsWide = (): boolean => {
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia(WIDE).matches);
  useEffect(() => {
    const query = window.matchMedia(WIDE);
    const onChange = () => setWide(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return wide;
};
