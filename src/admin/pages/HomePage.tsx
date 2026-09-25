import React, { useEffect, useRef } from 'react';
import { ChevronRight, IndianRupee, Plus } from 'lucide-react';
import { OrderThumb } from '../../components/order/OrderThumb';
import { adminCopy } from '../../data/adminCopy';
import { productsData } from '../../data/products';
import { useOverview } from '../AdminLayout';
import { getStock, setStock } from '../api';
import { useAdminMe } from '../auth';
import { firstName, formatDay, formatDayInSentence, formatLongDate, formatMoney, formatTime, istDateValue, istHour } from '../format';
import { LoadError, Skeleton } from '../parts';
import { AdminLink } from '../router';
import { Logo } from '../Splash';
import type { OutOfStock, Overview } from '../types';
import { useRpc } from '../useRpc';
import { useUndoable } from '../useUndoable';

const copy = adminCopy.homePage;

// Home (spec 2.4): what's waiting, this week, what's selling, stock, coupons.
// The overview is the one the layout already loads for the Orders badge.

/** "today, 8:40 am", "yesterday, 9:10 pm", else "Wed 23 Sep". */
const whenIn = (iso: string) => {
  const day = formatDayInSentence(iso);
  return day === adminCopy.dates.today || day === adminCopy.dates.yesterday.toLowerCase() ? `${day}, ${formatTime(iso)}` : day;
};

const Row: React.FC<{ lane: string; circle: React.ReactNode; tone?: 'accent' | 'money'; title: string; hint: string }> = ({
  lane, circle, tone, title, hint,
}) => (
  <AdminLink to={`/admin/orders#lane-${lane}`} className="adm-home__row">
    <span className={`adm-home__circle${tone ? ` is-${tone}` : ''}`}>{circle}</span>
    <span className="adm-list__main"><span className="adm-list__title">{title}</span><span className="adm-list__sub">{hint}</span></span>
    <ChevronRight className="adm-list__end" size={20} aria-hidden="true" />
  </AdminLink>
);

