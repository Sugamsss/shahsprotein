import React from 'react';
import { adminCopy } from '../../data/adminCopy';
import { AdminSheet } from '../AdminSheet';
import { useWhatsNew } from './useWhatsNew';

const copy = adminCopy.whatsNew;

// PLACEHOLDER: working plumbing only. The look comes from the design pick
// (temp/changelog-designs/); rebuild this markup and its CSS to it.

export const WhatsNewSheet: React.FC = () => {
  const { notes, show, markSeen } = useWhatsNew();
  return (
    <AdminSheet isOpen={show} onClose={markSeen} title={copy.title} closeLabel={adminCopy.close}
      bar={<button type="button" className="adm-btn adm-btn--primary adm-btn--block" onClick={markSeen}>{copy.gotIt}</button>}>
      <ul className="adm-list">
        {notes.map((note) => (
          <li key={note.id}>
            <span className="adm-list__main">
              <span className="adm-list__title">{note.kind && `${copy.kinds[note.kind]} · `}{note.title}</span>
              <span className="adm-list__sub">{note.body}</span>
            </span>
          </li>
        ))}
      </ul>
    </AdminSheet>
  );
};
