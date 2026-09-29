import React, { useState } from 'react';
import { Check, ChevronLeft } from 'lucide-react';
import { adminCopy } from '../../data/adminCopy';
import { useOverview } from '../AdminLayout';
import { getOrders } from '../api';
import { formatDay, formatWeight } from '../format';
import { LoadError, Skeleton } from '../parts';
import { AdminLink } from '../router';
import type { Order, OrderFilters } from '../types';
import { useRpc } from '../useRpc';
import { pileOf, productName, sortLines, sizeText } from './model';
import { Code, Thumb } from './OrderCard';
import { sampleGroups, sampleLines } from './samples';

const copy = adminCopy.kitchenForms;

/** Where the Free samples list lives. The Orders page links here. */
export const FREE_SAMPLES_PATH = '/admin/orders/samples';

// Who got free samples: every order carrying one, a free sample order or a taster riding
// along with a real order. The Done page's pattern: newest first, a page at a time.
// Every order carrying a sample that isn't cancelled. The Orders page's Free samples count
// (overview queue.free_samples.total) counts exactly these.
const FILTER: OrderFilters = { view: 'all', samples: true, status: ['cooking', 'packing', 'ready', 'delivered'] };
const PAGE = 50;

const monthNow = () => new Intl.DateTimeFormat('en-IN', { month: 'long', timeZone: 'Asia/Kolkata' }).format(new Date());

/** Where it's at, after "With their order · " when it rode along: a stage, ✓ Delivered, or Cancelled. */
const Stage: React.FC<{ order: Order }> = ({ order: o }) => {
  const along = o.free_sample ? '' : `${copy.withTheirOrder} · `;
  if (o.status === 'cancelled') return <span className="adm-ocard__word is-cancelled">{along}{adminCopy.orders.cancelled}</span>;
  if (o.status === 'delivered') {
    return <span className="adm-ocard__word"><Check size={14} aria-hidden="true" />{along}{adminCopy.order.steps.delivered}</span>;
  }
  return <span className="adm-ocard__word is-open">{along}{adminCopy.order.steps[o.status]}</span>;
};

/** One order: who, when, its sample lines ("Date Bites sample × 1"), then code, pincode and stage. */
const SampleCard: React.FC<{ order: Order }> = ({ order: o }) => {
  const lines = sortLines(sampleLines(o));
  const ids = pileOf(lines);
  return (
    <article className="adm-ocard adm-scard">
      <AdminLink className="adm-ocard__open" to={`/admin/orders/${o.code}`} aria-label={adminCopy.orders.open(o.name ?? o.code, o.code)} />
      <span className={`adm-pile adm-pile--${Math.min(ids.length, 2)}`}>
        {ids.map((id) => <Thumb key={id} id={id} />)}
      </span>
      <div className="adm-ocard__head">
        <span className="adm-ocard__name">{o.name ?? o.phone}</span>
        <span className="adm-ocard__time">{formatDay(o.created_at)}</span>
      </div>
      <ul className="adm-ocard__items">
        {lines.map((l) => (
          <li key={l.product_id}><b className="adm-pname">{productName(l.product_id)}</b>{sizeText(l.size)}<span>× {l.quantity}</span></li>
        ))}
      </ul>
      <div className="adm-ocard__foot">
        <span className="adm-ocard__meta"><Code code={o.code} />{o.pincode && <span className="adm-ocard__place"> · {o.pincode}</span>}</span>
        <Stage order={o} />
      </div>
    </article>
  );
};

const FreeSamplesPage: React.FC = () => {
  const month = useOverview().data?.queue.free_samples;
  const list = useRpc(() => getOrders({ ...FILTER, limit: PAGE }), []);
  const [more, setMore] = useState(false);

  const older = async () => {
    const before = list.data?.next_before;
    if (!before) return;
    setMore(true);
    try {
      const page = await getOrders({ ...FILTER, before, limit: PAGE });
      list.setData((d) => d && { orders: [...d.orders, ...page.orders], next_before: page.next_before });
    } catch { /* the button stays for another try */ }
    setMore(false);
  };

  const orders = list.data?.orders ?? [];
  return (
    <div className="adm-page adm-samples">
      <AdminLink className="adm-back adm-back--start adm-phone-only" to="/admin/orders"><ChevronLeft size={20} aria-hidden="true" />{adminCopy.order.back}</AdminLink>
      <h1 className="adm-title">{copy.samplesTitle}</h1>
      {month && (
        <p className="adm-intro">{copy.samplesSummary(month.sent_this_month, formatWeight(month.grams_this_month), monthNow())}</p>
      )}

      {list.error && !list.data && <LoadError onRetry={list.reload} />}
      {list.loading && !list.data && <Skeleton />}
      {list.data && !orders.length && <p className="adm-muted">{copy.samplesEmpty}</p>}

      {sampleGroups(orders, formatDay).map((group) => (
        <section key={group.day ?? 'open'} className="adm-samples__group">
          <h2 className="adm-samples__day">{group.day ?? copy.notDelivered}</h2>
          <div className="adm-samples__cards">
            {group.orders.map((o) => <SampleCard key={o.id} order={o} />)}
          </div>
        </section>
      ))}

      {list.data?.next_before && (
        <button type="button" className="adm-btn adm-btn--quiet adm-samples__more" disabled={more} onClick={older}>{copy.older}</button>
      )}
    </div>
  );
};

export default FreeSamplesPage;
