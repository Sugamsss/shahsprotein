import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Flag, Plus, Search, X } from 'lucide-react';
import { adminCopy } from '../../data/adminCopy';
import { deleteMilestone, getJournal, getJournalLookback, saveMilestone } from '../api';
import { formatMoney, istDateValue } from '../format';
import { Field, LoadError, SheetForm, Skeleton } from '../parts';
import { AdminLink } from '../router';
import { TodoSheet, type TodoStart } from '../todos/TodoSheet';
import type { JournalDay, JournalEntry, JournalFeed, JournalLookback, JournalMilestone, JournalMonthSummary } from '../types';
import { useRpc } from '../useRpc';
import { useUndoable } from '../useUndoable';
import { EntryCard, PhotoGrid } from './EntryCard';
import { EntrySheet } from './EntrySheet';
import {
  dayShort, dayTitle, excerpt, factParts, feedItems, initial, milestoneTitle, monthName, monthsAgo, personName, replaceEntry,
} from './model';

const copy = adminCopy.journal;
const PAGE = 10;

type Sheet =
  | { kind: 'write'; entry: JournalEntry | null }
  | { kind: 'todo'; start: TodoStart }
  | { kind: 'milestone' };

// ---- On this day: a month ago, a year ago, and what you kept ----------------------------------

