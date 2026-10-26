import React, { useState } from 'react';
import { Heart, Lock, MessageCircle, Pencil, Plus, X } from 'lucide-react';
import { adminCopy } from '../../data/adminCopy';
import { addJournalReply, deleteJournalReply, setJournalKept, toAdminError } from '../api';
import { formatMoney, formatWhen } from '../format';
import { AdminSheet } from '../AdminSheet';
import type { JournalEntry } from '../types';
import { useToast } from '../toast';
import { useUndoable } from '../useUndoable';
import { dayShort, entryMeta, hitParts, initial, personName, purchasesTotal } from './model';
import { usePhotoLinks } from './photos';

const copy = adminCopy.journal;

/** Text with every match of `query` in <mark>. */
export const Highlight: React.FC<{ text: string; query?: string | null }> = ({ text, query }) => (
  <>{hitParts(text, query).map((part, i) => (part.hit ? <mark key={i}>{part.text}</mark> : <React.Fragment key={i}>{part.text}</React.Fragment>))}</>
);

/** An entry's photos, two or three across; a tap opens one big. */
export const PhotoGrid: React.FC<{ entry: JournalEntry; today: string }> = ({ entry, today }) => {
  const links = usePhotoLinks(entry.photos.map((p) => p.path));
  const [open, setOpen] = useState<string | null>(null);
  if (!entry.photos.length) return null;
  const alt = copy.entry.photoAlt(entry.author.name ?? copy.someone, dayShort(entry.day, today));
  const big = open ? links[open] : null;
  return (
    <>
      <div className={`adm-jphotos adm-jphotos--${Math.min(entry.photos.length, 3)}`}>
        {entry.photos.map((photo) => (
          <button key={photo.id} type="button" className="adm-jphoto" onClick={() => setOpen(photo.path)} aria-label={copy.entry.photoOpen}>
            {links[photo.path]
              ? <img src={links[photo.path]} alt={alt} width={photo.width} height={photo.height} loading="lazy" decoding="async" />
              : <span className="adm-jphoto__wait" aria-hidden="true" />}
          </button>
        ))}
      </div>
      <AdminSheet isOpen={!!open} onClose={() => setOpen(null)} title={dayShort(entry.day, today)} closeLabel={adminCopy.close} width={760} className="adm-jviewer">
        {big && <img src={big} alt={alt} className="adm-jviewer__img" />}
      </AdminSheet>
    </>
  );
};

/**
 * One entry: who, how the day went, the words, photos, what was bought, tags and replies.
 * The actions (Keep, Reply, Make a to-do, Edit) are left out where `readOnly` (the printed month).
 */
