import React from 'react';
import { Check } from 'lucide-react';
import { adminCopy } from '../../data/adminCopy';
import { setTodoDone } from '../api';
import { formatWhen } from '../format';
import { dayShort } from '../journal/model';
import type { Todo } from '../types';
import { useUndoable } from '../useUndoable';
import { dueOf, whoLine } from './model';

const copy = adminCopy.todos;

/** Tick or untick, at once, with Undo; the list shows the answer. */
export const useTick = (show: (todo: Todo) => void) => {
  const run = useUndoable();
  const tick = (todo: Todo, done: boolean, quiet = false): void => void run({
    apply: () => {
      show({ ...todo, done_at: done ? new Date().toISOString() : null });
      return () => show(todo);
    },
    save: async () => show(await setTodoDone(todo.id, done)),
    text: done ? copy.doneToast : copy.undoneToast,
    undo: () => tick({ ...todo, done_at: done ? new Date().toISOString() : null }, !done, true),
    quiet,
  });
  return tick;
};

/**
 * One to-do: the round tick, what needs doing, and under it who it's for and when.
 * A tap on the words opens it (onOpen); on Home it goes to the list.
 */
export const TodoRow: React.FC<{
  todo: Todo;
  me: string;
  today: string;
  onTick: (todo: Todo, done: boolean) => void;
  onOpen?: (todo: Todo) => void;
  /** Leave out "For you": on Home every row is yours or either's. */
  short?: boolean;
}> = ({ todo, me, today, onTick, onOpen, short }) => {
  const done = Boolean(todo.done_at);
  const due = dueOf(todo, today);
  const who = whoLine(todo, me);
  const meta = [
    !(short && who === copy.youAdded) ? who : null,
    done ? copy.doneBy(todo.done_by?.id === me ? copy.you : todo.done_by?.name ?? copy.nameFallback, formatWhen(todo.done_at as string)) : null,
  ].filter(Boolean) as string[];
  const main = (
    <>
      <span className="adm-todo__text">{todo.text}</span>
      <span className="adm-todo__meta">
        {!done && due.text && <span className={due.state === 'late' ? 'is-late' : undefined}>{due.text}</span>}
        {meta.map((m) => <span key={m}>{m}</span>)}
        {todo.ingredient && <span>{adminCopy.todos.forIngredient(todo.ingredient.name)}</span>}
        {todo.entry && !short && (
          <span>{copy.fromEntry(todo.entry.author.id === me ? copy.fromEntryYour : copy.fromEntryTheir(todo.entry.author.name ?? ''), dayShort(todo.entry.day, today))}</span>
        )}
      </span>
    </>
  );
  return (
    <div className={`adm-todo${done ? ' is-done' : ''}`}>
      <button type="button" className="adm-todo__tick" aria-pressed={done}
        aria-label={done ? copy.untick(todo.text) : copy.tick(todo.text)} onClick={() => onTick(todo, !done)}>
        <span aria-hidden="true">{done && <Check size={14} strokeWidth={3} />}</span>
      </button>
      {onOpen ? <button type="button" className="adm-todo__main" onClick={() => onOpen(todo)}>{main}</button> : <span className="adm-todo__main">{main}</span>}
    </div>
  );
};
