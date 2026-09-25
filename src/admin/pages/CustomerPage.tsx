import React from 'react';
import { ChevronLeft, MessageCircle, Phone } from 'lucide-react';
import { adminCopy } from '../../data/adminCopy';
import { getOrders } from '../api';
import { formatDay, formatMoney, formatPhone } from '../format';
import { LoadError, Skeleton } from '../parts';
import { AdminLink, usePathPart } from '../router';
import type { Order } from '../types';
import { useRpc } from '../useRpc';
import { LANES, laneOf, productName } from '../orders/model';
import { OrderCard } from '../orders/OrderCard';

const copy = adminCopy.customers;

/** The pack they've bought most of: "Raggi Jaggi 250 g". */
const usuallyBuys = (orders: Order[]) => {
  const packs = new Map<string, number>();
  orders.forEach((o) => o.lines.forEach((l) => {
    const key = `${productName(l.product_id)} ${l.size}`;
    packs.set(key, (packs.get(key) ?? 0) + l.quantity);
  }));
  return [...packs].sort((a, b) => b[1] - a[1])[0]?.[0];
};

/** One customer (spec 2.10): how to reach them, a summary, then their orders. */
const CustomerPage: React.FC = () => {
  const phone = usePathPart(1);
  const list = useRpc(() => getOrders({ view: 'all', phone, limit: 1000 }), [phone]);
  const back = <AdminLink className="adm-back adm-back--start" to="/admin/customers"><ChevronLeft size={20} aria-hidden="true" />{copy.back}</AdminLink>;

  if (list.error && !list.data) return <div className="adm-page">{back}<LoadError onRetry={list.reload} /></div>;
  if (!list.data) return <div className="adm-page">{back}<Skeleton /></div>;

  const orders = list.data.orders;
  const counted = orders.filter((o) => o.status !== 'cancelled');
  const latest = orders[0];
  if (!latest) return <div className="adm-page">{back}<p className="adm-muted">{copy.notFound}</p></div>;

  // "1 delivered, 1 to confirm": finished (delivered and paid), then what's still open, lane by lane.
  const open = LANES.map((lane) => [lane, counted.filter((o) => laneOf(o) === lane).length] as const).filter(([, n]) => n > 0);
  const finished = counted.filter((o) => laneOf(o) === 'done').length;
  const where = [
    finished > 0 && copy.delivered(finished),
    ...open.map(([lane, n]) => `${n} ${adminCopy.orders.lanes[lane][0].toLowerCase()}`),
  ].filter(Boolean).join(', ');
  const quoted = counted.reduce((sum, o) => sum + (o.amount ?? 0), 0);
  const first = counted[counted.length - 1] ?? latest;
  const usual = usuallyBuys(counted);

  return (
    <div className="adm-page adm-customer">
      {back}
      <div>
        <h1 className="adm-title">{latest.name ?? formatPhone(phone)}</h1>
        <p className="adm-muted">{[formatPhone(phone), latest.pincode].filter(Boolean).join(' · ')}</p>
      </div>
      <div className="adm-od-reach">
        <a className="adm-btn adm-btn--quiet adm-btn--sm" href={`https://wa.me/${phone}`} target="_blank" rel="noreferrer">
          <MessageCircle size={18} aria-hidden="true" />{adminCopy.order.whatsapp}
        </a>
        <a className="adm-btn adm-btn--quiet adm-btn--sm" href={`tel:+${phone}`}><Phone size={18} aria-hidden="true" />{adminCopy.order.call}</a>
      </div>
      <section className="adm-card adm-stack">
        <p>
          <b>{adminCopy.customers.orders(counted.length)}</b>{copy.since(formatDay(first.created_at))}
          {where && ` ${where[0].toUpperCase()}${where.slice(1)}.`}
          {quoted > 0 && <> <b>{formatMoney(quoted)}</b>{copy.quoted}</>}
        </p>
        {usual && <p className="adm-od-fact"><span>{copy.usually}</span>{usual}</p>}
      </section>
      <h2 className="adm-done__day">{copy.theirOrders}</h2>
      {orders.map((o) => <OrderCard key={o.id} order={o} dateTitle />)}
    </div>
  );
};

export default CustomerPage;
