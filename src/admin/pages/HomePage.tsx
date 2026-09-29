import React, { useEffect, useRef } from 'react';
import { CheckCircle, ChevronRight, IndianRupee, Plus } from 'lucide-react';
import { OrderThumb } from '../../components/order/OrderThumb';
import { adminCopy } from '../../data/adminCopy';
import { productsData } from '../../data/products';
import { useOverview } from '../AdminLayout';
import { getStock, getTotals, setStock } from '../api';
import { useAdminMe } from '../auth';
import { firstName, formatDayInSentence, formatLongDate, formatMoney, formatWeight, istHour } from '../format';
import { LoadError, Skeleton } from '../parts';
import { AdminLink } from '../router';
import { Logo } from '../Splash';
import type { OutOfStock, Overview, Totals } from '../types';
import { useRpc } from '../useRpc';
import { useUndoable } from '../useUndoable';
import { ProductCards } from './HomeProducts';
import { AdminWeek, CookWeek } from './HomeWeek';

const copy = adminCopy.homePage;
const payCopy = adminCopy.payments;

// Home (temp/home-totals/v2): three product cards at the top, then a Home per
// person. get_admin_me's home_view picks it: 'cook' is Pranjali's ("what do I
// make?", no money), anything else is Sunit's full view (every stage, every
// rupee). The totals are Home's own call; the overview is the one the layout
// already loads for the Orders badge, and feeds "Waiting on you" and coupons.

// ---- The line under the date --------------------------------------------------------

// Interim (lane A rebuilds both Homes): only numbers the kitchen flow can say truly.

/** What's still short across Cooking orders, and how many orders wait on it. */
const CookLede: React.FC<{ totals: Totals }> = ({ totals: { kitchen } }) => {
  const grams = kitchen.products.reduce((sum, p) => sum + p.to_cook, 0);
  if (!grams) return <p className="adm-home__lede">{copy.cookNothing}</p>;
  const orders = new Set(kitchen.products.flatMap((p) => p.queue.map((q) => q.order_id))).size;
  const [weight, rest] = copy.cookLede(formatWeight(grams), orders);
  return <p className="adm-home__lede"><b>{weight}</b>{rest}</p>;
};

const AdminLede: React.FC<{ totals: Totals }> = ({ totals: { overall } }) => {
  // Sunit's part: packing and dropping off.
  const need = overall.packing.orders + overall.ready.orders;
  // What's still owed on delivered orders, not their quoted totals: part payments are already in.
  const out = overall.to_collect.amount_due;
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

/**
 * Ready: who hasn't paid. With part payments it's two sentences, "Aarav hasn't paid.
 * Snehal paid part.", since the server's unpaid names include the part paid.
 */
const wayHint = (way: Overview['queue']['ready'], names: Totals['overall']['ready'] | undefined): string => {
  if (!way.not_paid) return copy.allPaid;
  const unpaid = names?.unpaid_names ?? [];
  if (!way.part_paid) return unpaid.length ? copy.namesNotPaid(unpaid, way.not_paid) : copy.notPaidYet(way.not_paid);
  const part = names?.part_paid_names ?? [];
  // Take each part-paid name out once, so two people with the same first name both stay right.
  const left = [...part];
  const none = unpaid.filter((n) => {
    const at = left.indexOf(n);
    if (at < 0) return true;
    left.splice(at, 1);
    return false;
  });
  const noneCount = way.not_paid - way.part_paid;
  return [
    noneCount > 0 && payCopy.hasntPaid(none.slice(0, noneCount), noneCount),
    payCopy.paidPart(part, way.part_paid),
  ].filter(Boolean).join(' ');
};

/** The overview gives the counts and dates; the totals add packs and names once they're in. */
const Waiting: React.FC<{ queue: Overview['queue']; totals: Totals | null | undefined }> = ({ queue: q, totals }) => {
  const collect = q.to_collect;
  const overall = totals?.overall;
  const paidSplit = copy.paidSplit(q.packing.paid, q.packing.count - q.packing.paid);
  const collectHint = [
    (collect.people ?? 1) > 1 || !collect.oldest ? copy.fromPeople(collect.people ?? collect.count)
      : copy.deliveredBy(collect.oldest.name ?? collect.oldest.code, formatDayInSentence(collect.oldest.since)),
    collect.without_amount > 0 && copy.noTotalYet(overall?.to_collect.without_amount_names ?? [], collect.without_amount),
    // Last, so the line ends on its full stop: "From 2 people. Riya paid part."
    collect.part_paid > 0 && payCopy.paidPart(overall?.to_collect.part_paid_names ?? [], collect.part_paid),
  ].filter(Boolean).join('. ');
  const rows = [
    q.packing.count > 0 && <Row key="p" lane="packing" circle={q.packing.count} tone="accent" title={copy.toPack}
      hint={overall ? copy.packsThen(overall.packing.packs, paidSplit) : paidSplit} />,
    q.ready.count > 0 && <Row key="r" lane="ready" circle={q.ready.count} title={copy.toDropOff}
      hint={wayHint(q.ready, overall?.ready)} />,
    collect.count > 0 && <Row key="m" lane="collect" circle={<IndianRupee size={18} aria-hidden="true" />} tone="money"
      title={collect.amount_due > 0 ? copy.toCollect(formatMoney(collect.amount_due)) : copy.ordersToCollect(collect.count)}
      hint={collectHint} />,
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
