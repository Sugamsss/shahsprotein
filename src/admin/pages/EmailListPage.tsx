import React, { useState } from 'react';
import { Check, Download, Mail } from 'lucide-react';
import { adminCopy } from '../../data/adminCopy';
import { getEmailList } from '../api';
import { downloadCsv, toCsv } from '../csv';
import { formatDay, istDateValue } from '../format';
import { LoadError, Segmented, Skeleton } from '../parts';
import type { EmailList } from '../types';
import { useRpc } from '../useRpc';

const copy = adminCopy.emailList;

// The email list (spec 2.12). Loops sends the emails; this is the list and a CSV.
// Counts come from the members themselves, so the sentence and the filters agree.

type Member = EmailList['members'][number];
type Status = 'confirmed' | 'waiting' | 'left';
type Filter = 'all' | Status;

const statusOf = (member: Member): Status => {
  if (member.unsubscribed_at || ['unsubscribed', 'bounced', 'spam'].includes(member.status)) return 'left';
  return member.verified_at ? 'confirmed' : 'waiting';
};

const FILTERS = (['all', 'confirmed', 'waiting', 'left'] as const).map((value) => ({ value, label: copy.filters[value] }));

const download = (members: Member[]) => {
  const rows = members.map((m) => [
    m.email, copy.csvStatus[statusOf(m)], istDateValue(m.signed_up_at),
    m.verified_at && istDateValue(m.verified_at), m.unsubscribed_at && istDateValue(m.unsubscribed_at),
    copy.csvConsent(m.marketing_consent),
  ]);
  downloadCsv(copy.csvFile(istDateValue()), toCsv([...copy.csvHeaders], rows));
};

const EmailListPage: React.FC = () => {
  const { data, error, loading, reload } = useRpc(getEmailList, []);
  const [filter, setFilter] = useState<Filter>('all');
  const members = data?.members ?? [];
  const count = (status: Status) => members.filter((m) => statusOf(m) === status).length;
  const shown = filter === 'all' ? members : members.filter((m) => statusOf(m) === filter);

  let body: React.ReactNode;
  if (error && !data) body = <LoadError onRetry={() => void reload()} />;
  else if (!data) body = loading ? <Skeleton cards={1} rows={4} /> : null;
  else if (members.length === 0) body = <p className="adm-card adm-empty">{copy.empty}</p>;
  else {
    body = (
      <>
        <Segmented label={copy.filterLabel} options={FILTERS} value={filter} onChange={setFilter} />
        {shown.length === 0 ? (
          <p className="adm-card adm-empty">{copy.emptyFilter}</p>
        ) : (
          <ul className="adm-card adm-list adm-emails">
            {shown.map((member) => {
              const status = statusOf(member);
              return (
                <li key={member.id} className="adm-email">
                  <span className="adm-list__icon" aria-hidden="true"><Mail size={20} strokeWidth={1.75} /></span>
                  <span className="adm-list__main">
                    {/* Long addresses break before the @ first (<wbr> isn't copied with the text). */}
                    <span className="adm-email__address">{member.email.split('@')[0]}<wbr />@{member.email.split('@').slice(1).join('@')}</span>
                    <span className="adm-list__sub">{copy.signedUp(formatDay(member.signed_up_at))}</span>
                  </span>
                  <span className={`adm-email__status is-${status}`}>
                    {status === 'confirmed' && <Check size={16} strokeWidth={2} aria-hidden="true" />}
                    {copy.status[status]}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </>
    );
  }

  return (
    <div className="adm-page adm-page--list">
      <div className="adm-title-row">
        <h1 className="adm-title">{copy.title}</h1>
        {members.length > 0 && (
          <button type="button" className="adm-btn adm-btn--quiet adm-btn--sm" aria-label={copy.csvLabel} onClick={() => download(members)}>
            <Download size={18} strokeWidth={1.75} aria-hidden="true" />
            {copy.csv}
          </button>
        )}
      </div>
      {members.length > 0 && (
        <p className="adm-intro">
          <strong>{copy.people(members.length)}</strong>: {copy.summary(count('confirmed'), count('waiting'), count('left'))}. {copy.loops}
        </p>
      )}
      {body}
    </div>
  );
};

export default EmailListPage;
