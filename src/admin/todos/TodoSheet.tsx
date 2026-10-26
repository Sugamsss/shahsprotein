import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { adminCopy } from '../../data/adminCopy';
import { AdminSheet } from '../AdminSheet';
import { deleteTodo, saveTodo, toAdminError } from '../api';
import { addDays, dayShort } from '../journal/model';
import { Segmented } from '../parts';
import { useToast } from '../toast';
import type { PersonWithView, Todo, TodoInput } from '../types';
import { useUnsavedWork } from '../unsavedWork';
import { useUndoable } from '../useUndoable';
import { dueChoiceOf, others, type DueChoice } from './model';
import { loadPeople } from './people';

const copy = adminCopy.todos;

/** What a new to-do starts with: from a journal entry, for an ingredient, or for someone. */
export interface TodoStart {
  text?: string;
  assignee?: string | null;
  entry?: { id: string; day: string; author: string; mine: boolean; quote: string };
  ingredient?: { id: string; name: string };
}

/**
 * Make a to-do, or change one: what, who (you, the other person or either of you), by
 * when (no day, today, tomorrow or a day you pick), and the entry it came from. Delete
 * hides it, with Undo.
 */
export const TodoSheet: React.FC<{
  todo: Todo | null;
  start?: TodoStart;
  onSaved: (todo: Todo) => void;
  onDeleted?: (todo: Todo) => void;
  onClose: () => void;
}> = ({ todo, start, onSaved, onDeleted, onClose }) => {
  const toast = useToast();
  const run = useUndoable();
  const [who, setWho] = useState<{ me: string; today: string; people: PersonWithView[] } | null>(null);
  const [text, setText] = useState(todo?.text ?? start?.text ?? '');
  const [assignee, setAssignee] = useState<string | null>(todo ? todo.assignee?.id ?? null : start?.assignee ?? null);
  const [due, setDue] = useState<string | null>(todo?.due_on ?? null);
  const [choice, setChoice] = useState<DueChoice>('none');
  const [entry, setEntry] = useState(todo?.entry
    ? { id: todo.entry.id, day: todo.entry.day, author: todo.entry.author.name ?? '', mine: false, quote: '' }
    : start?.entry ?? null);
  const ingredient = todo?.ingredient ?? start?.ingredient ?? null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const field = useRef<HTMLInputElement>(null);
  const baseline = useRef('');

  useEffect(() => {
    let live = true;
    loadPeople().then((p) => {
      if (!live) return;
      setWho(p);
      setChoice(dueChoiceOf(todo?.due_on ?? null, p.today));
    }, () => setError(adminCopy.loadError));
    return () => { live = false; };
  }, [todo]);

  const state = JSON.stringify({ text, assignee, due, entry: entry?.id ?? null });
  if (!baseline.current) baseline.current = state;
  const dirty = state !== baseline.current;
  useUnsavedWork(() => dirty || busy);

  const today = who?.today ?? '';
  const pick = (next: DueChoice) => {
    setChoice(next);
    if (next === 'none') setDue(null);
    else if (next === 'today') setDue(today);
    else if (next === 'tomorrow') setDue(addDays(today, 1));
    else setDue(due && due > addDays(today, 1) ? due : addDays(today, 2));
  };

  const theirs = who ? others(who.people, who.me) : [];
  const whoValue = assignee === null ? 'either' : assignee;
  const whoOptions = who
    ? [{ value: who.me, label: copy.me }, ...theirs.map((p) => ({ value: p.id, label: p.name ?? copy.nameFallback })), { value: 'either', label: copy.either }]
    : [];
  const whoNote = assignee === null ? copy.whoNote.either
    : who && assignee === who.me ? copy.whoNote.me
      : copy.whoNote.them(theirs.find((p) => p.id === assignee)?.name ?? copy.nameFallback);

  const submit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (busy) return;
    if (!text.trim()) { setError(copy.needText); field.current?.focus(); return; }
    setBusy(true);
    setError('');
    const input: TodoInput = { text, assignee, due_on: due, entry_id: entry?.id ?? null, ingredient_id: ingredient?.id ?? null };
    try {
      const saved = await saveTodo(input, todo?.id);
      onSaved(saved);
      toast.show({ text: todo ? copy.saved : copy.added(saved.text) });
      baseline.current = state;
      onClose();
    } catch (err) {
      setError(toAdminError(err).message);
      setBusy(false);
    }
  };

  const remove = () => {
    if (!todo) return;
    const hide = (deleted: boolean, quiet = false): void => void run({
      apply: () => () => undefined,
      save: async () => {
        const next = await deleteTodo(todo.id, deleted);
        if (deleted) onDeleted?.(next); else onSaved(next);
      },
      text: copy.deleted,
      undo: () => hide(false, true),
      quiet,
    });
    hide(true);
    onClose();
  };

  const entryWho = entry ? (entry.mine ? copy.fromEntryYour : copy.fromEntryTheir(entry.author)) : '';

  return (
    <AdminSheet
      isOpen
      onClose={onClose}
      title={todo ? copy.editTitle : copy.newTitle}
      closeLabel={adminCopy.close}
      initialFocus={field}
      canClose={() => !busy && (!dirty || window.confirm(adminCopy.journal.sheet.unsaved))}
      bar={<button type="submit" form="adm-todo-form" className="adm-btn adm-btn--primary adm-btn--block" disabled={busy || !who}>
        {busy ? copy.saving : todo ? copy.save : copy.add}
      </button>}
    >
      <form id="adm-todo-form" className="adm-form" noValidate onSubmit={(e) => void submit(e)}>
        {error && <p className="adm-form__error" role="alert">{error}</p>}
        <div className="adm-field">
          <label className="adm-field__label" htmlFor="adm-todo-text">{copy.text}</label>
          <input ref={field} id="adm-todo-text" className="adm-input" maxLength={200} placeholder={copy.textPlaceholder}
            value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        {who && (
          <div className="adm-field">
            <Segmented label={copy.who} value={whoValue} options={whoOptions}
              onChange={(v) => setAssignee(v === 'either' ? null : v)} />
            <span className="adm-field__hint">{whoNote}</span>
          </div>
        )}
        {who && (
          <div className="adm-field">
            <Segmented label={copy.when} value={choice}
              options={[
                { value: 'none', label: copy.noDay },
                { value: 'today', label: copy.today },
                { value: 'tomorrow', label: copy.tomorrow },
                { value: 'pick', label: choice === 'pick' && due ? dayShort(due, today).replace(/^\w+ /, '') : copy.pickDay },
              ]}
              onChange={(v) => pick(v as DueChoice)} />
            {choice === 'pick' && (
              <input type="date" className="adm-input" aria-label={copy.pickDay} min={today} value={due ?? ''}
                onChange={(e) => setDue(e.target.value || null)} />
            )}
          </div>
        )}
        {ingredient && <p className="adm-jlink"><span className="adm-field__label">{copy.forIngredient(ingredient.name)}</span></p>}
        {entry && (
          <div className="adm-jlink">
            <span className="adm-jlink__main">
              <span className="adm-field__label">{copy.fromEntry(entryWho, today ? dayShort(entry.day, today) : entry.day)}</span>
              {entry.quote && <span>“{entry.quote}”</span>}
            </span>
            <button type="button" className="adm-jround" aria-label={copy.unlink} onClick={() => setEntry(null)}>
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        )}
        {todo && <button type="button" className="adm-text-btn adm-jdelete" onClick={remove}>{copy.delete}</button>}
      </form>
    </AdminSheet>
  );
};
