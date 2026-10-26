import { adminCopy } from '../../data/adminCopy';
import { addDays, dayShort, daysBetween } from '../journal/model';
import type { PersonWithView, Todo } from '../types';

// To-dos' pure parts: who a to-do is for in words, when it's due, the tabs and the order.

const copy = adminCopy.todos;

export type TodoTab = 'mine' | 'theirs' | 'all';

/** Mine: for me or either. Theirs: for anyone else or either. All: everything. */
export const inTab = (todo: Todo, tab: TodoTab, me: string): boolean => {
  if (tab === 'all' || !todo.assignee) return true;
  return tab === 'mine' ? todo.assignee.id === me : todo.assignee.id !== me;
};

export type DueState = 'late' | 'today' | 'soon' | 'later' | 'none';

/** When it's due, and the words for it: "2 days late", "Due today", "By tomorrow", "By Wed 28 Oct". */
export const dueOf = (todo: Pick<Todo, 'due_on'>, today: string): { state: DueState; text: string | null } => {
  if (!todo.due_on) return { state: 'none', text: null };
  const days = daysBetween(today, todo.due_on);
  if (days < 0) return { state: 'late', text: copy.late(-days) };
  if (days === 0) return { state: 'today', text: copy.dueToday };
  if (days === 1) return { state: 'soon', text: copy.dueTomorrow };
  return { state: days <= 6 ? 'soon' : 'later', text: copy.dueBy(dayShort(todo.due_on, today)) };
};

/** Late first (most late first), then by day, then those with no day, oldest first. */
export const sortOpen = (todos: Todo[]): Todo[] =>
  [...todos].sort((a, b) => {
    if (a.due_on && b.due_on) return a.due_on.localeCompare(b.due_on) || a.created_at.localeCompare(b.created_at);
    if (a.due_on) return -1;
    if (b.due_on) return 1;
    return a.created_at.localeCompare(b.created_at);
  });

/** "For you" / "From Sunit" / "For Sunit, from you" / "Sunit added" / "Either of you". */
export const whoLine = (todo: Todo, me: string): string => {
  const by = todo.created_by;
  const byMe = by?.id === me;
  const byName = by?.name || copy.nameFallback;
  if (!todo.assignee) return byMe || !by ? copy.forEither : `${copy.forEither}, ${copy.fromThem(byName)}`;
  if (todo.assignee.id === me) return byMe || !by ? copy.youAdded : `${copy.forYou}, ${copy.fromThem(byName)}`;
  const forName = todo.assignee.name || copy.nameFallback;
  if (byMe) return `${copy.forThem(forName)}, ${copy.fromThem(copy.you.toLowerCase())}`;
  return by?.id === todo.assignee.id ? copy.theyAdded(forName) : `${copy.forThem(forName)}, ${copy.fromThem(byName)}`;
};

/** The other admins, for "Who's doing it" and the second tab. With two of you, that's one name. */
export const others = (people: PersonWithView[], me: string): PersonWithView[] => people.filter((p) => p.id !== me);

/** Open and done-this-week counts per tab, open ones only. */
export const tabCounts = (todos: Todo[], me: string): Record<TodoTab, number> => {
  const open = todos.filter((t) => !t.done_at);
  return {
    mine: open.filter((t) => inTab(t, 'mine', me)).length,
    theirs: open.filter((t) => inTab(t, 'theirs', me)).length,
    all: open.length,
  };
};

/** "Today", "Tomorrow" or a picked day, as the sheet's choice for a due day. */
export type DueChoice = 'none' | 'today' | 'tomorrow' | 'pick';

export const dueChoiceOf = (due: string | null, today: string): DueChoice => {
  if (!due) return 'none';
  if (due === today) return 'today';
  if (due === addDays(today, 1)) return 'tomorrow';
  return 'pick';
};
