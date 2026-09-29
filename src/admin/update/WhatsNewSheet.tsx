import React, { useEffect, useRef } from 'react';
import { useDialogClose } from '../../components/ui/useDialog';
import { adminCopy } from '../../data/adminCopy';
import { AdminSheet } from '../AdminSheet';
import { useWhatsNew } from './useWhatsNew';

const copy = adminCopy.whatsNew;

// "What's new" after an update (design A, temp/changelog-designs/). Shows on
// Home only, once per person; ×, Esc, the backdrop and "Got it" all mark it seen.
// Every note is in the "What to try" box, and only that box scrolls, however
// many updates they skipped.

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
  return <ul ref={list} className="wn-box__list" tabIndex={0} aria-label={copy.box}>{children}</ul>;
};

/** Closes the way × does (with the sheet's exit), and closing marks it seen. */
const GotIt: React.FC = () => {
  const close = useDialogClose();
  return <button type="button" className="adm-btn adm-btn--primary adm-btn--block" onClick={close}>{copy.gotIt}</button>;
};

export const WhatsNewSheet: React.FC = () => {
  const { notes, show, markSeen } = useWhatsNew();
  return (
    <AdminSheet
      isOpen={show}
      onClose={markSeen}
      className="wn"
      title={<><span>{copy.title}</span><span className="wn-sub">{copy.sub}</span></>}
      closeLabel={adminCopy.close}
      bar={<GotIt />}
    >
      <div className="wn-box">
        <div className="wn-box__head" aria-hidden="true">
          <span>{copy.box}</span>
          {notes.length > 3 && <span className="wn-box__count">{copy.count(notes.length)}</span>}
        </div>
        <NoteList>
          {notes.map((note) => (
            <li key={note.id} className="wn-note">
              <p className="wn-note__title">
                {note.kind && <span className="wn-note__kind">{copy.kinds[note.kind]} · </span>}
                {note.title}
              </p>
              <p className="wn-note__body">{note.body}</p>
            </li>
          ))}
        </NoteList>
      </div>
    </AdminSheet>
  );
};
