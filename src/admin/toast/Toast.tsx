import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { adminCopy as copy } from '../../data/adminCopy';

// The undo toast (spec 2.3). One at a time; a new one replaces the old. It stays
// 6s, and the clock stops while the pointer or focus is on it. After Undo it
// says "Undone." for 2s.

export interface ToastAction {
  label: string;
  onAction: () => void;
}

export interface ToastApi {
  show: (toast: { text: string; action?: ToastAction }) => void;
  /** "That didn't save…", with Try again when there's something to retry. */
  error: (retry?: () => void) => void;
}

interface Shown {
  id: number;
  text: string;
  action?: ToastAction;
  isError?: boolean;
  ms: number;
}

const SHOW_MS = 6000;
const UNDONE_MS = 2000;

const ToastContext = createContext<ToastApi | null>(null);

export const useToast = (): ToastApi => {
  const toast = useContext(ToastContext);
  if (!toast) throw new Error('useToast must be used inside ToastProvider');
  return toast;
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [shown, setShown] = useState<Shown | null>(null);
  const [paused, setPaused] = useState(false);
  const nextId = useRef(0);

  const put = useCallback((toast: Omit<Shown, 'id'>) => {
    setPaused(false);
    setShown({ ...toast, id: ++nextId.current });
  }, []);

  const api = useMemo<ToastApi>(() => ({
    show: ({ text, action }) => put({ text, action, ms: SHOW_MS }),
    error: (retry) => put({
      text: copy.toast.failed,
      action: retry && { label: copy.toast.retry, onAction: retry },
      isError: true,
      ms: SHOW_MS,
    }),
  }), [put]);

  // Restarts on every new toast, and on resume after a pause.
  useEffect(() => {
    if (!shown || paused) return;
    const timer = setTimeout(() => setShown(null), shown.ms);
    return () => clearTimeout(timer);
  }, [shown, paused]);

  const onAction = () => {
    if (!shown?.action) return;
    const { label, onAction: run } = shown.action;
    run();
    // Undo confirms itself; other actions (View, Try again) lead elsewhere.
    if (label === copy.toast.undo) put({ text: copy.toast.undone, ms: UNDONE_MS });
    else setShown(null);
  };

  const pause = () => setPaused(true);
  const resume = (e: React.FocusEvent | React.PointerEvent) => {
    if (e.type === 'blur' && e.currentTarget.contains((e as React.FocusEvent).relatedTarget as Node)) return;
    setPaused(false);
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* Always in the page, so screen readers hear each new sentence. */}
      <div className="adm-toast-dock" role="status" aria-live="polite">
        {shown && (
          <div key={shown.id} className={`adm-toast${shown.isError ? ' adm-toast--error' : ''}`}
            onPointerEnter={pause} onPointerLeave={resume} onFocus={pause} onBlur={resume}>
            {shown.isError
              ? <AlertCircle size={20} aria-hidden="true" />
              : <CheckCircle2 className="adm-toast__tick" size={20} aria-hidden="true" />}
            <span className="adm-toast__text">{shown.text}</span>
            {shown.action && (
              <button type="button" className="adm-toast__action" onClick={onAction}>{shown.action.label}</button>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
};
