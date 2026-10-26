import React, { useState } from 'react';
import { ChevronRight, ListTodo, ClipboardList, Download, History, Mail, Settings, Ticket, Users, type LucideIcon } from 'lucide-react';
import { adminCopy as copy } from '../../data/adminCopy';
import { getCoupons, getEmailList, getTodos, getWebsiteRequests } from '../api';
import { useAdminMe } from '../auth';
import { useJournalAvailable } from '../journal/available';
import { dueOf } from '../todos/model';
import { HISTORY_PATH } from '../kitchen/history';
import { useHistoryAvailable } from '../kitchen/useHistoryAvailable';
import { ExportSheet } from '../orders/ExportSheet';
import { AdminLink as Link } from '../router';
import { useRpc } from '../useRpc';

const Row: React.FC<{ Icon: LucideIcon; title: string; sub: string }> = ({ Icon, title, sub }) => (
  <>
    <span className="adm-list__icon" aria-hidden="true"><Icon size={20} strokeWidth={1.75} /></span>
    <span className="adm-list__main"><span className="adm-list__title">{title}</span><span className="adm-list__sub">{sub}</span></span>
    <ChevronRight className="adm-list__end" size={20} aria-hidden="true" />
  </>
);

// What doesn't fit in the tab bar, in three groups (spec 2.13): people and work, selling,
// records and settings. With the journal on, Customers and To-dos live here too (the
// laptop header also names Customers). Lines under a row are live counts once they load.
const MorePage: React.FC = () => {
  const [exporting, setExporting] = useState(false);
  const coupons = useRpc(getCoupons, []);
  const emails = useRpc(getEmailList, []);
  const journal = useJournalAvailable();
  const todos = useRpc(() => (journal ? getTodos() : Promise.resolve(null)), [journal]);
  const couponsOn = coupons.data?.filter((c) => c.active && !(c.expires_at && Date.parse(c.expires_at) <= Date.now())).length;
  const people = emails.data?.members.length;
  const historyOn = useHistoryAvailable();
  const admin = useAdminMe().home_view !== 'cook';
  const requests = useRpc(() => getWebsiteRequests({ state: 'pending', limit: 100 }), []);
  const open = todos.data?.todos.filter((t) => !t.done_at) ?? null;
  const late = open?.filter((t) => dueOf(t, todos.data?.today ?? '').state === 'late').length ?? 0;
  const pending = admin && !requests.error ? requests.data : null;
  const showRequests = Boolean(pending);

  return (
    <div className="adm-page adm-more">
      <h1 className="adm-title">{copy.more.title}</h1>
      {(journal || showRequests) && (
        <>
          <h2 className="adm-more__group">{copy.more.groups.work}</h2>
          <section className="adm-card adm-list" aria-label={copy.more.groups.work}>
            {journal && <Link to="/admin/customers"><Row Icon={Users} title={copy.more.customers[0]} sub={copy.more.customers[1]} /></Link>}
            {journal && (
              <Link to="/admin/todos">
                <Row Icon={ListTodo} title={copy.more.todos[0]} sub={open ? copy.more.todosCount(open.length, late) : copy.more.todos[1]} />
              </Link>
            )}
            {showRequests && <Link to="/admin/requests"><Row Icon={ClipboardList} title={copy.more.requests[0]} sub={copy.websiteRequests.homeTitle(pending?.requests.length ?? 0)} /></Link>}
          </section>
        </>
      )}
      <h2 className="adm-more__group">{copy.more.groups.selling}</h2>
      <section className="adm-card adm-list" aria-label={copy.more.groups.selling}>
        <Link to="/admin/coupons">
          <Row Icon={Ticket} title={copy.more.coupons[0]} sub={couponsOn === undefined ? copy.more.coupons[1] : copy.moreCounts.couponsOn(couponsOn)} />
        </Link>
        <Link to="/admin/email-list">
          <Row Icon={Mail} title={copy.more.emailList[0]} sub={people === undefined ? copy.more.emailList[1] : copy.emailList.people(people)} />
        </Link>
      </section>
      <h2 className="adm-more__group">{copy.more.groups.records}</h2>
      <section className="adm-card adm-list" aria-label={copy.more.groups.records}>
        {historyOn && (
          <Link to={HISTORY_PATH}>
            <Row Icon={History} title={copy.kitchen.history.moreRow[0]} sub={copy.kitchen.history.moreRow[1]} />
          </Link>
        )}
        <button type="button" onClick={() => setExporting(true)}>
          <Row Icon={Download} title={copy.more.exportOrders[0]} sub={copy.more.exportOrders[1]} />
        </button>
        <Link to="/admin/settings"><Row Icon={Settings} title={copy.more.settings[0]} sub={copy.more.settings[1]} /></Link>
      </section>
      <p className="adm-muted adm-center">{copy.more.footer}</p>
      <ExportSheet isOpen={exporting} onClose={() => setExporting(false)} />
    </div>
  );
};

export default MorePage;
