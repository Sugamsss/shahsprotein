import React, { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CheckCircle2, ChevronRight, Download, Plus, Search } from 'lucide-react';
import { adminCopy } from '../../data/adminCopy';
import { productsData } from '../../data/products';
import { getOrders } from '../api';
import { formatMoney } from '../format';
import { LoadError, Skeleton } from '../parts';
import { AdminLink, usePathPart, useQueryText } from '../router';
import type { Order } from '../types';
import { useOverview } from '../AdminLayout';
import { useRpc } from '../useRpc';
import { ConfirmSheet } from './ConfirmSheet';
import { ExportSheet } from './ExportSheet';
import { type Lane, LANES, NEXT, laneOf } from './model';
import { type CardAction, OrderCard } from './OrderCard';
import { OrderPage, OrderPopup } from './OrderView';
import { useOrderChange } from './useOrderChange';
import { useTheme } from '../../context/ThemeContext';

const copy = adminCopy.orders;
const LAPTOP = '(min-width: 960px)';

export const useLaptop = (): boolean => {
  const [on, setOn] = useState(() => window.matchMedia(LAPTOP).matches);
  useEffect(() => {
    const mq = window.matchMedia(LAPTOP);
    const update = () => setOn(mq.matches);
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return on;
};

/** The same match the server's search makes: code (with or without SN-/#), name, or 4+ phone digits. */
const matches = (o: Order, q: string) => {
  const t = q.trim().toLowerCase().replace(/^#/, '');
  const digits = t.replace(/\D/g, '');
  return o.code.toLowerCase().includes(t.replace(/^sn-/, ''))
    || (o.name ?? '').toLowerCase().includes(t)
    || (digits.length >= 4 && (o.phone ?? '').includes(digits));
};

/** Waits for typing to stop. */
const useSettled = <T,>(value: T, ms = 300): T => {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
};

const LaneBlock: React.FC<{ lane: Lane; orders: Order[]; money?: number; children: React.ReactNode; className?: string }> = ({
  lane, orders, money, children, className = '',
}) => {
  const [title, hint] = copy.lanes[lane];
  return (
    <section className={`adm-lane adm-lane--${lane} ${className}`} id={`lane-${lane}`} aria-labelledby={`lane-${lane}-t`}>
      <div className="adm-lane__head">
        <h2 id={`lane-${lane}-t`}>{title}</h2>
        <span className="adm-count">{lane === 'collect' && money ? formatMoney(money) : orders.length}</span>
      </div>
      {hint && <p className="adm-lane__hint">{hint}</p>}
      {children}
    </section>
  );
};

/** Phone: the sticky strip that jumps between lanes and follows the scroll. */
const LaneJump: React.FC<{ counts: Record<Lane, number>; money: number }> = ({ counts, money }) => {
  const [current, setCurrent] = useState<Lane>('confirm');
  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const passed = LANES.filter((l) => (document.getElementById(`lane-${l}`)?.getBoundingClientRect().top ?? 1e9) < 90);
        setCurrent(passed[passed.length - 1] ?? 'confirm');
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); cancelAnimationFrame(frame); };
  }, []);
  return (
    <nav className="adm-jump adm-phone-only" aria-label={copy.jumpLabel}>
      {LANES.map((l) => (
        <a key={l} href={`#lane-${l}`} aria-current={l === current || undefined}
          className={`${counts[l] ? '' : 'is-zero'}${l === 'collect' && money ? ' is-money' : ''}`}>
          <b>{l === 'collect' && money ? formatMoney(money) : counts[l]}</b><span>{copy.lanes[l][0]}</span>
        </a>
      ))}
    </nav>
  );
};

const Empty: React.FC<{ first: boolean }> = ({ first }) => {
  const { theme } = useTheme();
  if (first) return <p className="adm-card adm-muted">{copy.empty.first}</p>;
  return (
    <div className="adm-caughtup">
      <span className="adm-caughtup__pile" aria-hidden="true">
        {productsData.map((p) => <img key={p.id} src={theme === 'dark' ? p.orderThumbDark : p.orderThumb} alt="" width={64} height={64} />)}
      </span>
      <h2>{copy.empty.caughtUp}</h2>
      <p>{copy.empty.caughtUpBody}</p>
    </div>
  );
};

/**
 * Orders (spec 2.5). Phone: stacked lanes with a jump strip; /admin/orders/:code
 * is its own page. Laptop: a 4-lane board, with /admin/orders/:code as a popup over it.
 */
