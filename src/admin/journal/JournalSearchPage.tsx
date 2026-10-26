import React, { useEffect, useState } from 'react';
import { ArrowLeft, Search } from 'lucide-react';
import { adminCopy } from '../../data/adminCopy';
import { searchJournal } from '../api';
import { formatMoney, istDateValue } from '../format';
import { LoadError, Segmented, Skeleton } from '../parts';
import { AdminLink, useQueryText } from '../router';
import { loadPeople } from '../todos/people';
import type { JournalEntry } from '../types';
import { useRpc, useSettled } from '../useRpc';
import { EntryCard } from './EntryCard';
import { dayTitle } from './model';

const copy = adminCopy.journal;
const sp = copy.searchPage;
const PATH = '/admin/journal/search';
const TRIES = ['jaggery', 'dates', 'pouches', 'delivery'] as const;

/**
 * Search every entry you can read: words, tags and what was bought. It adds up what it
 * finds: how many entries, ₹ spent on the lines that match, and how many were Problems.
 */
const JournalSearchPage: React.FC = () => {
  const [text, setText] = useQueryText(PATH);
  const query = useSettled(text.trim(), 300);
  const [who, setWho] = useState<'all' | 'me' | 'them'>('all');
  const [tag, setTag] = useState('');
  const [kept, setKept] = useState(false);
  const [photos, setPhotos] = useState(false);
  const [people, setPeople] = useState<{ me: string; them: string | null; themName: string }>({ me: '', them: null, themName: '' });
  const filtering = Boolean(query || tag || kept || photos || who !== 'all');
  const author = who === 'me' ? people.me : who === 'them' ? people.them ?? undefined : undefined;
  const result = useRpc(
    () => searchJournal({ query, tag: tag || undefined, kept, photos, author }),
    [query, tag, kept, photos, author],
  );
  const today = istDateValue();

  // Who's who, for "You" and the other person's filter.
  useEffect(() => {
    let live = true;
    loadPeople().then(({ me, people: all }) => {
      const them = all.find((p) => p.id !== me);
      if (live) setPeople({ me, them: them?.id ?? null, themName: them?.name ?? adminCopy.todos.nameFallback });
    }, () => undefined);
    return () => { live = false; };
  }, []);

  const data = result.data;
  const showTries = !filtering;
  const replace = (entry: JournalEntry) =>
    result.setData((d) => d && { ...d, entries: d.entries.map((e) => (e.id === entry.id ? entry : e)) });

  let body: React.ReactNode = null;
  if (result.error && !data) body = <LoadError onRetry={() => void result.reload()} />;
  else if (!data) body = <Skeleton cards={2} rows={3} />;
  else if (filtering && data.count === 0) body = <p className="adm-empty adm-center">{query ? sp.none(query) : sp.noneFiltered}</p>;
  else if (filtering) {
    body = (
      <>
        <div className="adm-jsum">
          <p className="adm-jsum__lede">
            <b>{sp.sum(data.count, query || null)}</b>
            {data.spent > 0 && <>, {sp.sumSpent(formatMoney(data.spent), query || null)}</>}
            {data.problems > 0 && <>, {sp.sumProblems(data.problems)}</>}.
          </p>
          {data.count > data.entries.length && <p className="adm-field__hint">{sp.more(data.count)}</p>}
        </div>
        {data.entries.map((entry) => (
          <section key={entry.id} className="adm-card adm-jday" aria-label={dayTitle(entry.day, today)}>
            <div className="adm-jday__head"><h2>{dayTitle(entry.day, today)}</h2></div>
            <EntryCard entry={entry} me={people.me} today={today} query={query} onChange={replace} />
          </section>
        ))}
      </>
    );
  }

  return (
    <div className="adm-page adm-page--list adm-journal">
      <div className="adm-jsearch__top">
        <AdminLink to="/admin/journal" className="adm-jround adm-jround--44" aria-label={sp.back}><ArrowLeft size={20} aria-hidden="true" /></AdminLink>
        <label className="adm-jsearch__field">
          <Search size={18} aria-hidden="true" />
          <input type="search" className="adm-input" aria-label={sp.field} placeholder={sp.placeholder} value={text}
            onChange={(e) => setText(e.target.value)} autoFocus />
        </label>
      </div>
      <h1 className="visually-hidden">{sp.title}</h1>

      <div className="adm-jfilters">
        <Segmented label={sp.who} value={who}
          options={[{ value: 'all', label: sp.everyone }, { value: 'me', label: copy.you }, ...(people.them ? [{ value: 'them' as const, label: people.themName }] : [])]}
          onChange={setWho} />
        <div className="adm-jfilters__row">
          {data && data.tags.length > 0 && (
            <select className="adm-input adm-jfilters__tag" aria-label={sp.tag} value={tag} onChange={(e) => setTag(e.target.value)}>
              <option value="">{sp.anyTag}</option>
              {data.tags.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
          <button type="button" className={`adm-jtag${kept ? ' is-on' : ''}`} aria-pressed={kept} onClick={() => setKept((k) => !k)}>{sp.kept}</button>
          <button type="button" className={`adm-jtag${photos ? ' is-on' : ''}`} aria-pressed={photos} onClick={() => setPhotos((p) => !p)}>{sp.photos}</button>
        </div>
      </div>

      {showTries && (
        <section className="adm-card adm-stack">
          <span className="adm-muted">{sp.tries}</span>
          <div className="adm-jtags">
            {TRIES.map((word) => <button key={word} type="button" className="adm-jtag" onClick={() => setText(word)}>{word}</button>)}
          </div>
        </section>
      )}
      {body}
    </div>
  );
};

export default JournalSearchPage;
