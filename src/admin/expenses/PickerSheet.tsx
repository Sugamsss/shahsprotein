import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useDialog } from '../../components/ui/useDialog';
import { adminCopy } from '../../data/adminCopy';
import { dimStatusBar } from '../homeScreenApp';
import { useIsWide } from './useIsWide';

// The in-house date and time pickers' frame. Nothing native: a bottom sheet on a
// phone, a 320px popover tucked under its field on a laptop. Focus, Esc, the page
// lock and the focus back to the field all come from useDialog, the same as every
// other admin popup. It ships over "Your order"-style sheets: the newest dialog
// takes the keys, so Esc closes this before the expense sheet behind it.

export const PickerSheet: React.FC<{
  title: string;
  /** The field the popover points at, and the place focus goes back to. */
  anchor: HTMLElement | null;
  /** 'date' narrows the laptop popover; 'time' keeps it wide for three wheels. */
  kind: 'date' | 'time';
  onClose: () => void;
  initialFocus: React.RefObject<HTMLElement>;
  /** The pinned buttons: Today, or Now + Done. */
  bar: React.ReactNode;
  children: React.ReactNode;
  /** Filled with the popup's own close (with its exit), for a pick to use. */
  closeRef?: React.MutableRefObject<() => void>;
}> = ({ title, anchor, kind, onClose, initialFocus, bar, children, closeRef }) => {
  const wide = useIsWide();
  const { dialogRef, isClosing, requestClose } = useDialog({ isOpen: true, onClose, initialFocus });
  const layerRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (closeRef) closeRef.current = requestClose;
    return () => { if (closeRef) closeRef.current = () => undefined; };
  }, [closeRef, requestClose]);

  useEffect(() => (layerRef.current ? dimStatusBar(layerRef.current) : undefined), []);

  // Laptop: tuck it under the field, and flip above it when the foot of the screen is near.
  const place = useCallback(() => {
    const box = dialogRef.current;
    if (!box || !anchor) return;
    const rect = anchor.getBoundingClientRect();
    const width = box.offsetWidth;
    const height = box.offsetHeight;
    const left = Math.max(8, Math.min(window.innerWidth - width - 8, rect.left));
    const below = rect.bottom + 8 + height <= window.innerHeight - 8;
    const top = below ? rect.bottom + 8 : Math.max(8, rect.top - 8 - height);
    setPos({ top, left });
  }, [anchor, dialogRef]);

  useLayoutEffect(() => {
    if (!wide) { setPos(null); return undefined; }
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [wide, place]);

  // The one dynamic position in the admin: a popover has to sit at its field, which
  // only the browser knows. Everything else about it is a class.
  const style = wide && pos ? { top: pos.top, left: pos.left } : wide ? { visibility: 'hidden' as const } : undefined;

  return createPortal(
    <div
      ref={layerRef}
      className={`adm-sheet-layer adm-picker-layer${kind === 'time' ? ' adm-picker-layer--time' : ''}${isClosing ? ' is-closing' : ''}`}
      onClick={(event) => { if (event.target === event.currentTarget) requestClose(); }}
    >
      {/* The arrow keys and Tab stay inside; the sheet behind waits its turn (useDialog). */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={wide ? title : undefined}
        aria-labelledby={wide ? undefined : titleId}
        className="adm-sheet"
        style={style}
        onClick={(event) => event.stopPropagation()}
      >
        {!wide && (
          <div className="adm-sheet__head">
            <span className="adm-sheet__grab" aria-hidden="true" />
            <h2 id={titleId} className="adm-sheet__title">{title}</h2>
            <div className="adm-sheet__actions">
              <button type="button" className="adm-sheet__close" aria-label={adminCopy.close} onClick={requestClose}>
                <X size={20} strokeWidth={1.75} aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
        <div className="adm-sheet__body">{children}</div>
        <div className="adm-sheet__bar">{bar}</div>
      </div>
    </div>,
    document.body,
  );
};
