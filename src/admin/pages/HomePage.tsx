import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronRight, CookingPot, Hourglass, IndianRupee, Plus } from 'lucide-react';
import { OrderThumb } from '../../components/order/OrderThumb';
import { adminCopy } from '../../data/adminCopy';
import { productsData } from '../../data/products';
import { useLocation, useNavigate } from 'react-router-dom';
import { LOG_COOKING_STATE, useLogCookingQuiet, useOverview } from '../AdminLayout';
import { getMetrics, getStock, getTotals, setStock } from '../api';
import { useAdminMe } from '../auth';
import { firstName, formatAge, formatDayInSentence, formatLongDate, formatMoney, formatWeight, istHour } from '../format';
import { FixBatchSheet } from '../kitchen/FixBatchSheet';
import { LoggedList } from '../kitchen/LoggedList';
import { LogSheet } from '../kitchen/LogSheet';
import { ordersWaiting, spareWarnings, toCook } from '../kitchen/model';
import { useKitchenDone } from '../kitchen/useKitchenDone';
import { WriteOffSheet } from '../kitchen/WriteOffSheet';
import { productName } from '../orders/model';
import { LoadError, Skeleton } from '../parts';
import { AdminLink } from '../router';
import { Logo } from '../Splash';
import type { Kitchen, KitchenBatch, OutOfStock, Overview, Totals } from '../types';
import { useRpc } from '../useRpc';
import { useUndoable } from '../useUndoable';
import { ProductCards } from './HomeProducts';
import { readyHint, packingHint } from './homeHints';
import { HomeMetrics } from './HomeMetrics';

const copy = adminCopy.homePage;
const payCopy = adminCopy.payments;
const kitchenCopy = adminCopy.kitchen;

// Home: one per person. get_admin_me's home_view picks it. 'cook' is Pranjali's: what
// to cook in one sentence, one "Log cooking" button, the product cards in kitchen
// words with spare at their foot, and the batches she logged this week (tap one to
// fix it). Anyone else gets Sunit's: what to pack and drop off and the money still
// out, the cards by stage, Waiting on you. Both get "How it's going" (HomeMetrics): on a
// phone right after the work list, on a laptop the right column beside the work (Waiting
// on you or Logged, Stock, Coupons), so neither column sits empty. The totals and the metrics are
// Home's own calls (the totals carry the kitchen); the overview is the layout's (the
// Orders badge).

// ---- The line under the date --------------------------------------------------------

/** Pranjali: "Cook 2 kg Raggi Jaggi and 750 g Muesli." When nothing waits, who has the food. */
const CookLede: React.FC<{ kitchen: Kitchen; packing: number }> = ({ kitchen, packing }) => {
  const items = toCook(kitchen);
  if (!items.length) {
    return (
      <>
        <p className="adm-home__lede">{copy.cookNothing}</p>
        {packing > 0 && <p className="adm-home__lede-more">{copy.cookNothingMore(packing)}</p>}
      </>
    );
  }
  return (
    <p className="adm-home__lede" aria-label={copy.cookLedeName(items.map((i) => kitchenCopy.item(formatWeight(i.grams), productName(i.product_id))), ordersWaiting(kitchen))}>
      {copy.cookWord}
      {items.map((item, i) => (
        <React.Fragment key={item.product_id}>
          {i > 0 && (i === items.length - 1 ? copy.and : ', ')}
          <b>{kitchenCopy.item(formatWeight(item.grams), productName(item.product_id))}</b>
        </React.Fragment>
      ))}
      .
    </p>
  );
};

/** Spare near or past its date, one line per product, most urgent first. A tap takes it off the shelf. */
const SpareWarnings: React.FC<{ kitchen: Kitchen; onTake: (productId: string, batchId: string) => void }> = ({ kitchen, onTake }) => {
  const warnings = spareWarnings(kitchen);
  if (!warnings.length) return null;
  return (
    <div className="adm-home__warns">
      {warnings.map(({ product_id, batch }) => {
        const kind = batch.state === 'past' ? 'past' : (batch.days_left ?? 0) <= 1 ? 'today' : 'days';
        const text = kitchenCopy.warn(productName(product_id), kind, batch.days_left ?? 0);
        return kitchen.can_write_off ? (
          <button key={product_id} type="button" className={`adm-home__warn is-${batch.state}`} onClick={() => onTake(product_id, batch.batch_id)}>
            <Hourglass size={18} aria-hidden="true" /><span>{text}</span><ChevronRight size={18} aria-hidden="true" />
          </button>
        ) : (
          <p key={product_id} className={`adm-home__warn is-${batch.state}`}><Hourglass size={18} aria-hidden="true" /><span>{text}</span></p>
        );
      })}
    </div>
  );
};

