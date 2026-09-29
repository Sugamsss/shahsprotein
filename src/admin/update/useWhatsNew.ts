import { useCallback, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { adminReleases, type AdminRelease } from '../../data/adminReleases';
import { setNotesSeen } from '../api';
import { useAdminMe } from '../auth';
import { newerSeen, notesFor } from './notes';

// The "What's new" sheet's state. Seen is kept on the server (get_admin_me's
// notes_seen) so it follows the person across phones and the home-screen app,
// and on this device too. A database without the migration has no notes_seen
// key: then it's the device only, and set_admin_notes_seen is never called.

const deviceKey = (userId: string) => `shahs-admin-notes-seen:${userId}`;

const readDevice = (userId: string): string | null => {
  try {
    return localStorage.getItem(deviceKey(userId));
  } catch {
    return null;
  }
};

const writeDevice = (userId: string, id: string) => {
  try {
    localStorage.setItem(deviceKey(userId), id);
  } catch { /* the server copy, if any, still has it */ }
};

export interface WhatsNew {
  /** Their unseen notes, newest first. Empty when there's nothing for them. */
  notes: AdminRelease[];
  /** Open the sheet now: on Home, with notes to show. Never over another page. */
  show: boolean;
  /** Everything up to the newest note is seen: ×, swipe, Esc and "Got it" all call this. */
  markSeen: () => void;
}

export const useWhatsNew = (): WhatsNew => {
  const me = useAdminMe();
  const onHome = /^\/admin\/?$/.test(useLocation().pathname);
  const onServer = 'notes_seen' in me;
  const [seen, setSeen] = useState(() =>
    newerSeen(adminReleases, onServer ? me.notes_seen ?? null : null, readDevice(me.id)));
  const reader = me.home_view === 'cook' ? 'cook' : 'admin';
  const notes = useMemo(() => notesFor(adminReleases, reader, seen), [reader, seen]);

  const markSeen = useCallback(() => {
    // The newest note of all, not just theirs: the ones in between weren't for them.
    const newest = adminReleases[0]?.id;
    if (!newest) return;
    setSeen(newest);
    writeDevice(me.id, newest);
    if (onServer) setNotesSeen(newest).catch(() => { /* the device copy keeps it away here */ });
  }, [me.id, onServer]);

  return { notes, show: onHome && notes.length > 0, markSeen };
};
