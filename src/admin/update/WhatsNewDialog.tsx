import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useDialog } from '../../components/ui/useDialog';
import { adminCopy } from '../../data/adminCopy';
import { dimStatusBar } from '../homeScreenApp';
import { useWhatsNew } from './useWhatsNew';

const copy = adminCopy.whatsNew;

// "What's new" after an update: a centred dialog at every size (design "Capnia",
// temp/changelog-designs/centred/). Shows on Home only, once per person; ×, Esc,
// a tap on the backdrop and "Got it" all close it and mark it seen. Focus trap,
// Esc, the scroll lock and the exit come from useDialog, like AdminSheet; it keeps
// role="dialog", which is also what holds an update's reload while it's open.
// Every note is in the "What to try" box, the only thing that scrolls.

/** The box's list, with soft edges only where there's more to scroll that way. */
const NoteList: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const list = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const el = list.current;
    if (!el) return;
    const edges = () => {
      el.classList.toggle('has-above', el.scrollTop > 2);
      el.classList.toggle('has-below', el.scrollTop + el.clientHeight < el.scrollHeight - 2);
    };
    edges();
    el.addEventListener('scroll', edges, { passive: true });
    const resize = new ResizeObserver(edges);
    resize.observe(el);
    return () => { el.removeEventListener('scroll', edges); resize.disconnect(); };
  }, []);
  // Focusable, so the keyboard can scroll it.
  return <ul ref={list} className="wd-box__list" tabIndex={0} aria-label={copy.box}>{children}</ul>;
};

export const WhatsNewDialog: React.FC = () => {
  const { notes, show, markSeen } = useWhatsNew();
  const { dialogRef, isClosing, requestClose } = useDialog({ isOpen: show, onClose: markSeen });
  const layerRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // The status bar dims with the page while it's up (and until its exit ends).
  useEffect(() => (show && layerRef.current ? dimStatusBar(layerRef.current) : undefined), [show]);

  if (!show) return null;

  return createPortal(
    <div ref={layerRef} className={`wd-layer${isClosing ? ' is-closing' : ''}`} onClick={requestClose}>
      <div ref={dialogRef} className="wd" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        onClick={(event) => event.stopPropagation()}>
        <div className="wd-head">
          <div>
            <h2 id={titleId} className="wd-title" tabIndex={-1}>{copy.title}</h2>
            <p className="wd-sub">{copy.sub}</p>
          </div>
          <button type="button" className="wd-close" aria-label={adminCopy.close} onClick={requestClose}>
            <X size={20} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
        <div className="wd-box">
          <div className="wd-box__head" aria-hidden="true">
            <span>{copy.box}</span>
            {notes.length > 3 && <span className="wd-box__count">{copy.count(notes.length)}</span>}
          </div>
          <NoteList>
            {notes.map((note) => (
              <li key={note.id} className="wd-note">
                <p className="wd-note__title">
                  {note.kind && <span className="wd-note__kind">{copy.kinds[note.kind]} · </span>}
                  {note.title}
                </p>
                <p className="wd-note__body">{note.body}</p>
              </li>
            ))}
          </NoteList>
        </div>
        <button type="button" className="adm-btn adm-btn--primary adm-btn--block wd-ok" onClick={requestClose}>{copy.gotIt}</button>
      </div>
    </div>,
    document.body,
  );
};
