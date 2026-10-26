import React, { useEffect, useState } from 'react';
import { ArrowLeft, Flag, Printer } from 'lucide-react';
import { adminCopy } from '../../data/adminCopy';
import { getJournalMonth } from '../api';
import { istDateValue } from '../format';
import { LoadError, Skeleton } from '../parts';
import { AdminLink, usePathPart } from '../router';
import { loadPeople } from '../todos/people';
import { useRpc } from '../useRpc';
import { EntryCard } from './EntryCard';
import { dayTitle, factParts, milestoneTitle, monthName } from './model';

const copy = adminCopy.journal;

/**
 * One month, oldest day first: its figures, milestones and every entry you can read, with
 * the photos. "Print the month" makes it a keepsake (the page prints without the app's bars).
 */
const JournalMonthPage: React.FC = () => {
  const part = usePathPart(2);
  const month = /^\d{4}-\d{2}$/.test(part) ? `${part}-01` : `${istDateValue().slice(0, 7)}-01`;
  const data = useRpc(() => getJournalMonth(month), [month]);
  const today = istDateValue();
  const [me, setMe] = useState('');
  useEffect(() => { loadPeople().then((p) => setMe(p.me), () => undefined); }, []);

  let body: React.ReactNode;
  if (data.error && !data.data) body = <LoadError onRetry={() => void data.reload()} />;
  else if (!data.data) body = <Skeleton cards={2} rows={4} />;
  else {
    const { entries, milestones, facts } = data.data;
    const days = [...new Set([...entries.map((e) => e.day), ...milestones.map((m) => m.day ?? '')].filter(Boolean))].sort();
    const figures = factParts(facts);
    body = (
      <>
        {figures.length > 0 && (
          <p className="adm-jday__facts adm-jmonthpage__facts">
            <span className="adm-field__label">{copy.month.inApp}</span>{' '}
            {figures.map((f, i) => <React.Fragment key={f.key}>{i > 0 && ', '}<b className={f.money ? 'is-money' : undefined}>{f.text}</b></React.Fragment>)}
          </p>
        )}
        {!days.length && <p className="adm-empty">{copy.month.empty}</p>}
        {days.map((day) => (
          <section key={day} className="adm-card adm-jday" aria-label={dayTitle(day, today)}>
            <div className="adm-jday__head"><h2>{dayTitle(day, today)}</h2></div>
            {milestones.filter((m) => m.day === day).map((m, i) => (
              <div key={m.id ?? `${m.kind}${i}`} className="adm-jmilestone"><Flag size={18} strokeWidth={1.75} aria-hidden="true" /><span>{milestoneTitle(m)}</span></div>
            ))}
            {entries.filter((e) => e.day === day).map((entry) => (
              <EntryCard key={entry.id} entry={entry} me={me} today={today} readOnly />
            ))}
          </section>
        ))}
      </>
    );
  }

  return (
    <div className="adm-page adm-page--list adm-journal adm-jmonthpage">
      <div className="adm-jsearch__top adm-jprint-hide">
        <AdminLink to="/admin/journal" className="adm-jround adm-jround--44" aria-label={copy.month.back}><ArrowLeft size={20} aria-hidden="true" /></AdminLink>
        <button type="button" className="adm-btn adm-btn--quiet adm-btn--sm" onClick={() => window.print()}>
          <Printer size={18} strokeWidth={1.75} aria-hidden="true" />{copy.month.keepsake}
        </button>
      </div>
      <div className="adm-jmonthpage__head">
        <h1 className="adm-title">{monthName(month, today)}</h1>
        <p className="adm-muted adm-jprint-hide">{copy.month.keepsakeHint}</p>
      </div>
      {body}
    </div>
  );
};

export default JournalMonthPage;