const Memories: React.FC<{ lookback: JournalLookback; me: string }> = ({ lookback, me }) => {
  const items = useMemo(() => [
    ...lookback.on_this_day.map((entry) => ({ entry, label: copy.lookBack.onThisDay(monthsAgo(entry.day, lookback.today)) })),
    ...lookback.kept.filter((k) => !lookback.on_this_day.some((e) => e.id === k.id)).map((entry) => ({ entry, label: copy.lookBack.kept })),
  ], [lookback]);
  const [at, setAt] = useState(0);
  if (!items.length) return null;
  const { entry, label } = items[Math.min(at, items.length - 1)];
  return (
    <section className="adm-card adm-jmemory" aria-label={label}>
      <PhotoGrid entry={{ ...entry, photos: entry.photos.slice(0, 1) }} today={lookback.today} />
      <div className="adm-jmemory__main">
        <div className="adm-home__head">
          <h2>{label}</h2>
          {items.length > 1 && <span>{copy.lookBack.of(at + 1, items.length)}</span>}
        </div>
        <p className="adm-jmemory__quote">“{excerpt(entry.body, 180) || copy.moods[(entry.mood ?? 3) - 1]}”</p>
        <p className="adm-jmemory__who">
          <span className="adm-javatar adm-javatar--sm" aria-hidden="true">{initial(entry.author)}</span>
          {personName(entry.author, me)}, {dayShort(entry.day, lookback.today)}
        </p>
        {items.length > 1 && (
          <div className="adm-jmemory__nav">
            <button type="button" className="adm-jround" aria-label={copy.lookBack.earlier} onClick={() => setAt((at + items.length - 1) % items.length)}>
              <ChevronLeft size={20} aria-hidden="true" />
            </button>
            <button type="button" className="adm-jround" aria-label={copy.lookBack.later} onClick={() => setAt((at + 1) % items.length)}>
              <ChevronRight size={20} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </section>
  );
};

// ---- A month's summary, where the month ends in the feed ----------------------------------------

const MonthCard: React.FC<{ summary: JournalMonthSummary; today: string; me: string }> = ({ summary, today, me }) => {
  const soFar = summary.month.slice(0, 7) === today.slice(0, 7);
  return (
    <section className="adm-card adm-jmonth" aria-label={monthName(summary.month, today)}>
      <div className="adm-home__head">
        <h2>{copy.month.title(monthName(summary.month, today), soFar)}</h2>
        <AdminLink to={`/admin/journal/month/${summary.month.slice(0, 7)}`} className="adm-text-btn">{copy.month.open}</AdminLink>
      </div>
      <dl className="adm-jmonth__figures">
        <div><dt>{copy.month.entries}</dt><dd>{summary.entries}</dd></div>
        <div><dt>{copy.month.photos}</dt><dd>{summary.photos}</dd></div>
        <div><dt>{copy.month.greatDays}</dt><dd>{summary.great_days}</dd></div>
        {summary.hours > 0 && <div><dt>{copy.month.hours}</dt><dd>{copy.hours(Number(summary.hours))}</dd></div>}
        {summary.spent > 0 && <div><dt>{copy.month.spent}</dt><dd>{formatMoney(summary.spent)}</dd></div>}
      </dl>
      {summary.lines.length > 0 && (
        <div className="adm-jmonth__lines">
          <span className="adm-field__label">{copy.month.lines}</span>
          {summary.lines.map((line) => (
            <p key={line.id}><b>{personName(line.author, me)}</b> “{excerpt(line.body, 120)}”</p>
          ))}
        </div>
      )}
    </section>
  );
};

// ---- One day ---------------------------------------------------------------------------------

const DayCard: React.FC<{
  day: JournalDay;
  feed: JournalFeed;
  today: string;
  onEntry: (entry: JournalEntry) => void;
  onEdit: (entry: JournalEntry | null) => void;
  onTodo: (entry: JournalEntry) => void;
  onRemoveMilestone: (m: JournalMilestone, day: string) => void;
}> = ({ day, feed, today, onEntry, onEdit, onTodo, onRemoveMilestone }) => {
  const facts = factParts(day.facts);
  const wrote = day.entries.some((e) => e.mine);
  const isToday = day.day === today;
  return (
    <section className="adm-card adm-jday" aria-labelledby={`adm-jday-${day.day}`}>
      <div className="adm-jday__head">
        <h2 id={`adm-jday-${day.day}`}>{dayTitle(day.day, today)}</h2>
        <p className="adm-jday__facts">
          {facts.length
            ? facts.map((f, i) => <React.Fragment key={f.key}>{i > 0 && ', '}<b className={f.money ? 'is-money' : undefined}>{f.text}</b></React.Fragment>)
            : copy.facts.quiet}
        </p>
      </div>
      {day.milestones.map((m, i) => (
        <div key={m.id ?? `${m.kind}${m.value}${i}`} className="adm-jmilestone">
          <Flag size={18} strokeWidth={1.75} aria-hidden="true" />
          <span>{milestoneTitle(m)}</span>
          {m.kind === 'hand' && m.id && (
            <button type="button" className="adm-jicon" aria-label={copy.milestone.remove} onClick={() => onRemoveMilestone(m, day.day)}>
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </div>
      ))}
      {day.entries.map((entry) => (
        <EntryCard key={entry.id} entry={entry} me={feed.me} today={today} onChange={onEntry} onEdit={onEdit} onTodo={onTodo} />
      ))}
      {day.done.map((t) => (
        <p key={t.id} className="adm-jdone">
          <span className="adm-jdone__tick" aria-hidden="true">✓</span>
          {t.done_by?.id === feed.me ? copy.youDid(t.text) : copy.did(t.done_by?.name ?? copy.someone, t.text)}
        </p>
      ))}
      {isToday && !wrote && (
        <div className="adm-jday__write">
          <span>{copy.yourEntry}</span>
          <button type="button" className="adm-text-btn" onClick={() => onEdit(null)}>{copy.write}</button>
        </div>
      )}
    </section>
  );
};

// ---- The page --------------------------------------------------------------------------------

/**
 * The journal: one feed of days, newest first. Each day has its figures from the app, both
 * of your entries, to-dos done and milestones; "On this day" sits on top and each month's
 * summary where the month ends. Search is its own page; so is a month (to print).
 */
const JournalPage: React.FC = () => {
  const feed = useRpc(() => getJournal(undefined, PAGE), []);
  const lookback = useRpc(getJournalLookback, []);
  const run = useUndoable();
  const [older, setOlder] = useState(false);
  const [olderFailed, setOlderFailed] = useState(false);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const close = useCallback(() => setSheet(null), []);
  const today = istDateValue();
  const data = feed.data;
  const missing = feed.error?.kind === 'missing';

  // Home's "How did today go?" arrives with ?write=1.
  const location = useLocation();
  const navigate = useNavigate();
  const asked = new URLSearchParams(location.search).get('write') === '1';
  useEffect(() => {
    if (!asked || !data) return;
    const mineToday = data.days.find((d) => d.day === today)?.entries.find((e) => e.mine) ?? null;
    setSheet({ kind: 'write', entry: mineToday });
    navigate(location.pathname, { replace: true });
  }, [asked, data]); // eslint-disable-line react-hooks/exhaustive-deps

  const { setData: setFeed, reload: reloadFeed } = feed;
  const { reload: reloadLookback } = lookback;
  const dataRef = useRef(data);
  dataRef.current = data;
  // A saved entry goes in place; one for a day that isn't on screen yet brings the feed back fresh.
  const setEntry = useCallback((entry: JournalEntry) => {
    // The month summaries and "On this day" count photos and entries: they follow quietly.
    void reloadLookback();
    if (!dataRef.current?.days.some((day) => day.day === entry.day)) { void reloadFeed(); return; }
    setFeed((d) => d && { ...d, days: replaceEntry(d.days, entry.id, entry) });
  }, [setFeed, reloadFeed, reloadLookback]);
  const dropEntry = useCallback((entry: JournalEntry) => {
    setFeed((d) => d && { ...d, days: replaceEntry(d.days, entry.id, null) });
    void reloadLookback();
  }, [setFeed, reloadLookback]);

  const loadOlder = async () => {
    const last = data?.days[data.days.length - 1];
    if (!last) return;
    setOlder(true);
    setOlderFailed(false);
    try {
      const page = await getJournal(last.day, PAGE);
      feed.setData((d) => d && { ...d, days: [...d.days, ...page.days.filter((p) => !d.days.some((x) => x.day === p.day))], has_more: page.has_more });
    } catch {
      setOlderFailed(true);
    }
    setOlder(false);
  };

  const removeMilestone = (m: JournalMilestone, day: string) => {
    if (!m.id) return;
    const title = m.title ?? '';
    void run({
      apply: () => {
        const before = feed.data;
        feed.setData((d) => d && { ...d, days: d.days.map((x) => (x.day === day ? { ...x, milestones: x.milestones.filter((y) => y.id !== m.id) } : x)) });
        return () => feed.setData(before);
      },
      save: () => deleteMilestone(m.id as string),
      text: copy.milestone.removed,
      undo: () => void saveMilestone(day, title).then(() => feed.reload()),
    });
  };

  const mine = useMemo(() => {
    const byDay: Record<string, JournalEntry> = {};
    for (const d of data?.days ?? []) for (const e of d.entries) if (e.mine) byDay[e.day] = e;
    return byDay;
  }, [data]);
  const knownTags = useMemo(() => {
    const tags = new Set<string>();
    for (const d of data?.days ?? []) for (const e of d.entries) for (const t of e.tags) tags.add(t);
    return [...tags];
  }, [data]);
  const otherName = data?.people.find((p) => p.id !== data.me)?.name ?? adminCopy.todos.nameFallback;

  const todoFrom = (entry: JournalEntry) => setSheet({
    kind: 'todo',
    start: { entry: { id: entry.id, day: entry.day, author: entry.author.name ?? '', mine: entry.mine, quote: excerpt(entry.body, 100) } },
  });

  let body: React.ReactNode;
  if (missing) body = <p className="adm-card adm-empty">{copy.missing}</p>;
  else if (feed.error && !data) body = <LoadError onRetry={() => void feed.reload()} />;
  else if (!data) body = <Skeleton cards={3} rows={3} />;
  else {
    const items = feedItems(data.days, lookback.data?.months ?? [], data.has_more);
    const nothingYet = !data.days.some((d) => d.entries.length || d.milestones.length || d.done.length);
    body = (
      <>
        {lookback.data && <Memories lookback={lookback.data} me={data.me} />}
        {nothingYet && <p className="adm-intro">{copy.empty}</p>}
        {items.map((item) => (item.kind === 'day'
          ? <DayCard key={item.day.day} day={item.day} feed={data} today={today} onEntry={setEntry}
              onEdit={(entry) => setSheet({ kind: 'write', entry })} onTodo={todoFrom} onRemoveMilestone={removeMilestone} />
          : <MonthCard key={`m${item.summary.month}`} summary={item.summary} today={today} me={data.me} />))}
        <div className="adm-jfoot">
          {data.has_more && (
            <button type="button" className="adm-btn adm-btn--quiet adm-btn--sm" disabled={older} onClick={() => void loadOlder()}>
              {copy.loadMore}
            </button>
          )}
          {olderFailed && <p className="adm-form__error" role="alert">{adminCopy.loadError}</p>}
          <button type="button" className="adm-text-btn" onClick={() => setSheet({ kind: 'milestone' })}>
            <Flag size={18} strokeWidth={1.75} aria-hidden="true" />{copy.milestone.mark}
          </button>
        </div>
      </>
    );
  }

  return (
    <div className="adm-page adm-page--list adm-journal">
      <div className="adm-title-row">
        <h1 className="adm-title">{copy.title}</h1>
        {!missing && (
          <div className="adm-jtop">
            <AdminLink to="/admin/journal/search" className="adm-jround adm-jround--44" aria-label={copy.search}>
              <Search size={20} aria-hidden="true" />
            </AdminLink>
            <button type="button" className="adm-btn adm-btn--primary adm-btn--sm" disabled={!data} onClick={() => setSheet({ kind: 'write', entry: mine[today] ?? null })}>
              <Plus size={18} strokeWidth={1.75} aria-hidden="true" />{copy.write}
            </button>
          </div>
        )}
      </div>
      {body}

      {data && sheet?.kind === 'write' && (
        <EntrySheet entry={sheet.entry} today={today} mine={mine} otherName={otherName} knownTags={knownTags}
          onSaved={setEntry} onDeleted={dropEntry} onClose={close} />
      )}
      {sheet?.kind === 'todo' && (
        <TodoSheet todo={null} start={sheet.start} onClose={close}
          onSaved={(t) => { if (t.entry) feed.setData((d) => d && { ...d, days: d.days.map((day) => ({ ...day, entries: day.entries.map((e) => (e.id === t.entry?.id ? { ...e, todos: e.todos + 1 } : e)) })) }); }} />
      )}
      {sheet?.kind === 'milestone' && <MilestoneSheet today={today} onClose={close} onSaved={() => { void feed.reload(); void lookback.reload(); }} />}
    </div>
  );
};

const MilestoneSheet: React.FC<{ today: string; onClose: () => void; onSaved: () => void }> = ({ today, onClose, onSaved }) => {
  const [title, setTitle] = useState('');
  const [day, setDay] = useState(today);
  const [error, setError] = useState('');
  const field = useRef<HTMLInputElement>(null);
  const m = copy.milestone;
  return (
    <SheetForm title={m.markTitle} submitLabel={m.markSave} busyLabel={copy.sheet.saving} onClose={onClose} initialFocus={field}
      onSubmit={async () => {
        if (!title.trim()) { setError(m.markName); return; }
        await saveMilestone(day, title);
        onSaved();
        onClose();
      }}>
      <Field label={m.markName} error={error}>
        <input ref={field} className="adm-input" maxLength={80} placeholder={m.markNamePlaceholder} value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label={m.markDay}>
        <input type="date" className="adm-input" max={today} min="2026-01-01" value={day} onChange={(e) => setDay(e.target.value || today)} />
      </Field>
    </SheetForm>
  );
};

export default JournalPage;