const OrdersPage: React.FC = () => {
  const code = usePathPart(1);
  const location = useLocation();
  const navigate = useNavigate();
  const laptop = useLaptop();
  const doneCounts = useOverview().data?.done;
  const q = new URLSearchParams(location.search).get('q') ?? '';
  const [searching, setSearching] = useState(false);
  const [confirming, setConfirming] = useState<Order | null>(null);
  const [exporting, setExporting] = useState(false);

  const list = useRpc(() => getOrders({ view: 'todo', limit: 1000 }), [], { refreshOnFocus: true });
  // A card that changes lane flashes where it lands.
  const [flash, setFlash] = useState<string | null>(null);
  const put = useCallback((o: Order) => list.setData((d) => {
    if (!d) return d;
    const before = d.orders.find((x) => x.id === o.id);
    if (before && laneOf(before) !== laneOf(o)) setFlash(o.id);
    return { ...d, orders: d.orders.map((x) => (x.id === o.id ? o : x)) };
  }), [list.setData]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(null), 900);
    return () => clearTimeout(timer);
  }, [flash]);
  const drop = (o: Order) => list.setData((d) => d && { ...d, orders: d.orders.filter((x) => x.id !== o.id) });
  const change = useOrderChange(put);

  // Search also looks through Done, and an empty board asks whether anything was ever done.
  const settledQ = useSettled(q.trim());
  const empty = list.data?.orders.length === 0;
  const done = useRpc(
    () => (settledQ || empty ? getOrders({ view: 'done', search: settledQ || undefined, limit: settledQ ? 20 : 1 }) : Promise.resolve(null)),
    [settledQ, empty],
  );

  const orders = list.data?.orders ?? [];
  const shown = q.trim() ? orders.filter((o) => matches(o, q)) : orders;
  const by: Record<Lane, Order[]> = { confirm: [], send: [], way: [], collect: [], stale: [], done: [] };
  shown.forEach((o) => by[laneOf(o)].push(o));
  const money = by.collect.reduce((sum, o) => sum + (o.amount ?? 0), 0);
  const sequence = [...by.confirm, ...by.stale, ...by.send, ...by.way, ...by.collect, ...by.done];

  const [findText, setFindText] = useQueryText('/admin/orders');

  const onAction = (o: Order, action: CardAction) => {
    const lane = laneOf(o);
    if (action === 'next' && lane === 'confirm') {
      if (laptop) navigate(`/admin/orders/${o.code}${location.search}`, { state: { focus: 'phone' } });
      else setConfirming(o);
    } else if (action === 'next' && lane !== 'stale' && lane !== 'done') void change(o, NEXT[lane]);
    else if (action === 'paid') void change(o, { paid: !o.paid });
    else if (action === 'keep') void change(o, { kept: true });
    else if (action === 'cancel') void change(o, { status: 'cancelled' });
  };

  // Phone: one order is its own page.
  if (code && !laptop) return <OrderPage code={code} />;

  const card = (o: Order) => (
    <OrderCard key={o.id} order={o} onAction={onAction} selected={o.code === code} mark={q} flash={o.id === flash} />
  );
  const cards = (lane: Lane) => (by[lane].length ? by[lane].map(card) : <p className="adm-lane__empty">{copy.laneEmpty}</p>);
  const doneHits = settledQ ? done.data?.orders ?? [] : [];
  const counts = Object.fromEntries(LANES.map((l) => [l, by[l].length])) as Record<Lane, number>;
  const summary = [
    by.confirm.length > 0 && ['confirm', `${by.confirm.length} ${copy.toConfirm}`],
    by.send.length > 0 && ['send', `${by.send.length} ${copy.toSend}`],
    by.collect.length > 0 && ['collect', copy.toCollect(money ? formatMoney(money) : String(by.collect.length))],
  ].filter(Boolean) as [Lane, string][];

  return (
    <div className="adm-page adm-orders">
      <div className="adm-orders__top">
        <div>
          <h1 className="adm-title">{copy.title}</h1>
          {summary.length > 0 && (
            <p className="adm-orders__summary">
              {summary.map(([lane, text], i) => (
                <React.Fragment key={lane}>
                  {i > 0 && (i === summary.length - 1 ? ' and ' : ', ')}
                  <a href={`#lane-${lane}`} className={lane === 'collect' ? 'is-money' : undefined}>{text}</a>
                </React.Fragment>
              ))}.
            </p>
          )}
        </div>
        <div className="adm-orders__acts">
          <button type="button" className="adm-iconbtn adm-phone-only" aria-label={copy.find} aria-expanded={searching || !!q}
            onClick={() => setSearching(true)}><Search size={20} aria-hidden="true" /></button>
          <AdminLink className="adm-btn adm-btn--tonal adm-btn--sm adm-phone-only" to="/admin/orders/new"><Plus size={18} aria-hidden="true" />{copy.add}</AdminLink>
          <AdminLink className="adm-btn adm-btn--quiet adm-btn--sm adm-laptop-only" to="/admin/orders/done"><CheckCircle2 size={16} aria-hidden="true" />{doneCounts ? copy.doneCount(doneCounts.delivered_paid + doneCounts.cancelled) : copy.doneLink}</AdminLink>
          <button type="button" className="adm-btn adm-btn--quiet adm-btn--sm adm-laptop-only" onClick={() => setExporting(true)}>
            <Download size={16} aria-hidden="true" />{copy.exportCsv}
          </button>
        </div>
      </div>

      {(searching || q) && (
        <div className="adm-orders__find adm-phone-only" role="search">
          <input className="adm-input" type="search" autoFocus value={findText} placeholder={copy.findPlaceholder}
            aria-label={copy.find} onChange={(e) => setFindText(e.target.value)} />
          <button type="button" className="adm-btn adm-btn--quiet adm-btn--sm" onClick={() => { setFindText(''); setSearching(false); }}>{copy.cancelFind}</button>
        </div>
      )}

      {list.error && !list.data && <LoadError onRetry={list.reload} />}
      {list.loading && !list.data && <Skeleton />}
      {empty && !q && !done.loading && <Empty first={!done.data?.orders.length} />}

      {list.data && !empty && (
        <>
          {!q && <LaneJump counts={counts} money={money} />}
          <div className="adm-board">
            {LANES.map((lane) => (!q || by[lane].length > 0) && (
              <LaneBlock key={lane} lane={lane} orders={by[lane]} money={money}>
                {cards(lane)}
                {/* Laptop: stale orders sit at the bottom of To confirm. Phone: their own group, below. */}
                {lane === 'confirm' && laptop && by.stale.length > 0 && (
                  <div className="adm-lane__stale">
                    <p className="adm-lane__sub">{copy.lanes.stale[0]} <span className="adm-count">{by.stale.length}</span></p>
                    {by.stale.map(card)}
                  </div>
                )}
              </LaneBlock>
            ))}
          </div>
          {!laptop && by.stale.length > 0 && <LaneBlock lane="stale" orders={by.stale}>{by.stale.map(card)}</LaneBlock>}
        </>
      )}

      {doneHits.length > 0 && (
        <LaneBlock lane="done" orders={doneHits}>
          {doneHits.map(card)}
        </LaneBlock>
      )}
      {q.trim() && list.data && shown.length === 0 && settledQ && !done.loading && doneHits.length === 0 && (
        <div className="adm-card adm-stack">
          <p>{copy.empty.noMatch(q.trim())}</p>
          <AdminLink className="adm-btn adm-btn--tonal adm-btn--sm" to={`/admin/orders/new?code=${encodeURIComponent(q.trim())}`}>{copy.empty.addByHand}</AdminLink>
        </div>
      )}

      {!q && list.data && (
        <AdminLink className="adm-donelink adm-phone-only" to="/admin/orders/done">
          <CheckCircle2 size={22} aria-hidden="true" />
          <span><b>{copy.doneLink}</b>{doneCounts && <small>{copy.doneSub(doneCounts.delivered_paid, doneCounts.cancelled)}</small>}</span>
          <ChevronRight size={20} aria-hidden="true" />
        </AdminLink>
      )}

      {laptop && code && (
        <OrderPopup key="popup" code={code} sequence={sequence} putInList={put} onDeleted={drop}
          focusPhone={(location.state as { focus?: string } | null)?.focus === 'phone'}
          onClose={() => {
            navigate(`/admin/orders${location.search}`);
            // The card may have moved lanes while the popup was open, so find it again.
            requestAnimationFrame(() => document.querySelector<HTMLElement>(`.adm-ocard__open[href="/admin/orders/${code}"]`)?.focus());
          }} />
      )}
      <ConfirmSheet order={confirming} onClose={() => setConfirming(null)} onConfirm={(o, c) => void change(o, c)} />
      <ExportSheet isOpen={exporting} onClose={() => setExporting(false)} />
    </div>
  );
};

export default OrdersPage;