const Waiting: React.FC<{ queue: Overview['queue'] }> = ({ queue: q }) => {
  const collect = q.to_collect;
  const rows = [
    q.to_confirm > 0 && <Row key="c" lane="confirm" circle={q.to_confirm} tone="accent" title={copy.toConfirm}
      hint={q.to_confirm_oldest ? copy.oldestFrom(whenIn(q.to_confirm_oldest)) : ''} />,
    q.to_send.count > 0 && <Row key="s" lane="send" circle={q.to_send.count} title={copy.toSend}
      hint={copy.paidSplit(q.to_send.paid, q.to_send.count - q.to_send.paid)} />,
    collect.count > 0 && <Row key="m" lane="collect" circle={<IndianRupee size={18} aria-hidden="true" />} tone="money"
      title={collect.amount > 0 ? copy.toCollect(formatMoney(collect.amount)) : copy.ordersToCollect(collect.count)}
      hint={(collect.people ?? 1) > 1 || !collect.oldest ? copy.fromPeople(collect.people ?? collect.count)
        : copy.deliveredBy(collect.oldest.name ?? collect.oldest.code, formatDayInSentence(collect.oldest.since))} />,
    q.on_the_way.count > 0 && <Row key="w" lane="way" circle={q.on_the_way.count} title={copy.onTheWay}
      hint={q.on_the_way.not_paid ? copy.notPaidYet(q.on_the_way.not_paid) : copy.allPaid} />,
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

const Week: React.FC<{ week: Overview['week'] }> = ({ week }) => {
  const today = istDateValue();
  const days = week.days;
  const max = Math.max(1, ...days.map((d) => d.orders));
  const end = days[days.length - 1]?.date ?? week.starts_on;
  const [from, to] = [formatDay(`${week.starts_on}T12:00:00+05:30`), formatDay(`${end}T12:00:00+05:30`)];
  // "Mon 21 to Sun 27 Sep": the month once when both days share it.
  const sameMonth = from.split(' ').slice(2).join(' ') === to.split(' ').slice(2).join(' ');
  const opened = copy.openedOn >= week.starts_on && copy.openedOn <= end;
  return (
    <section className="adm-card adm-home__card" aria-labelledby="adm-home-week">
      <div className="adm-home__head">
        <h2 id="adm-home-week">{copy.week}</h2>
        <span>{copy.weekRange(sameMonth ? from.split(' ').slice(0, 2).join(' ') : from, to)}</span>
      </div>
      <p className="adm-home__sentence">
        <strong>{copy.weekOrders(week.orders)}</strong> and <strong>{copy.weekPacks(week.packs)}</strong> {copy.weekSince}
        {opened && ` ${copy.firstWeek(formatLongDate(`${copy.openedOn}T12:00:00+05:30`).split(',')[0])}`}
      </p>
      <ol className="adm-bars" aria-label={copy.week}>
        {days.map((d, i) => {
          const state = d.date === today ? 'is-today' : d.date > today ? 'is-future' : d.orders ? '' : 'is-empty';
          return (
            <li key={d.date} className={state} aria-label={`${formatDay(`${d.date}T12:00:00+05:30`)}: ${copy.weekOrders(d.orders)}`}>
              <span className="adm-bars__n" aria-hidden="true">{d.orders || ''}</span>
              <span className="adm-bars__bar" style={{ '--h': `${(d.orders / max) * 100}%` } as React.CSSProperties} aria-hidden="true" />
              <span className="adm-bars__day" aria-hidden="true">{copy.dayLetters[i]}</span>
            </li>
          );
        })}
      </ol>
      <p className="adm-home__foot">{copy.weekFoot(week.delivered, week.cancelled, week.repeat_customers).map((t) => <span key={t}>{t}</span>)}</p>
    </section>
  );
};

const Selling: React.FC<{ selling: Overview['selling'] }> = ({ selling }) => {
  const rows = productsData
    .map((product) => {
      const sizes = product.weightOptions
        .map((size) => ({ size, packs: selling.find((s) => s.product_id === product.id && s.size === size)?.packs ?? 0 }))
        .filter((s) => s.packs > 0);
      return { product, sizes, total: sizes.reduce((sum, s) => sum + s.packs, 0) };
    })
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total);
  const max = Math.max(1, ...rows.map((r) => r.total));
  return (
    <section className="adm-card adm-home__card" aria-labelledby="adm-home-selling">
      <div className="adm-home__head">
        <h2 id="adm-home-selling">{copy.selling}</h2>
        <span>{copy.last30}</span>
      </div>
      {rows.length === 0 && <p className="adm-home__quiet">{copy.nothingSold}</p>}
      {rows.map(({ product, sizes, total }) => (
        <div key={product.id} className="adm-home__sell">
          <OrderThumb product={product} className="adm-home__thumb" />
          <span className="adm-list__main">
            <b className="adm-pname">{product.name}</b>
            <small>{copy.sizes(sizes.map((s) => copy.sizeCount(s.size, s.packs)))}</small>
            <span className="adm-home__split" aria-hidden="true">
              {sizes.map((s) => <i key={s.size} style={{ '--w': `${(s.packs / max) * 100}%` } as React.CSSProperties} />)}
            </span>
          </span>
          <span className="adm-home__total"><b>{total}</b>{total === 1 ? copy.pack : copy.packs}</span>
        </div>
      ))}
    </section>
  );
};

/** Only when something is out: one row per product (or per size when only one size is out), each with Back in stock. */
const Stock: React.FC = () => {
  const { data, setData } = useRpc(getStock, []);
  const run = useUndoable();
  const { reload } = useOverview();
  const stockRef = useRef<OutOfStock | null>(data);
  stockRef.current = data;
  const show = (list: OutOfStock) => { stockRef.current = list; setData(list); };

  const out = productsData.flatMap((product) => {
    const sizes = product.weightOptions.filter((size) => data?.some((r) => r.product_id === product.id && r.size === size));
    if (!sizes.length) return [];
    return sizes.length === product.weightOptions.length
      ? [{ product, sizes, item: product.name }]
      : sizes.map((size) => ({ product, sizes: [size], item: `${product.name} ${size}` }));
  });
  if (!out.length) return null;

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
        <h2 id="adm-home-stock">{copy.stock}</h2>
        <AdminLink to="/admin/products" className="adm-text-btn">{copy.products}</AdminLink>
      </div>
      {out.map(({ product, sizes, item }) => (
        <div key={item} className="adm-home__stock">
          <OrderThumb product={product} className="adm-home__thumb" />
          <span className="adm-list__main">
            <span className="adm-list__title">{copy.outOfStock(item)}</span>
            <span className="adm-list__sub">{copy.showsBackSoon}</span>
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

const HomePage: React.FC = () => {
  const me = useAdminMe();
  const { data, error, reload } = useOverview();
  // The layout's overview may be a few minutes old; Home shows it fresh.
  useEffect(() => { void reload(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const hour = istHour();
  const part = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  const name = firstName(me.display_name) || me.email.split('@')[0];

  let body: React.ReactNode;
  if (!data) body = error ? <LoadError onRetry={() => void reload()} /> : <Skeleton cards={3} rows={3} />;
  else {
    body = (
      <div className="adm-home__grid">
        <div className="adm-home__col"><Waiting queue={data.queue} /><Week week={data.week} /></div>
        <div className="adm-home__col"><Selling selling={data.selling} /><Stock /><Coupons coupons={data.coupons} /></div>
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
      </div>
      {body}
    </div>
  );
};

export default HomePage;
