import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { siteConfig } from '../../data/siteConfig';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  /** Extra class on the title, e.g. `modal-title--product` (the serif product name). */
  titleClassName?: string;
  /** Extra class on the dialog box, e.g. `order-dialog`. */
  className?: string;
  children: React.ReactNode;
}

// Matches the exit animation in global.css (sheet slides down, dialog fades).
const EXIT_MS = 240;

const focusableSelector =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Closes the popup the same way the close button does (with the exit animation). */
const ModalCloseContext = createContext<() => void>(() => {});

/** For buttons inside a popup's content that close it, like "Done". */
export const useModalClose = (): (() => void) => useContext(ModalCloseContext);

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, titleClassName, className, children }) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);
  const [isClosing, setIsClosing] = useState(false);

  // The latest onClose, so a caller passing a new function never re-runs the
  // open effect (which would move focus and restore it again).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const close = useCallback(() => onCloseRef.current(), []);

  // Play the exit animation, then close. Instant for people who ask for less motion.
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

    // Store previously focused element to restore upon closing
    previousActiveElement.current = document.activeElement as HTMLElement | null;

    document.body.style.overflow = 'hidden';

    // Focus the first focusable element or modal container
    const timer = setTimeout(() => {
      if (modalRef.current) {
        const focusables = modalRef.current.querySelectorAll<HTMLElement>(focusableSelector);
        if (focusables.length > 0) {
          focusables[0].focus();
        } else {
          modalRef.current.focus();
        }
      }
    }, 0);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        requestClose();
        return;
      }

      if (e.key === 'Tab' && modalRef.current) {
        const focusables = Array.from(
          modalRef.current.querySelectorAll<HTMLElement>(focusableSelector)
        );

        if (focusables.length === 0) {
          e.preventDefault();
          return;
        }

        const firstElement = focusables[0];
        const lastElement = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement || !modalRef.current.contains(document.activeElement)) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement || !modalRef.current.contains(document.activeElement)) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(timer);
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);

      // Restore focus to previously active element
      if (previousActiveElement.current) {
        previousActiveElement.current.focus();
      }
    };
  }, [isOpen, requestClose]);

  // The title changed while open (the product popup switching to "Your order"):
  // start the new content from the top and move focus to the new title, so
  // focus never falls to the page when the old control goes away.
  const shownTitle = useRef(title);
  useEffect(() => {
    if (!isOpen) {
      shownTitle.current = title;
      return;
    }
    if (shownTitle.current === title) return;
    shownTitle.current = title;
    if (modalRef.current) modalRef.current.scrollTop = 0;
    titleRef.current?.focus();
  }, [isOpen, title]);

  if (!isOpen) return null;

  const titleId = title ? `modal-title-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : undefined;

  return createPortal(
    <div className={`modal-overlay${isClosing ? ' is-closing' : ''}`} onClick={requestClose}>
      <div
        ref={modalRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={className ? `modal-dialog ${className}` : 'modal-dialog'}
        onClick={(e) => e.stopPropagation()}
      >
        {/* On phones this row sticks to the top, so close stays in reach. */}
        <div className="modal-head">
          {title && (
            <h3
              id={titleId}
              ref={titleRef}
              tabIndex={-1}
              className={titleClassName ? `modal-title ${titleClassName}` : 'modal-title'}
            >
              {title}
            </h3>
          )}

          <button type="button" onClick={requestClose} aria-label={siteConfig.ui.close} className="modal-close-btn">
            <X size={20} />
          </button>
        </div>

        <ModalCloseContext.Provider value={requestClose}>{children}</ModalCloseContext.Provider>
      </div>
    </div>,
    document.body
  );
};
