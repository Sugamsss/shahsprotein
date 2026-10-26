import React, { useCallback, useState } from 'react';
import { Plus } from 'lucide-react';
import { adminCopy } from '../../data/adminCopy';
import { getTodos } from '../api';
import { LoadError, Segmented, Skeleton } from '../parts';
import type { Todo } from '../types';
import { useRpc } from '../useRpc';
import { inTab, others, sortOpen, tabCounts, type TodoTab } from './model';
import { TodoRow, useTick } from './TodoRow';
import { TodoSheet } from './TodoSheet';

const copy = adminCopy.todos;

/**
 * To-dos (from More): things that aren't an order. Mine, the other person's, or all;
 * open ones first (late, then by day, then no day), then those done this week. A tick
 * goes at once, with Undo; done ones show in that day's journal.
 */
const TodosPage: React.FC = () => {
  const list = useRpc(getTodos, [], { refreshOnFocus: true });
  const [tab, setTab] = useState<TodoTab>('mine');
  const [sheet, setSheet] = useState<{ todo: Todo | null } | null>(null);
  const data = list.data;
  const { setData } = list;

  const show = useCallback((todo: Todo) => setData((d) => {
    if (!d) return d;
    const rest = d.todos.filter((t) => t.id !== todo.id);
    return { ...d, todos: todo.deleted ? rest : [todo, ...rest] };
  }), [setData]);
  const tick = useTick(show);

  let body: React.ReactNode;
  if (list.error?.kind === 'missing') body = <p className="adm-card adm-empty">{adminCopy.journal.missing}</p>;
  else if (list.error && !data) body = <LoadError onRetry={() => void list.reload()} />;
  else if (!data) body = <Skeleton cards={2} rows={3} />;
  else {
    const them = others(data.people, data.me);
    const counts = tabCounts(data.todos, data.me);
    const theirName = them.length === 1 ? them[0].name ?? copy.nameFallback : copy.nameFallback;
    const shown = data.todos.filter((t) => inTab(t, tab, data.me));
    const open = sortOpen(shown.filter((t) => !t.done_at));
    const done = shown.filter((t) => t.done_at).sort((a, b) => (b.done_at as string).localeCompare(a.done_at as string));
    body = (
      <>
        <Segmented label={copy.tabsLabel} value={tab} onChange={setTab}
          options={[
            { value: 'mine', label: `${copy.tabs.mine} ${counts.mine}` },
            { value: 'theirs', label: `${copy.tabs.theirs(theirName)} ${counts.theirs}` },
            { value: 'all', label: `${copy.tabs.all} ${counts.all}` },
          ]} />
        <section className="adm-card adm-todos" aria-label={copy.open}>
          {open.length
            ? open.map((t) => <TodoRow key={t.id} todo={t} me={data.me} today={data.today} onTick={tick} onOpen={(todo) => setSheet({ todo })} />)
            : <p className="adm-todos__quiet">{copy.nothing}</p>}
        </section>
        <section className="adm-stack" aria-labelledby="adm-todos-done">
          <div className="adm-home__head adm-todos__head">
            <h2 id="adm-todos-done">{copy.doneThisWeek}</h2>
            <span>{copy.doneHint}</span>
          </div>
          <div className="adm-card adm-todos">
            {done.length
              ? done.map((t) => <TodoRow key={t.id} todo={t} me={data.me} today={data.today} onTick={tick} />)
              : <p className="adm-todos__quiet">{copy.nothingDone}</p>}
          </div>
        </section>
      </>
    );
  }

  const startFor = (): string | null => {
    if (!data || tab === 'all') return null;
    if (tab === 'mine') return data.me;
    const them = others(data.people, data.me);
    return them.length === 1 ? them[0].id : null;
  };

  return (
    <div className="adm-page adm-page--list">
      <div className="adm-title-row">
        <h1 className="adm-title">{copy.title}</h1>
        {list.error?.kind !== 'missing' && (
          <button type="button" className="adm-btn adm-btn--primary adm-btn--sm" disabled={!data} onClick={() => setSheet({ todo: null })}>
            <Plus size={18} strokeWidth={1.75} aria-hidden="true" />{copy.new}
          </button>
        )}
      </div>
      <p className="adm-intro">{copy.intro}</p>
      {body}
      {sheet && (
        <TodoSheet todo={sheet.todo} start={sheet.todo ? undefined : { assignee: startFor() }}
          onSaved={show} onDeleted={(t) => show({ ...t, deleted: true })} onClose={() => setSheet(null)} />
      )}
    </div>
  );
};

export default TodosPage;
