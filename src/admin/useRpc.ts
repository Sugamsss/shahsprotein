import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';
import { AdminError, toAdminError } from './api';

interface Options {
  /** Load again when the window regains focus or the tab becomes visible. */
  refreshOnFocus?: boolean;
  /** Load again on this interval while the tab is visible. */
  refreshEveryMs?: number;
}

// A focus refresh within this long of the last load is skipped.
const FOCUS_THROTTLE_MS = 10_000;

/** Loads `load()` when `deps` change. Only the latest call's answer is kept. */
export function useRpc<T>(load: () => Promise<T>, deps: DependencyList, options: Options = {}) {
  const { refreshOnFocus = false, refreshEveryMs } = options;
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<AdminError | null>(null);
  const [loading, setLoading] = useState(true);
  const loadRef = useRef(load);
  loadRef.current = load;
  const latest = useRef(0);
  const lastLoadAt = useRef(0);

  const reload = useCallback(async () => {
    const call = ++latest.current;
    lastLoadAt.current = Date.now();
    setLoading(true);
    try {
      const value = await loadRef.current();
      if (call === latest.current) { setData(value); setError(null); }
    } catch (err) {
      if (call === latest.current) setError(toAdminError(err));
    } finally {
      if (call === latest.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    return () => { latest.current++; }; // ignore answers that land after this
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!refreshOnFocus && !refreshEveryMs) return;
    const visible = () => document.visibilityState === 'visible';
    const onFocus = () => {
      if (visible() && Date.now() - lastLoadAt.current > FOCUS_THROTTLE_MS) void reload();
    };
    if (refreshOnFocus) {
      window.addEventListener('focus', onFocus);
      document.addEventListener('visibilitychange', onFocus);
    }
    const timer = refreshEveryMs ? window.setInterval(() => visible() && reload(), refreshEveryMs) : undefined;
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
      window.clearInterval(timer);
    };
  }, [refreshOnFocus, refreshEveryMs, reload]);

  return { data, error, loading, reload, setData };
}
