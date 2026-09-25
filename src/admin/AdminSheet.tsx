import React, { useId } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { DialogCloseContext, useDialog } from '../components/ui/useDialog';

// Every admin sheet and popup (spec 2.3): a bottom sheet under 960px, a centred
// popup from 960px over the frosted page. Head, a body that scrolls on its own,
// and an optional pinned bar. Focus, Esc, the scroll lock and the exit come
// from useDialog, the same as the site's popups. Content can close it with useDialogClose().

export interface AdminSheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** The heading, and the dialog's label. It can hold more than text (a code line, a name). */
  title: React.ReactNode;
  /** The close button's label (adminCopy). */
  closeLabel: string;
  children: React.ReactNode;
  /** Pinned at the bottom: the main button and anything beside it. */
  bar?: React.ReactNode;
  /** Beside the close button in the head, e.g. the order popup's ‹ › arrows. */
  actions?: React.ReactNode;
  /** The popup's width from 960px: 520 for sheets, 760 for an order, 920 for the order form. */
  width?: 520 | 760 | 920;
  /** Where focus goes on open. Default: the first control. */
  initialFocus?: React.RefObject<HTMLElement>;
  /** Extra class on the dialog box, for a screen's own layout inside it. */
  className?: string;
  /** Return false to keep it open when × , Esc or the backdrop is used (see useDialog). */
  canClose?: () => boolean;
}

export const AdminSheet: React.FC<AdminSheetProps> = ({
  isOpen, onClose, title, closeLabel, children, bar, actions, width = 520, initialFocus, className, canClose,
}) => {
  const { dialogRef, isClosing, requestClose } = useDialog({ isOpen, onClose, initialFocus, canClose });
  const titleId = useId();

  if (!isOpen) return null;

  const classes = ['adm-sheet', `adm-sheet--${width}`, className].filter(Boolean).join(' ');

  return createPortal(
    <div className={`adm-sheet-layer${isClosing ? ' is-closing' : ''}`} onClick={requestClose}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={classes}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="adm-sheet__head">
          <span className="adm-sheet__grab" aria-hidden="true" />
          <h2 id={titleId} className="adm-sheet__title" tabIndex={-1}>{title}</h2>
          <div className="adm-sheet__actions">
            {actions}
            <button type="button" className="adm-sheet__close" aria-label={closeLabel} onClick={requestClose}>
              <X size={20} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="adm-sheet__body">
          <DialogCloseContext.Provider value={requestClose}>{children}</DialogCloseContext.Provider>
        </div>
        {bar && (
          <div className="adm-sheet__bar">
            <DialogCloseContext.Provider value={requestClose}>{bar}</DialogCloseContext.Provider>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
};
