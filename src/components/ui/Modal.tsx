import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { DialogCloseContext, useDialog, useDialogClose } from './useDialog';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  /** Extra class on the dialog box, e.g. `order-dialog`. */
  className?: string;
  children: React.ReactNode;
}

/** For buttons inside a popup's content that close it, like "Done". */
export const useModalClose = useDialogClose;

// Focus trap, focus restore, Esc, the scroll lock and the 240ms exit live in useDialog,
// shared with the admin's sheets. This adds the site's look and the in-place title switch.
export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, className, children }) => {
  const { dialogRef: modalRef, isClosing, requestClose } = useDialog({ isOpen, onClose });
  const titleRef = useRef<HTMLHeadingElement>(null);

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
            <h3 id={titleId} ref={titleRef} tabIndex={-1} className="modal-title">
              {title}
            </h3>
          )}

          <button type="button" onClick={requestClose} aria-label="Close Modal" className="modal-close-btn">
            <X size={20} />
          </button>
        </div>

        <DialogCloseContext.Provider value={requestClose}>{children}</DialogCloseContext.Provider>
      </div>
    </div>,
    document.body
  );
};
