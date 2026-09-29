import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CheckCircle2, ChevronRight, CookingPot, Download, Gift, Plus, Search, X } from 'lucide-react';
import { adminCopy } from '../../data/adminCopy';
import { productsData } from '../../data/products';
import { getOrders } from '../api';
import { useAdminMe } from '../auth';
import { firstName, formatMoney } from '../format';
import { LoadError, Skeleton } from '../parts';
import { AdminLink, usePathPart, useQueryText } from '../router';
import type { Order, OrderPage as Page } from '../types';
import { useOverview } from '../AdminLayout';
import { useRpc, useSettled } from '../useRpc';
import { ExportSheet } from './ExportSheet';
import {
  type Lane, LANES, NEXT, type WorkLane, byKitchenTurn, isPartlyCooked, landingStage, laneOf, namesOneOrder, packsOf, productFilter,
  productName, searchFor, stageFromHash,
} from './model';
import { type CardAction, OrderCard, Thumb } from './OrderCard';
import { OrderPage, OrderPopup } from './OrderView';
import { PaidSheet } from './PaidMethod';
import { FREE_SAMPLES_PATH as SAMPLES_PATH } from './FreeSamplesPage';
import { useOfferOnArrival, usePriorityGive } from './PriorityGive';
import { useOrderChange } from './useOrderChange';
import { usePayments } from './usePayments';
import { useTheme } from '../../context/ThemeContext';

const copy = adminCopy.orders;
const filterCopy = adminCopy.ordersProduct;
const stages = adminCopy.orderStages;
/** Lane B's Free samples page. */
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

/** One stage's name, count and line: the laptop board's lane head, and the phone's stacked search hits. */
const LaneBlock: React.FC<{ lane: Lane; count: number; money?: number; hint?: string; children: React.ReactNode }> = ({
  lane, count, money, hint, children,
}) => {
  const title = lane === 'done' ? copy.doneLink : stages.names[lane];
  return (
    <section className={`adm-lane adm-lane--${lane}`} id={`lane-${lane}`} aria-labelledby={`lane-${lane}-t`}>
      <div className="adm-lane__head">
        <h2 id={`lane-${lane}-t`}>{title}</h2>
        <span className="adm-count">{lane === 'collect' && money ? formatMoney(money) : count}</span>
      </div>
      {hint && <p className="adm-lane__hint">{hint}</p>}
      {children}
    </section>
  );
};

/**
 * Phone and tablet: Cooking · Packing · Ready · ₹ To collect. Native radios (arrow keys move
 * between them), a white thumb that slides to the picked one, the count inside each.
 * Cooking's count is grey: it isn't Sunit's job. Sticks to the top on scroll.
 */
const StageSwitch: React.FC<{ stage: WorkLane; counts: Record<WorkLane, number>; money: number; onPick: (s: WorkLane) => void }> = ({
  stage, counts, money, onPick,
}) => (
  <div className="adm-stages">
    <fieldset className="adm-stages__seg">
      <legend className="visually-hidden">{stages.switchLabel}</legend>
      {LANES.map((s) => {
        const showMoney = s === 'collect' && money > 0;
        return (
          <label key={s}>
            <input type="radio" name="adm-stage" checked={s === stage} onChange={() => onPick(s)}
              aria-label={`${stages.names[s]}, ${showMoney ? stages.moneyLabel(formatMoney(money)) : stages.countLabel(counts[s])}`} />
            <span className={showMoney ? 'is-money' : s === 'cooking' ? 'is-quiet' : undefined} aria-hidden="true">
              {/* Keyed by the number, so a change ticks in. */}
              <b key={showMoney ? money : counts[s]}>{showMoney ? formatMoney(money) : counts[s]}</b>
              <small>{stages.names[s]}</small>
            </span>
          </label>
        );
      })}
    </fieldset>
  </div>
);

