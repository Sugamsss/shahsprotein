import React, { useEffect, useRef } from 'react';
import { CheckCircle, ChevronRight, IndianRupee, Plus } from 'lucide-react';
import { OrderThumb } from '../../components/order/OrderThumb';
import { adminCopy } from '../../data/adminCopy';
import { productsData } from '../../data/products';
import { useOverview } from '../AdminLayout';
import { getStock, getTotals, setStock } from '../api';
import { useAdminMe } from '../auth';
import { firstName, formatDayInSentence, formatLongDate, formatMoney, formatTime, formatWeight, istHour } from '../format';
import { LoadError, Skeleton } from '../parts';
import { AdminLink } from '../router';
import { Logo } from '../Splash';
import type { OutOfStock, Overview, Totals } from '../types';
import { useRpc } from '../useRpc';
import { useUndoable } from '../useUndoable';
import { ProductCards } from './HomeProducts';
import { AdminWeek, CookWeek } from './HomeWeek';

const copy = adminCopy.homePage;

// Home (temp/home-totals/v2): three product cards at the top, then a Home per
// person. get_admin_me's home_view picks it: 'cook' is Pranjali's ("what do I
// make?", no money), anything else is Sunit's full view (every stage, every
// rupee). The totals are Home's own call; the overview is the one the layout
// already loads for the Orders badge, and feeds "Waiting on you" and coupons.

/** "today, 8:40 am", "yesterday, 9:10 pm", else "Wed 23 Sep". */
const whenIn = (iso: string) => {
  const day = formatDayInSentence(iso);
  return day === adminCopy.dates.today || day === adminCopy.dates.yesterday.toLowerCase() ? `${day}, ${formatTime(iso)}` : day;
};

// ---- The line under the date --------------------------------------------------------

const CookLede: React.FC<{ totals: Totals }> = ({ totals }) => {
  const grams = totals.products.reduce((sum, p) => sum + p.stages.to_send.grams, 0);
  if (grams > 0) {
    const [weight, rest] = copy.cookLede(formatWeight(grams), totals.overall.to_send.orders);
    return <p className="adm-home__lede"><b>{weight}</b>{rest}</p>;
  }
  const maybe = productsData.filter((product) => totals.products.some((p) => p.product_id === product.id && p.stages.to_confirm.orders > 0));
  return (
    <>
      <p className="adm-home__lede">{copy.cookNothing}</p>
      {maybe.length > 0 && (
        <p className="adm-home__lede-more">
          {copy.cookMaybe(totals.overall.to_confirm.orders === 1, maybe.map((p) => p.name), maybe.length === productsData.length)}
        </p>
      )}
    </>
  );
};

const AdminLede: React.FC<{ totals: Totals }> = ({ totals: { overall } }) => {
  const need = overall.to_confirm.orders + overall.to_send.orders;
  const out = overall.to_collect.unpaid_amount;
  const [count, verb] = copy.adminLede(need);
  return (
    <p className="adm-home__lede">
      {need ? <><b>{count}</b>{verb}</> : copy.adminNothing}
      {out > 0 && <>{copy.stillOut[0]}<b className="is-money">{formatMoney(out)}</b>{copy.stillOut[1]}</>}.
    </p>
  );
};

// ---- Sunit: waiting on you ------------------------------------------------------------

const Row: React.FC<{ lane: string; circle: React.ReactNode; tone?: 'accent' | 'money'; title: string; hint: string }> = ({
  lane, circle, tone, title, hint,
}) => (
  <AdminLink to={`/admin/orders#lane-${lane}`} className="adm-home__row">
    <span className={`adm-home__circle${tone ? ` is-${tone}` : ''}`}>{circle}</span>
    <span className="adm-list__main"><span className="adm-list__title">{title}</span><span className="adm-list__sub">{hint}</span></span>
    <ChevronRight className="adm-list__end" size={20} aria-hidden="true" />
  </AdminLink>
);

