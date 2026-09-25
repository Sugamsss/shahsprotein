import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { adminCopy as copy } from '../../data/adminCopy';

// The undo toast (spec 2.3). One at a time; a new one replaces the old. It stays
// 6s, and the clock stops while the pointer or focus is on it. After Undo it
// says "Undone." for 2s.
//
// An order page or popup puts a <ToastSlot /> just above its next-step button.
// While one is there the toast shows in it, so it never covers that button, and
// in the popup the Undo is inside the dialog, where Tab can reach it.

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
/** Slots on screen, newest last: the toast goes to the last one. */
const SlotContext = createContext<(el: HTMLElement, on: boolean) => void>(() => {});

/** Where the toast shows while this is on screen (see above). */
export const ToastSlot: React.FC = () => {
  const register = useContext(SlotContext);
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    register(el, true);
    return () => register(el, false);
  }, [register]);
  return <div ref={ref} className="adm-toast-slot" />;
};

export const useToast = (): ToastApi => {
  const toast = useContext(ToastContext);
  if (!toast) throw new Error('useToast must be used inside ToastProvider');
  return toast;
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [shown, setShown] = useState<Shown | null>(null);
  const [paused, setPaused] = useState(false);
  const nextId = useRef(0);
  const [slots, setSlots] = useState<HTMLElement[]>([]);
  const registerSlot = useCallback((el: HTMLElement, on: boolean) => {
    setSlots((list) => (on ? [...list.filter((x) => x !== el), el] : list.filter((x) => x !== el)));
  }, []);
  const slot = slots[slots.length - 1];

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

  const toast = shown && (
    <div key={shown.id} className={`adm-toast${shown.isError ? ' adm-toast--error' : ''}`}
      onPointerEnter={pause} onPointerLeave={resume} onFocus={pause} onBlur={resume}>
      {shown.isError
        ? <AlertCircle size={20} aria-hidden="true" />
        : <CheckCircle2 className="adm-toast__tick" size={20} aria-hidden="true" />}
      {/* In a slot, the dock below says the words; this copy stays quiet. */}
      <span className="adm-toast__text" aria-hidden={slot ? true : undefined}>{shown.text}</span>
      {shown.action && (
        <button type="button" className="adm-toast__action" onClick={onAction}>{shown.action.label}</button>
      )}
    </div>
  );

  return (
    <ToastContext.Provider value={api}>
      <SlotContext.Provider value={registerSlot}>{children}</SlotContext.Provider>
      {/* Always in the page, so screen readers hear each new sentence. */}
      <div className="adm-toast-dock" role="status" aria-live="polite">
        {slot ? shown && <span key={shown.id} className="visually-hidden">{shown.text}</span> : toast}
      </div>
      {slot && toast && createPortal(toast, slot)}
    </ToastContext.Provider>
  );
};
