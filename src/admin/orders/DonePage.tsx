import React, { useCallback, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronLeft } from 'lucide-react';
import { adminCopy } from '../../data/adminCopy';
import { getOrders } from '../api';
import { formatDay, formatMoney, formatPhone, formatTime } from '../format';
import { LoadError, Segmented, Skeleton } from '../parts';
import { AdminLink } from '../router';
import type { Order, OrderFilters } from '../types';
import { useRpc } from '../useRpc';
import { itemsText } from './model';
import { Code, OrderCard, PaidChip } from './OrderCard';
import { useLaptop } from './OrdersPage';
import { PaidSheet } from './PaidMethod';
import { useOrderChange } from './useOrderChange';

const copy = adminCopy.done;
type Filter = keyof typeof copy.filters;

const FILTERS: Record<Filter, OrderFilters> = {
  all: { view: 'done' },
  delivered: { view: 'done', status: ['delivered'] },
  cancelled: { view: 'done', status: ['cancelled'] },
  unpaid: { view: 'all', status: ['delivered'], paid: false },
};
const PAGE = 50;

/** [day, orders] in the order given. */
const byDay = (orders: Order[]) => {
  const days: [string, Order[]][] = [];
  orders.forEach((o) => {
    const day = formatDay(o.created_at);
    if (days[days.length - 1]?.[0] === day) days[days.length - 1][1].push(o);
    else days.push([day, [o]]);
  });
  return days;
};

/** Done (spec 2.5): delivered and paid, and cancelled. A table on the laptop, cards on the phone. */
const DonePage: React.FC = () => {
  const laptop = useLaptop();
  const [filter, setFilter] = useState<Filter>('all');
  const [oldestFirst, setOldestFirst] = useState(false);
  const [more, setMore] = useState(false);
  const list = useRpc(() => getOrders({ ...FILTERS[filter], limit: PAGE }), [filter]);
  const put = useCallback((o: Order) => list.setData((d) => d && { ...d, orders: d.orders.map((x) => (x.id === o.id ? o : x)) }), [list.setData]); // eslint-disable-line react-hooks/exhaustive-deps
  const change = useOrderChange(put);

  const older = async () => {
    const before = list.data?.next_before;
    if (!before) return;
    setMore(true);
    try {
      const page = await getOrders({ ...FILTERS[filter], before, limit: PAGE });
      list.setData((d) => d && { orders: [...d.orders, ...page.orders], next_before: page.next_before });
    } catch { /* the button stays for another try */ }
    setMore(false);
  };

  const orders = list.data?.orders ?? [];
  const days = byDay(oldestFirst ? [...orders].reverse() : orders);
  // Not paid is one tap with Undo; paid asks how first.
  const [paying, setPaying] = useState<Order | null>(null);
  const paidToggle = (o: Order) => () => (o.paid ? void change(o, { paid: false }) : setPaying(o));

  return (
    <div className="adm-page adm-done">
      <AdminLink className="adm-back adm-back--start adm-phone-only" to="/admin/orders"><ChevronLeft size={20} aria-hidden="true" />{adminCopy.order.back}</AdminLink>
      <h1 className="adm-title">{copy.title}</h1>
      <Segmented label={copy.filterLabel} value={filter} onChange={setFilter}
        options={(Object.keys(FILTERS) as Filter[]).map((f) => ({ value: f, label: copy.filters[f] }))} />

      {list.error && !list.data && <LoadError onRetry={list.reload} />}
      {list.loading && !list.data && <Skeleton />}
      {list.data && !orders.length && <p className="adm-muted">{copy.empty}</p>}

      {orders.length > 0 && (laptop ? (
        <table className="adm-table">
          <thead>
            <tr>
              <th scope="col">
                <button type="button" className="adm-table__sort" onClick={() => setOldestFirst((v) => !v)}>
                  {copy.columns[0]}{oldestFirst ? <ArrowUp size={14} aria-hidden="true" /> : <ArrowDown size={14} aria-hidden="true" />}
                </button>
              </th>
              {copy.columns.slice(1).map((c) => <th key={c} scope="col">{c}</th>)}
            </tr>
          </thead>
          {days.map(([day, list]) => (
            <tbody key={day}>
              <tr className="adm-table__day"><th colSpan={copy.columns.length} scope="colgroup">{day}</th></tr>
              {list.map((o) => (
                <tr key={o.id}>
                  <td>{formatTime(o.created_at)}</td>
                  <td><AdminLink to={`/admin/orders/${o.code}`}><Code code={o.code} /></AdminLink></td>
                  <td>{o.name}</td>
                  <td>{itemsText(o)}</td>
                  <td>{o.pincode}</td>
                  <td>{o.phone && formatPhone(o.phone)}</td>
                  <td>{o.amount != null && formatMoney(o.amount)}</td>
                  <td className={o.status === 'cancelled' ? 'is-cancelled' : undefined}>
                    {o.status === 'cancelled' ? adminCopy.orders.cancelled : adminCopy.order.steps[o.status]}
                  </td>
                  <td>{o.status !== 'cancelled' && <PaidChip order={o} onToggle={paidToggle(o)} />}</td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      ) : days.map(([day, list]) => (
        <section key={day} className="adm-stack">
          <h2 className="adm-done__day">{day}</h2>
          {list.map((o) => <OrderCard key={o.id} order={o} onAction={(x) => paidToggle(x)()} />)}
        </section>
      )))}

      {list.data?.next_before && (
        <button type="button" className="adm-btn adm-btn--quiet adm-done__more" disabled={more} onClick={older}>{copy.older}</button>
      )}
      <PaidSheet order={paying} onClose={() => setPaying(null)} onPick={(o, c) => void change(o, c)} />
    </div>
  );
};

export default DonePage;