const AdminLede: React.FC<{ totals: Totals }> = ({ totals: { overall } }) => {
  // Sunit's part: packing and dropping off.
  const pack = overall.packing.orders;
  const drop = overall.ready.orders;
  // What's still owed on delivered orders, not their quoted totals: part payments are already in.
  const out = overall.to_collect.amount_due;
  const parts = [pack > 0 && copy.toPackCount(pack), drop > 0 && copy.toDropCount(drop)].filter(Boolean) as string[];
  return (
    <p className="adm-home__lede">
      {parts.length ? parts.map((part, i) => <React.Fragment key={part}>{i > 0 && ', '}<b>{part}</b></React.Fragment>) : copy.adminNothing}
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
  const collectHint = [
    (collect.people ?? 1) > 1 || !collect.oldest ? copy.fromPeople(collect.people ?? collect.count)
      : copy.deliveredBy(collect.oldest.name ?? collect.oldest.code, formatDayInSentence(collect.oldest.since)),
    collect.without_amount > 0 && copy.noTotalYet(overall?.to_collect.without_amount_names ?? [], collect.without_amount),
    // Last, so the line ends on its full stop: "From 2 people. Riya paid part."
    collect.part_paid > 0 && payCopy.paidPart(overall?.to_collect.part_paid_names ?? [], collect.part_paid),
  ].filter(Boolean).join('. ');
  const rows = [
    q.packing.count > 0 && <Row key="p" lane="packing" circle={q.packing.count} tone="accent" title={copy.toPack}
      hint={packingHint(q.packing, overall?.packing.packs)} />,
    q.ready.count > 0 && <Row key="r" lane="ready" circle={q.ready.count} title={copy.toDropOff}
      hint={readyHint(q.ready, overall?.ready, q.ready.oldest_since && formatAge(q.ready.oldest_since), firstName(q.ready.oldest?.name) || null)} />,
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
 * stock. Only when something is off the site. Nothing shows until stock has loaded.
 */
const Stock: React.FC<{ stock: StockRpc }> = ({ stock: { data, setData } }) => {
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
  if (!data || !out.length) return null;

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
        <h2 id="adm-home-stock">{copy.offTheSite}</h2>
        <AdminLink to="/admin/products" className="adm-text-btn">{copy.products}</AdminLink>
      </div>
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

type KitchenSheet =
  | { kind: 'log' }
  | { kind: 'fix'; batch: KitchenBatch }
  | { kind: 'off'; productId: string; batchId: string };

const HomePage: React.FC = () => {
  const me = useAdminMe();
  const cook = me.home_view === 'cook';
  const overview = useOverview();
  // The layout's overview may be a few minutes old; Home shows it fresh.
  useEffect(() => { void overview.ensureFresh(15_000); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const totalsRpc = useRpc(getTotals, [], { refreshOnFocus: true, refreshEveryMs: 60_000 });
  const stock = useRpc(getStock, []);
  const metricsRpc = useRpc(getMetrics, [], { refreshOnFocus: true, refreshEveryMs: 60_000 });
  const metricsBlock = (
    <div className="adm-home__aside">
      <HomeMetrics metrics={metricsRpc.data} failed={Boolean(metricsRpc.error)} onRetry={() => void metricsRpc.reload()} />
    </div>
  );
  // undefined while it loads (labels stay, numbers pulse), null if it couldn't.
  const totals = totalsRpc.data ?? (totalsRpc.error ? null : undefined);
  const kitchen = totals?.kitchen;

  const [sheet, setSheet] = useState<KitchenSheet | null>(null);
  const closeSheet = useCallback(() => setSheet(null), []);
  const { setData: setTotals, reload: reloadTotals } = totalsRpc;
  const reloadOverview = overview.reload;
  // A kitchen change: its kitchen on screen at once, then everything it moved (stages, badge).
  const showKitchen = useCallback((next: Kitchen) => {
    setTotals((t) => (t ? { ...t, kitchen: next } : t));
    void reloadTotals();
    void reloadOverview();
  }, [setTotals, reloadTotals, reloadOverview]);
  const done = useKitchenDone(showKitchen);
  const take = useCallback((productId: string, batchId: string) => setSheet({ kind: 'off', productId, batchId }), []);

  const hour = istHour();
  const part = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  const name = firstName(me.display_name) || me.email.split('@')[0];

  let lede: React.ReactNode = null;
  if (totals) lede = cook ? <CookLede kitchen={totals.kitchen} packing={totals.overall.packing.orders} /> : <AdminLede totals={totals} />;
  else if (totals === undefined) lede = <span className="adm-pulse adm-pulse--lede" aria-hidden="true" />;

  let below: React.ReactNode;
  if (cook) {
    below = (
      <div className="adm-home__grid adm-home__grid--split">
        {kitchen && <LoggedList kitchen={kitchen} onFix={(batch) => setSheet({ kind: 'fix', batch })} />}
        {metricsBlock}
        <Stock stock={stock} />
      </div>
    );
  } else if (!overview.data) {
    below = overview.error ? <LoadError onRetry={() => void overview.reload()} /> : <Skeleton cards={2} rows={3} />;
  } else {
    below = (
      <div className="adm-home__grid adm-home__grid--split">
        <Waiting queue={overview.data.queue} totals={totals} />
        {metricsBlock}
        <Stock stock={stock} />
        <Coupons coupons={overview.data.coupons} />
      </div>
    );
  }

  const nothingToCook = kitchen ? toCook(kitchen).length === 0 : false;
  useLogCookingQuiet(cook && nothingToCook);
  // The header's Log cooking lands here with { logCooking: true }: open the sheet once the
  // kitchen is in, then drop the flag so Back or a reload doesn't open it again.
  const location = useLocation();
  const navigate = useNavigate();
  const askedToLog = cook && (location.state as typeof LOG_COOKING_STATE | null)?.logCooking === true;
  useEffect(() => {
    if (!askedToLog || !kitchen) return;
    setSheet({ kind: 'log' });
    navigate(location.pathname, { replace: true, state: null });
  }, [askedToLog, kitchen, location.key]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="adm-page adm-home">
      <div className="adm-home__top adm-phone-only">
        <Logo className="adm-home__logo" />
        {cook ? (
          <button type="button" className={`adm-btn adm-btn--${nothingToCook ? 'tonal' : 'primary'} adm-btn--sm`} disabled={!kitchen}
            onClick={() => setSheet({ kind: 'log' })}>
            <CookingPot size={18} strokeWidth={1.75} aria-hidden="true" />{kitchenCopy.logCooking}
          </button>
        ) : (
          <AdminLink to="/admin/orders/new" className="adm-btn adm-btn--tonal adm-btn--sm"><Plus size={18} strokeWidth={1.75} aria-hidden="true" />{copy.addOrder}</AdminLink>
        )}
      </div>
      <div>
        <h1 className="adm-title">{copy.greeting(part, name)}</h1>
        <p className="adm-home__date">{formatLongDate()}</p>
        {lede}
        {cook && kitchen && <SpareWarnings kitchen={kitchen} onTake={take} />}
      </div>
      <section className="adm-home__products" aria-labelledby="adm-home-products">
        <div className="adm-home__head adm-home__head--products">
          <h2 id="adm-home-products">{cook ? copy.cards.cookTitle : copy.cards.adminTitle}</h2>
          {!cook && <span>{copy.cards.adminMeta}</span>}
        </div>
        {totals === null
          ? <LoadError onRetry={() => void totalsRpc.reload()} />
          : <ProductCards cook={cook} totals={totals} stock={stock.data} onTake={take} />}
      </section>
      {below}

      {kitchen && sheet?.kind === 'log' && <LogSheet kitchen={kitchen} onClose={closeSheet} onLogged={done} />}
      {kitchen && sheet?.kind === 'fix' && <FixBatchSheet batch={sheet.batch} kitchen={kitchen} onClose={closeSheet} onDone={done} />}
      {kitchen && sheet?.kind === 'off' && (
        <WriteOffSheet kitchen={kitchen} productId={sheet.productId} batchId={sheet.batchId} onClose={closeSheet} onDone={done} />
      )}
    </div>
  );
};

export default HomePage;