/** The overview gives the counts and dates; the totals add packs and names once they're in. */
const Waiting: React.FC<{ queue: Overview['queue']; totals: Totals | null | undefined }> = ({ queue: q, totals }) => {
  const collect = q.to_collect;
  const overall = totals?.overall;
  const paidSplit = copy.paidSplit(q.to_send.paid, q.to_send.count - q.to_send.paid);
  const collectHint = [
    (collect.people ?? 1) > 1 || !collect.oldest ? copy.fromPeople(collect.people ?? collect.count)
      : copy.deliveredBy(collect.oldest.name ?? collect.oldest.code, formatDayInSentence(collect.oldest.since)),
    collect.without_amount > 0 && copy.noTotalYet(overall?.to_collect.without_amount_names ?? [], collect.without_amount),
  ].filter(Boolean).join('. ');
  const wayNames = overall?.on_the_way.unpaid_names ?? [];
  const rows = [
    q.to_confirm > 0 && <Row key="c" lane="confirm" circle={q.to_confirm} tone="accent" title={copy.toConfirm(q.to_confirm)}
      hint={q.to_confirm_oldest ? copy.oldestFrom(whenIn(q.to_confirm_oldest)) : ''} />,
    q.to_send.count > 0 && <Row key="s" lane="send" circle={q.to_send.count} title={copy.toSend}
      hint={overall ? copy.packsThen(overall.to_send.packs, paidSplit) : paidSplit} />,
    collect.count > 0 && <Row key="m" lane="collect" circle={<IndianRupee size={18} aria-hidden="true" />} tone="money"
      title={collect.amount > 0 ? copy.toCollect(formatMoney(collect.amount)) : copy.ordersToCollect(collect.count)}
      hint={collectHint} />,
    q.on_the_way.count > 0 && <Row key="w" lane="way" circle={q.on_the_way.count} title={copy.onTheWay}
      hint={!q.on_the_way.not_paid ? copy.allPaid
        : wayNames.length ? copy.namesNotPaid(wayNames, q.on_the_way.not_paid) : copy.notPaidYet(q.on_the_way.not_paid)} />,
    q.stale > 0 && <Row key="x" lane="stale" circle={q.stale} title={copy.stale}
      hint={q.stale_oldest ? copy.staleFrom(formatDayInSentence(q.stale_oldest)) : copy.staleHint} />,
  ].filter(Boolean);
  return (
    <section className="adm-card adm-home__card adm-home__card--flush" aria-labelledby="adm-home-waiting">
      <div className="adm-home__head">
        <h2 id="adm-home-waiting">{copy.waiting}</h2>
        <AdminLink to="/admin/orders" className="adm-text-btn">{copy.allOrders}</AdminLink>
      </div>
      {rows.length ? <div className="adm-list adm-home__rows">{rows}</div> : <p className="adm-home__quiet">{copy.nothing}</p>}
    </section>
  );
};

// ---- Stock -------------------------------------------------------------------------------

type StockRpc = { data: OutOfStock | null; setData: (list: OutOfStock) => void };

/**
 * One row per product (or per size when only one size is out), each with Back in
 * stock. Pranjali always sees it ("Everything's on the site." when nothing is
 * off); Sunit only when something is off. Nothing shows until stock has loaded.
 */
const Stock: React.FC<{ stock: StockRpc; always: boolean }> = ({ stock: { data, setData }, always }) => {
  const run = useUndoable();
  const { reload } = useOverview();
  const stockRef = useRef<OutOfStock | null>(data);
  stockRef.current = data;
  const show = (list: OutOfStock) => { stockRef.current = list; setData(list); };

  const out = productsData.flatMap((product) => {
    const rows = (data ?? []).filter((r) => r.product_id === product.id && product.weightOptions.includes(r.size));
    if (!rows.length) return [];
    const since = rows.reduce((a, r) => (r.since < a ? r.since : a), rows[0].since);
    return rows.length === product.weightOptions.length
      ? [{ product, sizes: rows.map((r) => r.size), item: product.name, since }]
      : rows.map((r) => ({ product, sizes: [r.size], item: `${product.name} ${r.size}`, since: r.since }));
  });
  if (!data || (!out.length && !always)) return null;

  const flip = (productId: string, sizes: string[], item: string, inStock: boolean, quiet = false) => void run({
    apply: () => {
      const before = stockRef.current ?? [];
      const others = before.filter((r) => !(r.product_id === productId && sizes.includes(r.size)));
      show(inStock ? others : [...others, ...sizes.map((size) => ({ product_id: productId, size, since: new Date().toISOString() }))]);
      return () => show(before);
    },
    save: async () => {
      let last: OutOfStock = [];
      for (const size of sizes) last = await setStock(productId, size, inStock);
      show(last);
      void reload();
    },
    text: inStock ? adminCopy.products.turnedOn(item) : adminCopy.products.turnedOff(item),
    undo: () => flip(productId, sizes, item, !inStock, true),
    quiet,
  });

  return (
    <section className="adm-card adm-home__card" aria-labelledby="adm-home-stock">
      <div className="adm-home__head">
        <h2 id="adm-home-stock">{out.length ? copy.offTheSite : copy.stock}</h2>
        <AdminLink to="/admin/products" className="adm-text-btn">{copy.products}</AdminLink>
      </div>
      {!out.length && <p className="adm-home__ok"><CheckCircle size={18} aria-hidden="true" />{copy.allOnSite}</p>}
      {out.map(({ product, sizes, item, since }) => (
        <div key={item} className="adm-home__stock">
          <OrderThumb product={product} className="adm-home__thumb" />
          <span className="adm-list__main">
            <span className="adm-list__title">{item}</span>
            <span className="adm-list__sub">{copy.offSince(formatDayInSentence(since))}</span>
          </span>
          <button type="button" className="adm-btn adm-btn--quiet adm-btn--sm" onClick={() => flip(product.id, sizes, item, true)}>
            {copy.backInStock}
          </button>
        </div>
      ))}
    </section>
  );
};

