import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children }) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Store previously focused element to restore upon closing
    previousActiveElement.current = document.activeElement as HTMLElement | null;

    document.body.style.overflow = 'hidden';

    // Focus the first focusable element or modal container
    const focusableSelector =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

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
        onClose();
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
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyDown);

      // Restore focus to previously active element
      if (previousActiveElement.current) {
        previousActiveElement.current.focus();
      }
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const titleId = title ? `modal-title-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : undefined;

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 'var(--z-modal-overlay)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        backgroundColor: 'rgba(0, 0, 0, 0.72)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
      onClick={onClose}
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="glass-card animate-fade-in modal-dialog"
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: '600px',
          overflowY: 'auto',
          backgroundColor: 'var(--color-bg-main)',
          border: '1px solid var(--color-border-hover)',
          boxShadow: 'var(--shadow-card)',
          zIndex: 'var(--z-modal)',
          transform: 'scale(1)',
          outline: 'none',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* On phones this row sticks to the top, so close stays in reach. */}
        <div className="modal-head">
          {title && (
            <h3 id={titleId} className="modal-title">
              {title}
            </h3>
          )}

          <button onClick={onClose} aria-label="Close Modal" className="modal-close-btn">
            <X size={20} />
          </button>
        </div>

        {children}
      </div>
    </div>,
    document.body
  );
};