export const EntryCard: React.FC<{
  entry: JournalEntry;
  me: string;
  today: string;
  query?: string | null;
  readOnly?: boolean;
  onChange?: (entry: JournalEntry) => void;
  onEdit?: (entry: JournalEntry) => void;
  onTodo?: (entry: JournalEntry) => void;
}> = ({ entry, me, today, query, readOnly, onChange, onEdit, onTodo }) => {
  const run = useUndoable();
  const toast = useToast();
  const [replying, setReplying] = useState(false);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const name = personName(entry.author, me);
  const meta = entryMeta(entry);
  const spent = purchasesTotal(entry);

  const keep = (kept: boolean, quiet = false): void => void run({
    apply: () => {
      const before = entry;
      onChange?.({ ...entry, kept });
      return () => onChange?.(before);
    },
    save: async () => onChange?.(await setJournalKept(entry.id, kept)),
    text: kept ? copy.entry.keptToast : copy.entry.unkeptToast,
    undo: () => keep(!kept, true),
    quiet,
  });

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!reply.trim() || sending) return;
    setSending(true);
    try {
      onChange?.(await addJournalReply(entry.id, reply));
      setReply('');
      setReplying(false);
    } catch (err) {
      const error = toAdminError(err);
      if (error.kind === 'message') toast.show({ text: error.message });
      else toast.error();
    } finally {
      setSending(false);
    }
  };

  const removeReply = async (id: string) => {
    try {
      onChange?.(await deleteJournalReply(id));
      toast.show({ text: copy.entry.replyDeleted });
    } catch {
      toast.error();
    }
  };

  return (
    <article className="adm-jentry" aria-label={`${name}, ${dayShort(entry.day, today)}`}>
      <span className="adm-javatar" aria-hidden="true">{initial(entry.author)}</span>
      <div className="adm-jentry__main">
        <div className="adm-jentry__who">
          <span className="adm-jentry__line"><b>{name}</b>{meta.map((part) => <React.Fragment key={part}> · {part}</React.Fragment>)}</span>
          {entry.private && <span className="adm-pill"><Lock size={13} aria-hidden="true" />{copy.onlyYou}</span>}
        </div>
        {entry.body && <p className="adm-jentry__body"><Highlight text={entry.body} query={query} /></p>}
        <PhotoGrid entry={entry} today={today} />
        {entry.purchases.length > 0 && (
          <div className="adm-jbought">
            <span className="adm-jbought__head">{copy.entry.bought(formatMoney(spent))}</span>
            <ul>
              {entry.purchases.map((p) => (
                <li key={p.id}><span><Highlight text={p.item} query={query} /></span><span>{formatMoney(p.amount)}</span></li>
              ))}
            </ul>
          </div>
        )}
        {entry.tags.length > 0 && (
          <div className="adm-jtags">{entry.tags.map((tag) => <span key={tag} className="adm-pill"><Highlight text={tag} query={query} /></span>)}</div>
        )}
        {entry.replies.length > 0 && (
          <ul className="adm-jreplies">
            {entry.replies.map((r) => (
              <li key={r.id}>
                <span className="adm-javatar adm-javatar--sm" aria-hidden="true">{initial(r.author)}</span>
                <span className="adm-jreplies__main">
                  <small>{personName(r.author, me)} · {formatWhen(r.created_at)}</small>
                  <span>{r.body}</span>
                </span>
                {r.mine && !readOnly && (
                  <button type="button" className="adm-jicon" aria-label={copy.entry.replyDelete} onClick={() => void removeReply(r.id)}>
                    <X size={16} aria-hidden="true" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {!readOnly && replying && (
          <form className="adm-jreply" onSubmit={send}>
            <input className="adm-input" aria-label={copy.entry.replyLabel} placeholder={copy.entry.replyPlaceholder}
              value={reply} maxLength={1000} onChange={(e) => setReply(e.target.value)} autoFocus />
            <button type="submit" className="adm-btn adm-btn--primary adm-btn--sm" disabled={!reply.trim() || sending}>{copy.entry.replySend}</button>
          </form>
        )}
        {!readOnly && (
          <div className="adm-jactions">
            <button type="button" className={`adm-text-btn${entry.kept ? ' is-on' : ''}`} aria-pressed={entry.kept} onClick={() => keep(!entry.kept)}>
              <Heart size={18} aria-hidden="true" fill={entry.kept ? 'currentColor' : 'none'} />{entry.kept ? copy.entry.kept : copy.entry.keep}
            </button>
            <button type="button" className="adm-text-btn" aria-expanded={replying} onClick={() => setReplying((r) => !r)}>
              <MessageCircle size={18} aria-hidden="true" />{copy.entry.reply}
            </button>
            {onTodo && (
              <button type="button" className="adm-text-btn" onClick={() => onTodo(entry)}>
                <Plus size={18} aria-hidden="true" />{copy.entry.makeTodo}
              </button>
            )}
            {entry.mine && onEdit && (
              <button type="button" className="adm-text-btn" onClick={() => onEdit(entry)}>
                <Pencil size={16} aria-hidden="true" />{copy.entry.edit}
              </button>
            )}
          </div>
        )}
        {entry.todos > 0 && <small className="adm-jentry__todos">{copy.entry.todosMade(entry.todos)}</small>}
      </div>
    </article>
  );
};