const Coupons: React.FC<{ coupons: Overview['coupons'] }> = ({ coupons }) => (coupons.length ? (
  <section className="adm-card adm-home__card" aria-labelledby="adm-home-coupons">
    <div className="adm-home__head">
      <h2 id="adm-home-coupons">{copy.coupons}</h2>
      <AdminLink to="/admin/coupons" className="adm-text-btn">{copy.couponsLink}</AdminLink>
    </div>
    <ul className="adm-home__coupons">
      {coupons.map((c) => (
        <li key={c.code}><span className="adm-coupon__code">{c.code}</span><span>{c.orders ? copy.couponOrders(c.orders) : copy.notUsed}</span></li>
      ))}
    </ul>
  </section>
) : null);

// ---- The page ------------------------------------------------------------------------------

const HomePage: React.FC = () => {
  const me = useAdminMe();
  const cook = me.home_view === 'cook';
  const overview = useOverview();
  // The layout's overview may be a few minutes old; Home shows it fresh.
  useEffect(() => { void overview.reload(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const totalsRpc = useRpc(getTotals, [], { refreshOnFocus: true, refreshEveryMs: 60_000 });
  const stock = useRpc(getStock, []);
  // undefined while it loads (labels stay, numbers pulse), null if it couldn't.
  const totals = totalsRpc.data ?? (totalsRpc.error ? null : undefined);

  const hour = istHour();
  const part = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  const name = firstName(me.display_name) || me.email.split('@')[0];

  let lede: React.ReactNode = null;
  if (totals) lede = cook ? <CookLede totals={totals} /> : <AdminLede totals={totals} />;
  else if (totals === undefined) lede = <span className="adm-pulse adm-pulse--lede" aria-hidden="true" />;

  let below: React.ReactNode;
  if (cook) {
    below = (
      <div className="adm-home__grid">
        <div className="adm-home__col"><Stock stock={stock} always /></div>
        <div className="adm-home__col">{totals !== null && <CookWeek totals={totals} />}</div>
      </div>
    );
  } else if (!overview.data) {
    below = overview.error ? <LoadError onRetry={() => void overview.reload()} /> : <Skeleton cards={2} rows={3} />;
  } else {
    below = (
      <div className="adm-home__grid">
        <div className="adm-home__col"><Waiting queue={overview.data.queue} totals={totals} /></div>
        <div className="adm-home__col">
          {totals !== null && <AdminWeek totals={totals} />}
          <Stock stock={stock} always={false} />
          <Coupons coupons={overview.data.coupons} />
        </div>
      </div>
    );
  }

  return (
    <div className="adm-page adm-home">
      <div className="adm-home__top adm-phone-only">
        <Logo className="adm-home__logo" />
        <AdminLink to="/admin/orders/new" className="adm-btn adm-btn--tonal adm-btn--sm"><Plus size={18} strokeWidth={1.75} aria-hidden="true" />{copy.addOrder}</AdminLink>
      </div>
      <div>
        <h1 className="adm-title">{copy.greeting(part, name)}</h1>
        <p className="adm-home__date">{formatLongDate()}</p>
        {lede}
      </div>
      <section className="adm-home__products" aria-labelledby="adm-home-products">
        <div className="adm-home__head adm-home__head--products">
          <h2 id="adm-home-products">{cook ? copy.cards.cookTitle : copy.cards.adminTitle}</h2>
          <span>{cook ? copy.cards.cookMeta : copy.cards.adminMeta}</span>
        </div>
        {totals === null
          ? <LoadError onRetry={() => void totalsRpc.reload()} />
          : <ProductCards cook={cook} totals={totals} stock={stock.data} />}
      </section>
      {below}
    </div>
  );
};

export default HomePage;
