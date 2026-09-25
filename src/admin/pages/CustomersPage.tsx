import React, { useState } from 'react';
import { ChevronRight, Repeat } from 'lucide-react';
import { adminCopy } from '../../data/adminCopy';
import { getCustomers } from '../api';
import { formatMoney, formatWhen, istDateValue } from '../format';
import { LoadError, Segmented, Skeleton } from '../parts';
import { AdminLink, useQueryText } from '../router';
import { useRpc, useSettled } from '../useRpc';

const copy = adminCopy.customers;
type Show = 'everyone' | 'again';

/** "today", "yesterday", then "Wed 23 Sep": the order list's words, for a sentence. */
const lastWhen = (iso: string) => {
  if (istDateValue(iso) === istDateValue()) return copy.today;
  const when = formatWhen(iso);
  return when === adminCopy.dates.yesterday ? copy.yesterday : when;
};

/** "AK" for Anjali Kulkarni, "AS" for "Aai (Sunita Shah)": the first letter of each word, skipping brackets and the like. */
export const initials = (name: string | null) =>
  (name ?? '').trim().split(/\s+/).map((w) => w.match(/\p{L}/u)?.[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?';

/** Customers (spec 2.10): people grouped by phone, latest order first. */
const CustomersPage: React.FC = () => {
  const [text, setText] = useQueryText('/admin/customers');
  const search = useSettled(text.trim());
  const [show, setShow] = useState<Show>('everyone');
  const list = useRpc(() => getCustomers(search || undefined), [search], { refreshOnFocus: true });

  const all = list.data?.customers ?? [];
  const people = show === 'again' ? all.filter((c) => c.orders > 1) : all;
  const again = all.filter((c) => c.orders > 1).length;

  return (
    <div className="adm-page adm-customers">
      <h1 className="adm-title">{copy.title}</h1>
      {list.data && !search && all.length > 0 && (
        <p className="adm-intro">
          <b>{copy.people(all.length)}</b>{copy.summary(again)}
          {list.data.without_phone > 0 && <> {copy.withoutPhone(list.data.without_phone)}</>}
        </p>
      )}
      <input className="adm-input adm-customers__find" type="search" value={text} placeholder={copy.find}
        aria-label={copy.find} onChange={(e) => setText(e.target.value)} />
      <Segmented label={copy.show} value={show} onChange={setShow}
        options={[{ value: 'everyone', label: copy.everyone }, { value: 'again', label: copy.again }]} />

      {list.error && !list.data && <LoadError onRetry={list.reload} />}
      {list.loading && !list.data && <Skeleton />}
      {list.data && people.length === 0 && <p className="adm-muted">{search ? copy.noMatch : copy.empty}</p>}

      {people.length > 0 && (
        <section className="adm-card adm-list">
          {people.map((c) => (
            <AdminLink key={c.phone} to={`/admin/customers/${c.phone}`}>
              <span className="adm-list__icon adm-avatar-mark" aria-hidden="true">{initials(c.name)}</span>
              <span className="adm-list__main">
                <span className="adm-list__title">
                  {c.name ?? c.phone}
                  {c.orders > 1 && <span className="adm-chip adm-chip--accent"><Repeat size={12} aria-hidden="true" />{copy.again}</span>}
                </span>
                <span className="adm-list__sub">
                  {[c.pincode, `${copy.orders(c.orders)}, ${copy.last(lastWhen(c.last_order_at))}`].filter(Boolean).join(' · ')}
                </span>
              </span>
              <span className="adm-customers__end">
                {c.amount_total > 0 && formatMoney(c.amount_total)}
                <ChevronRight className="adm-list__end" size={20} aria-hidden="true" />
              </span>
            </AdminLink>
          ))}
        </section>
      )}
    </div>
  );
};

export default CustomersPage;
