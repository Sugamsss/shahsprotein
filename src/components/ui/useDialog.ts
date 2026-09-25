import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

// What every popup shares: the site's Modal and the admin's AdminSheet.
// While open: the page doesn't scroll, focus moves in and is trapped, Esc closes.
// On close: a 240ms exit (instant with reduced motion), then focus goes back.

/** Matches the exit animations in CSS (the sheet slides down, the dialog fades). */
export const EXIT_MS = 240;

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Open dialogs, newest last. Only the top one answers keys, so Esc on a sheet
// over the order popup closes just the sheet. The page stays locked until the last one closes.
const openDialogs: object[] = [];

export interface DialogOptions {
  isOpen: boolean;
  onClose: () => void;
  /** Where focus goes on open. Default: the first control, or the dialog itself. */
  initialFocus?: React.RefObject<HTMLElement>;
}

export interface Dialog {
  /** Goes on the dialog box (the element with role="dialog"). */
  dialogRef: React.RefObject<HTMLDivElement>;
  /** True during the exit animation. */
  isClosing: boolean;
  /** Plays the exit, then calls onClose. Use it for close buttons, Esc and the backdrop. */
  requestClose: () => void;
}

export const useDialog = ({ isOpen, onClose, initialFocus }: DialogOptions): Dialog => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [isClosing, setIsClosing] = useState(false);

  // The latest onClose, so a caller passing a new function never re-runs the
  // open effect (which would move focus and restore it again).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const close = useCallback(() => onCloseRef.current(), []);
  const initialFocusRef = useRef(initialFocus);
  initialFocusRef.current = initialFocus;

  const requestClose = useCallback(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      close();
      return;
    }
    setIsClosing(true);
  }, [close]);

  useEffect(() => {
    if (!isClosing) return;
    const timer = setTimeout(close, EXIT_MS);
    return () => clearTimeout(timer);
  }, [isClosing, close]);

  useEffect(() => {
    if (!isOpen) setIsClosing(false);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const self = {};
    openDialogs.push(self);
    const previousFocus = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';

    const timer = setTimeout(() => {
      const box = dialogRef.current;
      if (!box) return;
      const target = initialFocusRef.current?.current ?? box.querySelector<HTMLElement>(FOCUSABLE) ?? box;
      target.focus();
    }, 0);

    const onKeyDown = (event: KeyboardEvent) => {
      const box = dialogRef.current;
      if (openDialogs[openDialogs.length - 1] !== self || !box) return;
      if (event.key === 'Escape') {
        requestClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusables = Array.from(box.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusables.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const outside = !box.contains(document.activeElement);
      if (event.shiftKey ? document.activeElement === first || outside : document.activeElement === last || outside) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', onKeyDown);
      openDialogs.splice(openDialogs.indexOf(self), 1);
      if (openDialogs.length === 0) document.body.style.overflow = '';
      previousFocus?.focus();
    };
  }, [isOpen, requestClose]);

  return { dialogRef, isClosing, requestClose };
};

/** Closes the popup the same way its close button does (with the exit animation). */
export const DialogCloseContext = createContext<() => void>(() => {});

/** For buttons inside a popup's content that close it, like "Done". */
export const useDialogClose = (): (() => void) => useContext(DialogCloseContext);
