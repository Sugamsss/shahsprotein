import React, { useEffect, useId, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { OrderThumb } from '../../components/order/OrderThumb';
import { adminCopy } from '../../data/adminCopy';
import { productsData } from '../../data/products';
import { getBatches } from '../api';
import { firstName, formatDayInSentence, formatWeight } from '../format';
import { LoadError, Skeleton } from '../parts';
import { AdminLink } from '../router';
import type { BatchRecord } from '../types';
import { useRpc } from '../useRpc';
import { productName, sizeText } from '../orders/model';
import { batchDates, shelfOf } from './batches';

const copy = adminCopy.batches;
const PAGE = 60;

/** One order a batch went to: name, code and stage, and what it got. A tap opens the order. */
const WentTo: React.FC<{ o: BatchRecord['orders'][number] }> = ({ o }) => (
  <li>
    <AdminLink to={`/admin/orders/${o.code}`} className="adm-bwent">
      <span className="adm-bwent__main">
        <span className="adm-bwent__name">{o.name ?? o.code}</span>
        <span className="adm-bwent__sub">
          {copy.orderLine(formatWeight(o.grams), o.packs.map((p) => `${sizeText(p.size)} × ${p.quantity}`))}
        </span>
      </span>
      <span className="adm-bwent__end">
        <span className="adm-bwent__code">{o.code}</span>
        <span className={`adm-bwent__stage is-${o.status}`}>{copy.statuses[o.status] ?? o.status}</span>
      </span>
      <ChevronRight className="adm-list__end" size={18} aria-hidden="true" />
    </AdminLink>
  </li>
);

/** One batch: number, product and dates; open, its weights and everyone it went to. */
const BatchCard: React.FC<{ b: BatchRecord; startOpen: boolean }> = ({ b, startOpen }) => {
  const [open, setOpen] = useState(startOpen);
  const id = useId();
  const product = productsData.find((p) => p.id === b.product_id);
  const { mfg, exp } = batchDates(b);
  const shelf = shelfOf(b);
  return (
    <li className={`adm-card adm-bcard${open ? ' is-open' : ''}`}>
      <button type="button" className="adm-bcard__head" aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}>
        {product ? <OrderThumb product={product} className="adm-kx-thumb" /> : <span />}
        <span className="adm-bcard__main">
          <span className="adm-bcard__code">
            {b.code}
            <span className={`adm-bcard__shelf is-${shelf}`}>{copy.shelf(shelf, formatWeight(Math.max(b.spare, 0)))}</span>
          </span>
          <span className="adm-bcard__sub">{copy.rowSub(productName(b.product_id), formatWeight(b.grams), b.orders.length)}</span>
          {/* Mfg is in the number (and in the open card): the line keeps to what needs a look. */}
          <span className="adm-bcard__dates">{exp ? copy.expShort(exp) : copy.noExp}</span>
        </span>
        <ChevronRight className="adm-bcard__chev" size={20} aria-hidden="true" />
      </button>
      <div id={id} className="adm-bcard__body" hidden={!open}>
        <dl className="adm-bcard__facts">
          <div><dt>{copy.mfg}</dt><dd>{mfg}</dd></div>
          <div><dt>{copy.exp}</dt><dd>{exp ?? copy.noExp}</dd></div>
          <div><dt>{copy.made}</dt><dd>{formatWeight(b.grams)}</dd></div>
          <div><dt>{copy.toOrders}</dt><dd>{formatWeight(b.to_orders)}</dd></div>
          <div><dt>{copy.spareLeft}</dt><dd>{formatWeight(Math.max(b.spare, 0))}</dd></div>
          {b.written_off > 0 && <div><dt>{copy.off}</dt><dd>{formatWeight(b.written_off)}</dd></div>}
          <div>
            <dt>{copy.loggedBy}</dt>
            <dd>{[b.by_name && firstName(b.by_name), formatDayInSentence(b.created_at)].filter(Boolean).join(', ')}</dd>
          </div>
        </dl>
        <h3 className="adm-kx-label">{copy.wentTo}</h3>
        {b.orders.length
          ? <ul className="adm-bwents">{b.orders.map((o) => <WentTo key={o.order_id} o={o} />)}</ul>
          : <p className="adm-muted">{copy.nobodyYet}</p>}
      </div>
    </li>
  );
};

/**
 * Batches: every batch with its number, Mfg and Exp, newest made first. A tap opens one:
 * its weights and everyone it went to. Search by number, or by a name, phone or order code
 * to find which batch someone got. `?q=` opens it on a search (an order's "Everyone who got
 * this batch").
 */
const BatchesPage: React.FC = () => {
  const { search } = useLocation();
  const initial = new URLSearchParams(search).get('q') ?? '';
  const [text, setText] = useState(initial);
  const [query, setQuery] = useState(initial.trim());
  const [product, setProduct] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);

  // Ask once typing stops for a moment.
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(text.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [text]);
  useEffect(() => setLimit(PAGE), [query, product]);

  const list = useRpc(() => getBatches({ search: query, productId: product ?? undefined, limit }), [query, product, limit]);
  const missing = list.error?.kind === 'missing';
  const batches = list.data?.batches ?? [];
  const exact = batches.filter((b) => b.code.toLowerCase() === query.toLowerCase());

  return (
    <div className="adm-page adm-hist adm-batches">
      <h1 className="adm-title">{copy.title}</h1>
      <p className="adm-intro">{copy.intro}</p>

      {!missing && (
        <>
          <input className="adm-input" type="search" value={text} placeholder={copy.searchPlaceholder}
            aria-label={copy.searchLabel} onChange={(e) => setText(e.target.value)} />
          <div className="adm-hist__filter" role="group" aria-label={copy.filterLabel}>
            <button type="button" className={`adm-hist__chip${product === null ? ' is-on' : ''}`} aria-pressed={product === null} onClick={() => setProduct(null)}>
              {copy.all}
            </button>
            {productsData.map((p) => (
              <button key={p.id} type="button" className={`adm-hist__chip${product === p.id ? ' is-on' : ''}`} aria-pressed={product === p.id} onClick={() => setProduct(p.id)}>
                {p.name}
              </button>
            ))}
          </div>
        </>
      )}

      {missing && <p className="adm-muted">{adminCopy.errors.missing}</p>}
      {!missing && list.error && !list.data && <LoadError onRetry={list.reload} />}
      {list.loading && !list.data && <Skeleton rows={3} cards={2} />}
      {list.data && !batches.length && (
        <p className="adm-muted">
          {query ? copy.noMatch(query) : product ? copy.emptyProduct(productName(product)) : copy.empty}
        </p>
      )}

      {batches.length > 0 && (
        <ul className="adm-bcards">
          {/* A search for one number opens that batch. */}
          {batches.map((b) => <BatchCard key={b.id} b={b} startOpen={exact.length === 1 && exact[0].id === b.id} />)}
        </ul>
      )}

      {list.data?.more && (
        <button type="button" className="adm-btn adm-btn--quiet adm-hist__more" disabled={list.loading} onClick={() => setLimit((n) => n + PAGE)}>
          {copy.showMore}
        </button>
      )}
    </div>
  );
};

export default BatchesPage;