/** Done and Free samples, a quiet pair under every stage. Free samples is lane B's page. */
const MoreLinks: React.FC<{ done?: number; samples?: number }> = ({ done, samples }) => (
  <nav className="adm-stagelinks adm-phone-only" aria-label={`${stages.doneLink}, ${stages.samplesLink}`}>
    <AdminLink to="/admin/orders/done"><CheckCircle2 size={18} aria-hidden="true" />{stages.doneLink}{done != null && <span>{done}</span>}</AdminLink>
    <AdminLink to={SAMPLES_PATH}><Gift size={18} aria-hidden="true" />{stages.samplesLink}{samples != null && <span>{samples}</span>}</AdminLink>
  </nav>
);

/** Packing's last row: what's coming from the kitchen. A tap switches to Cooking. */
const NextFromKitchen: React.FC<{ cooking: Order[]; onOpen: () => void }> = ({ cooking, onOpen }) => {
  const nearly = cooking.find(isPartlyCooked);
  return (
    <button type="button" className="adm-kitchennext" onClick={onOpen}>
      <span className="adm-kitchennext__icon"><CookingPot size={18} aria-hidden="true" /></span>
      <span><b>{stages.nextTitle}</b><small>{stages.nextSub(cooking.length, nearly ? firstName(nearly.name) || nearly.code : null)}</small></span>
      <ChevronRight size={20} aria-hidden="true" />
    </button>
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

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
/** How long a card that left its stage takes to fold away (orders.css, .is-leaving). */
const LEAVE_MS = 260;

/**
 * Orders (spec 2.5, O1). Phone and tablet: one stage at a time under a sticky switcher;
 * /admin/orders/:code is its own page. Laptop: the four-lane board, with /admin/orders/:code
 * as a popup over it. A search shows its hits from every stage (and Done) at once.
 */
const OrdersPage: React.FC<{ behind?: boolean }> = ({ behind = false }) => {
  // `behind`: drawn under the Add/Edit form on the laptop, so the path isn't an order code.
  const path = usePathPart(1);
  const code = behind ? '' : path;
  const location = useLocation();
  const navigate = useNavigate();
  const laptop = useLaptop();
  const cook = useAdminMe().home_view === 'cook';
  const overview = useOverview().data;
  const doneCounts = overview?.done;
  const doneTotal = doneCounts && doneCounts.delivered_paid + doneCounts.free_samples + doneCounts.cancelled;
  // Orders with samples on their way plus the ones sent this month (the overview has no all-time count).
  const samplesQueue = overview?.queue.free_samples;
  // The same set the Free samples list shows: every order carrying a sample, not cancelled.
  const samplesCount = samplesQueue?.total;
  const query = new URLSearchParams(location.search);
  const q = query.get('q') ?? '';
  // ?product=raggi-jaggi (a Home product card): only orders with it. An id we don't sell is ignored.
  const product = productFilter(query.get('product'));
  const [searching, setSearching] = useState(false);
  const [paying, setPaying] = useState<Order | null>(null);
  const [exporting, setExporting] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null); // clearing the filter moves focus here

  // Each answer says which filter it's for, so clearing the chip never shows the last filter's cards.
  const list = useRpc(
    (): Promise<Page & { for: string | null }> => getOrders({ view: 'todo', limit: 1000, product: product ?? undefined }).then((page) => ({ ...page, for: product })),
    [product],
    { refreshOnFocus: true },
  );
  const board = list.data?.for === product ? list.data : null;
  // A card that changes lane flashes where it lands.
  // Also the order just saved from the Add/Edit form (navigation state).
  const [flash, setFlash] = useState<string | null>(() => (location.state as { flash?: string } | null)?.flash ?? null);
  // A card that just left its stage stays there a beat, as it was, while it folds away.
  const [leaving, setLeaving] = useState<Record<string, Order>>({});
  const put = useCallback((o: Order) => list.setData((d) => {
    if (!d) return d;
    const before = d.orders.find((x) => x.id === o.id);
    if (before && laneOf(before) !== laneOf(o)) {
      setFlash(o.id);
      setLeaving((l) => ({ ...l, [o.id]: before }));
      window.setTimeout(() => setLeaving(({ [o.id]: _, ...rest }) => rest), reducedMotion() ? 0 : LEAVE_MS);
    }
    return { ...d, orders: d.orders.map((x) => (x.id === o.id ? o : x)) };
  }), [list.setData]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!flash || !board) return; // wait until the cards are on screen
    const timer = setTimeout(() => setFlash(null), 900);
    return () => clearTimeout(timer);
  }, [flash, board]);
  const drop = (o: Order) => list.setData((d) => d && { ...d, orders: d.orders.filter((x) => x.id !== o.id) });
  // A move that changed the kitchen can move other orders too (cancelled food fills the next one).
  const change = useOrderChange(put, list.reload);
  // A new priority order from Add order lands here and may be offered packed food.
  // With an order open (phone page or laptop popup), that view asks instead.
  const give = usePriorityGive(list.reload);
  useOfferOnArrival(give.offer, !code);
  const payments = usePayments(put);

  // Search also looks through Done, and an empty board asks whether anything was ever done.
  const settledQ = useSettled(q.trim());
  const empty = board?.orders.length === 0;
  // Which search (and product) Done's answer is for, so a new search never reads the last one's hits.
  const doneKey = `${product ?? ''}|${settledQ}`;
  const doneFor = useRef<string | null>(null);
  const done = useRpc(
    () => (settledQ || empty
      ? getOrders({ view: 'done', search: settledQ || undefined, product: product ?? undefined, limit: settledQ ? 20 : 1 })
        .then((page) => { doneFor.current = doneKey; return page; })
      : Promise.resolve(null)),
    [settledQ, empty, product],
  );

  const orders = board?.orders ?? [];
  const shown = q.trim() ? orders.filter((o) => matches(o, q)) : orders;
  // `by`: where each order is now (counts, the popup's sequence). `drawn`: what each stage
  // draws, with a card that just left still in its old place until it has folded away.
  const by: Record<Lane, Order[]> = { cooking: [], packing: [], ready: [], collect: [], done: [] };
  const drawn: Record<Lane, Order[]> = { cooking: [], packing: [], ready: [], collect: [], done: [] };
  const folding = new Set<string>();
  shown.forEach((o) => {
    by[laneOf(o)].push(o);
    const was = leaving[o.id];
    // An Undo inside the fold brings it straight back: then it's just itself again.
    if (was && laneOf(was) !== laneOf(o)) {
      folding.add(o.id);
      drawn[laneOf(was)].push(was);
    } else drawn[laneOf(o)].push(o);
  });
  // Cooking in the kitchen's turn: priority first, then oldest first.
  by.cooking = byKitchenTurn(by.cooking);
  drawn.cooking = byKitchenTurn(drawn.cooking);
  // What's still owed, not the totals quoted: part payments are already in.
  const money = by.collect.reduce((sum, o) => sum + (o.amount_due ?? 0), 0);
  const sequence = [...by.cooking, ...by.packing, ...by.ready, ...by.collect, ...by.done];
  const counts = Object.fromEntries(LANES.map((l) => [l, by[l].length])) as Record<WorkLane, number>;

  // The phone's stage: the link's #stage, else where this person lands (worked out once the
  // orders are in, then kept in the link so a card moving on never switches the stage).
  const linked = stageFromHash(location.hash);
  const stage = linked ?? landingStage(counts, cook);
  const oneStage = !laptop && !q;
  const stageLink = (s: WorkLane) => `${location.pathname}${location.search}#${s}`;
  useEffect(() => {
    if (oneStage && board && !linked && !code) navigate(stageLink(stage), { replace: true });
  }, [oneStage, !!board, linked, code]); // eslint-disable-line react-hooks/exhaustive-deps
  // Stage content slides in from the side tapped toward.
  const [slide, setSlide] = useState<'from-left' | 'from-right' | null>(null);
  const pick = (s: WorkLane) => {
    if (s === stage) return;
    setSlide(LANES.indexOf(s) > LANES.indexOf(stage) ? 'from-right' : 'from-left');
    navigate(stageLink(s), { replace: true });
  };

  const [findText, setFindText] = useQueryText('/admin/orders');

  // A search for a whole code or phone with exactly one hit (board or Done)
  // opens that order. Once per search, so closing it leaves you on the results.
  const opened = useRef('');
  const oneHit = settledQ && settledQ === q.trim() && board && !done.loading && doneFor.current === doneKey && namesOneOrder(settledQ)
    ? [...shown, ...(done.data?.orders ?? [])] : [];
  const only = oneHit.length === 1 && !code ? oneHit[0].code : '';
  useEffect(() => {
    if (!settledQ) opened.current = ''; // a cleared search can open the same order again
    if (!only || opened.current === settledQ) return;
    opened.current = settledQ;
    navigate(`/admin/orders/${only}${location.search}`);
  }, [only, settledQ]); // eslint-disable-line react-hooks/exhaustive-deps

  const onAction = (o: Order, action: CardAction) => {
    const lane = laneOf(o);
    if (action === 'next' && lane === 'collect') setPaying(o); // Mark paid: how did they pay?
    else if (action === 'next' && (lane === 'packing' || lane === 'ready')) void change(o, NEXT[lane]);
    else if (action === 'paid') {
      if (o.paid) void payments.markNotPaid(o);
      else setPaying(o);
    }
  };

  // Phone: one order is its own page.
  if (code && !laptop) return <OrderPage code={code} />;

  // On a phone the card's link carries the stage, so the order page's back link returns to it.
  const cardSearch = oneStage ? `${location.search}#${stage}` : location.search;
  const card = (o: Order, lane?: Lane) => {
    const gone = !!lane && folding.has(o.id);
    return (
      <OrderCard key={o.id} order={o} onAction={onAction} selected={o.code === code} mark={q} flash={o.id === flash && !gone}
        product={product} search={cardSearch} light={!q} leaving={gone} />
    );
  };
  const doneHits = settledQ && doneFor.current === doneKey ? done.data?.orders ?? [] : [];
  // The chip: which product, and how many cards the board draws for it (the four lanes; the list
  // can briefly hold a card that just went to Done, which the board no longer shows). Then Packing's line.
  const filter = product && {
    id: product,
    name: productName(product),
    count: orders.filter((o) => laneOf(o) !== 'done').length,
    clear: (() => {
      const rest = new URLSearchParams(location.search);
      rest.delete('product');
      const kept = rest.toString();
      return `/admin/orders${kept ? `?${kept}` : ''}${location.hash}`;
    })(),
  };
  const pack = product ? packsOf(by.packing, product) : null;
  const packHint = pack?.packs ? filterCopy.pack(pack.packs, productName(product!), pack.sizes) : undefined;
  const hintOf = (lane: WorkLane) => (lane === 'packing' && packHint) || stages.hints[lane];
  const summary = [
    by.packing.length > 0 && ['packing', `${by.packing.length} ${copy.toPack}`],
    by.ready.length > 0 && ['ready', `${by.ready.length} ${copy.toDropOff}`],
    by.collect.length > 0 && ['collect', copy.toCollect(money ? formatMoney(money) : String(by.collect.length))],
  ].filter(Boolean) as [Lane, string][];

  /** A stage's cards, or its calm empty line. Packing ends with what's next from the kitchen (phone). */
  const stageCards = (lane: WorkLane) => (
    <>
      {drawn[lane].length > 0
        ? drawn[lane].map((o) => card(o, lane))
        : <p className="adm-lane__empty">{lane === 'packing' && !by.cooking.length ? stages.empty.packingAll : stages.empty[lane]}</p>}
      {lane === 'packing' && oneStage && by.cooking.length > 0 && <NextFromKitchen cooking={by.cooking} onOpen={() => pick('cooking')} />}
    </>
  );

  return (
    <div className="adm-page adm-orders">
      <div className="adm-orders__top">
        <div>
          <h1 className="adm-title" ref={titleRef} tabIndex={-1}>{copy.title}</h1>
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
          <AdminLink className="adm-btn adm-btn--quiet adm-btn--sm adm-laptop-only" to={SAMPLES_PATH}><Gift size={16} aria-hidden="true" />{samplesCount != null ? stages.samplesCount(samplesCount) : stages.samplesLink}</AdminLink>
          <AdminLink className="adm-btn adm-btn--quiet adm-btn--sm adm-laptop-only" to="/admin/orders/done"><CheckCircle2 size={16} aria-hidden="true" />{doneTotal != null ? copy.doneCount(doneTotal) : copy.doneLink}</AdminLink>
          <button type="button" className="adm-btn adm-btn--quiet adm-btn--sm adm-laptop-only" onClick={() => setExporting(true)}>
            <Download size={16} aria-hidden="true" />{copy.exportCsv}
          </button>
        </div>
      </div>

      {(searching || q) && (
        <div className="adm-orders__find adm-phone-only" role="search">
          <input className="adm-input" type="search" autoFocus value={findText} placeholder={copy.findPlaceholder}
            aria-label={copy.find} onChange={(e) => setFindText(searchFor(e.target.value))} />
          <button type="button" className="adm-btn adm-btn--quiet adm-btn--sm" onClick={() => { setFindText(''); setSearching(false); }}>{copy.cancelFind}</button>
        </div>
      )}

      {filter && (
        <div className="adm-filter">
          <AdminLink className="adm-filter__chip" to={filter.clear} aria-label={filterCopy.clear(filter.name)}
            onClick={() => requestAnimationFrame(() => titleRef.current?.focus())}>
            <Thumb id={filter.id} /><span>{filter.name}</span><X size={16} aria-hidden="true" />
          </AdminLink>
          {board && <span className="adm-filter__text">{filterCopy.count(filter.count, filter.name)}</span>}
        </div>
      )}

      {list.error && !board && <LoadError onRetry={list.reload} />}
      {list.loading && !board && !list.error && <Skeleton />}
      {/* Filtered to a product, an empty board keeps its stages: "0 orders with …" says the rest. */}
      {empty && !q && !product && !done.loading && <Empty first={!done.data?.orders.length} />}

      {board && (!empty || product) && oneStage && (
        <>
          <StageSwitch stage={stage} counts={counts} money={money} onPick={pick} />
          <section key={stage} className={`adm-stage${slide ? ` is-${slide}` : ''}`} aria-label={stages.names[stage]}>
            <p className="adm-stage__hint">{hintOf(stage)}</p>
            {stageCards(stage)}
          </section>
        </>
      )}

      {board && (!empty || product) && !oneStage && (
        <div className={`adm-board${q ? ' is-found' : ''}`}>
          {/* While searching, a lane with no hits says nothing. */}
          {LANES.map((lane) => (!q || by[lane].length > 0) && (
            <LaneBlock key={lane} lane={lane} count={by[lane].length} money={money} hint={hintOf(lane)}>
              {q ? by[lane].map((o) => card(o)) : stageCards(lane)}
            </LaneBlock>
          ))}
        </div>
      )}

      {doneHits.length > 0 && (
        <LaneBlock lane="done" count={doneHits.length}>
          {doneHits.map((o) => card(o))}
        </LaneBlock>
      )}
      {q.trim() && board && shown.length === 0 && settledQ && !done.loading && doneHits.length === 0 && (
        <div className="adm-card adm-stack">
          <p>{copy.empty.noMatch(q.trim())}</p>
          <AdminLink className="adm-btn adm-btn--tonal adm-btn--sm" to={`/admin/orders/new?code=${encodeURIComponent(q.trim())}`}>{copy.empty.addByHand}</AdminLink>
        </div>
      )}

      {!q && board && <MoreLinks done={doneTotal} samples={samplesCount} />}

      {laptop && code && (
        <OrderPopup key="popup" code={code} sequence={sequence} putInList={put} onDeleted={drop} onKitchen={list.reload}
          onClose={() => {
            navigate(`/admin/orders${location.search}`);
            // The card may have moved lanes while the popup was open, so find it again.
            requestAnimationFrame(() => document.querySelector<HTMLElement>(`.adm-ocard__open[href="/admin/orders/${code}${location.search}"]`)?.focus());
          }} />
      )}
      <PaidSheet order={paying} onClose={() => setPaying(null)} onPick={(o, how) => void payments.payTheRest(o, how)} />
      {give.popup}
      <ExportSheet isOpen={exporting} onClose={() => setExporting(false)} product={product} />
    </div>
  );
};

export default OrdersPage;
