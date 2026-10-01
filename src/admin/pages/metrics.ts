import { adminCopy } from '../../data/adminCopy';
import { productsData } from '../../data/products';
import { formatDay, formatMoney, formatMoneyAxis, formatMoneyShort, formatTime, formatWeight, istDateValue } from '../format';
import type { Product } from '../../types/product';
import type { Metrics, MetricsBucket, MetricsPeriod, MetricsPeriodKey, MetricsTotals } from '../types';

// "How it's going", the maths and words behind Home's metrics block (HomeMetrics.tsx,
// temp/home-metrics/design.md "Final: B"). The numbers come from get_admin_metrics();
// everything here only reads them: change %, the sentence, the no-comparison line, the
// chart's scale, bars and running totals. Pure, so it's tested without a browser.

const copy = adminCopy.homePage.metrics;

/** Profit is an estimate: this share of sales. The one place the number lives; the label reads it. */
export const PROFIT_SHARE = 0.25;
export const profitLabel = () => copy.profit(Math.round(PROFIT_SHARE * 100));

export const PERIOD_KEYS: readonly MetricsPeriodKey[] = ['today', 'week', 'month', 'year', 'lifetime'];
export type ComparableKey = Exclude<MetricsPeriodKey, 'lifetime'>;

export type MetricKey = 'sales' | 'came_in' | 'orders' | 'packs';
export const METRIC_KEYS: readonly MetricKey[] = ['sales', 'came_in', 'orders', 'packs'];
export const isMoney = (metric: MetricKey) => metric === 'sales' || metric === 'came_in';

export const totalOf = (t: MetricsTotals, metric: MetricKey): number => (metric === 'came_in' ? t.came_in.amount : t[metric]);
const bucketOf = (b: MetricsBucket, metric: MetricKey): number => b[metric];

/** A figure as it reads: "₹1,190", "1,254". */
export const showValue = (metric: MetricKey, n: number) => (isMoney(metric) ? formatMoney(n) : n.toLocaleString('en-IN'));
/** A chip's figure: lakhs from ₹10,00,000, so it fits. Pair with showValue for its name. */
export const chipValue = (metric: MetricKey, n: number) => (isMoney(metric) && n >= 1_000_000 ? formatMoneyShort(n) : showValue(metric, n));
const axisValue = (metric: MetricKey, n: number) => (isMoney(metric) ? formatMoneyAxis(n) : n.toLocaleString('en-IN'));

export const profit = (sales: number) => Math.round(sales * PROFIT_SHARE);
/** null when no order has a total (then Avg order hides). */
export const avgOrder = (t: MetricsTotals): number | null => (t.with_total ? Math.round(t.sales / t.with_total) : null);

// ---- Change -------------------------------------------------------------------------------

/**
 * The contract's helper, as kinds. pct is whole and never ∞: before 0 is "new", both 0 is
 * "both-zero", now 0 is "none-yet". big: 100% or more, when the % alone would mislead, so
 * the before number is said too. pct can be 0 for a tiny move ("under 1%").
 */
export type Change =
  | { kind: 'up' | 'down'; pct: number; big: boolean }
  | { kind: 'same' | 'new' | 'both-zero' | 'none-yet' };

/** null: no comparison for this period. */
export const changeOf = (now: number, before: number | null): Change | null => {
  if (before === null) return null;
  if (now === before) return { kind: now === 0 ? 'both-zero' : 'same' };
  if (before === 0) return { kind: 'new' };
  if (now === 0) return { kind: 'none-yet' };
  const pct = Math.round((Math.abs(now - before) / before) * 100);
  return { kind: now > before ? 'up' : 'down', pct, big: pct >= 100 };
};

export interface ChangeLine { text: string; icon: 'up' | 'down' | null; up: boolean }

/** Under the sentence: "Down 18% vs this time yesterday". It's green only when up. */
export const changeLine = (key: ComparableKey, metric: MetricKey, change: Change, before: number): ChangeLine => {
  switch (change.kind) {
    case 'up':
    case 'down': {
      const words = (change.kind === 'up' ? copy.up : copy.down)(change.pct, copy.vs[key]);
      return { text: change.big ? `${words} ${copy.from(showValue(metric, before))}` : words, icon: change.kind, up: change.kind === 'up' };
    }
    case 'same': return { text: copy.same(copy.by[key]), icon: null, up: false };
    case 'new': return { text: copy.fresh(copy.by[key]), icon: 'up', up: true };
    case 'both-zero': return { text: copy.bothZero(copy.by[key]), icon: null, up: false };
    case 'none-yet': return { text: copy.noneYet(copy.before[key], showValue(metric, before)), icon: null, up: false };
  }
};

export interface ChipChange { icon: 'up' | 'down' | null; text: string; from: string | null; spoken: string }

/** A chip's change, always grey: "↓ 18%", with "from ₹3,650" on its own line at 100% or more. null: nothing to say. */
export const chipChange = (key: ComparableKey, metric: MetricKey, change: Change, before: number): ChipChange | null => {
  const was = showValue(metric, before);
  switch (change.kind) {
    case 'up':
    case 'down': {
      const from = change.big ? was : null;
      const spoken = (change.kind === 'up' ? copy.spokenUp : copy.spokenDown)(change.pct, copy.vs[key], from);
      return { icon: change.kind, text: copy.pct(change.pct), from: from && copy.chipFrom(from), spoken };
    }
    case 'same': return { icon: null, text: copy.chipSame, from: null, spoken: copy.spokenSame(copy.by[key]) };
    case 'new': return { icon: 'up', text: copy.chipNew, from: null, spoken: copy.spokenNew(copy.by[key]) };
    case 'none-yet': return { icon: null, text: copy.chipNoneYet(copy.beforeLower[key], was), from: null, spoken: copy.spokenNoneYet(copy.before[key], was) };
    case 'both-zero': return null;
  }
};

// ---- Dates, as India calendar days ("2026-10-22") -------------------------------------------

const DAY_MS = 86_400_000;
const utcOf = (date: string) => Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
const dateOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const addDays = (date: string, n: number) => dateOf(utcOf(date) + n * DAY_MS);
const mondayOf = (date: string) => addDays(date, -((new Date(utcOf(date)).getUTCDay() + 6) % 7));
/** The 1st of the month n months after date's. */
const addMonths = (date: string, n: number) => dateOf(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1 + n, 1));
const monthName = (date: string, month: 'short' | 'long') =>
  new Intl.DateTimeFormat('en-US', { month, timeZone: 'UTC' }).format(utcOf(date));
const atNoon = (date: string) => `${date}T12:00:00+05:30`;
/** "23 Sep", with the year when it isn't nowYear's: "23 Sep 2025". */
const dayMonth = (date: string, nowYear: string) =>
  `${Number(date.slice(8, 10))} ${monthName(date, 'short')}${date.slice(0, 4) === nowYear ? '' : ` ${date.slice(0, 4)}`}`;

/** The clock in India at `iso`: hour 0–23 and minute. India has no summer time. */
export const istClock = (iso: string) => {
  const d = new Date(Date.parse(iso) + 5.5 * 3_600_000);
  return { hour: d.getUTCHours(), minute: d.getUTCMinutes() };
};

// ---- The words over and under the figure -------------------------------------------------

/** "Thu 22 Oct, until 4:10 pm", "Mon 19 Oct – Thu 22 Oct", "1 – 22 Oct", "2026 so far", "Since Wed 23 Sep 2026". */
export const rangeLine = (key: MetricsPeriodKey, m: Metrics): string => {
  const now = Date.parse(m.as_of);
  const today = istDateValue(m.as_of);
  switch (key) {
    case 'today': return copy.untilTime(formatDay(m.as_of, now), formatTime(m.as_of));
    case 'week': {
      const monday = mondayOf(today);
      return monday === today ? formatDay(m.as_of, now) : copy.range(formatDay(atNoon(monday), now), formatDay(m.as_of, now));
    }
    case 'month': {
      const day = Number(today.slice(8, 10));
      const month = monthName(today, 'short');
      return day === 1 ? `1 ${month}` : `${copy.range('1', String(day))} ${month}`;
    }
    case 'year': return copy.yearSoFar(today.slice(0, 4));
    // "now" at 0 makes formatDay always add the year.
    case 'lifetime': return m.first_order_at ? copy.since(formatDay(m.first_order_at, 0)) : copy.noOrdersYet;
  }
};

/**
 * The quiet line said once when a period doesn't compare (and always on Lifetime), or null.
 * Comparisons start once the business existed for a whole previous period (contract, "No
 * comparison"), so the date is worked out from first_order_at: today + 2 days from the first
 * day, two Mondays on, the 1st two months on, 1 January two years on.
 */
export const noCompareLine = (key: MetricsPeriodKey, m: Metrics): string | null => {
  const period = m.periods[key];
  const first = m.first_order_at;
  const nowYear = istDateValue(m.as_of).slice(0, 4);
  if (key === 'lifetime') return first ? copy.lifetimeSince(dayMonth(istDateValue(first), nowYear)) : copy.lifetimeEmpty;
  if (period.previous) return null;
  // With no orders yet, the first one could be now.
  const firstDay = istDateValue(first ?? m.as_of);
  const inThis = !first || !period.starts_at || Date.parse(first) >= Date.parse(period.starts_at);
  const today = istDateValue(m.as_of);
  switch (key) {
    case 'today': return inThis ? copy.firstDay : copy.firstFullDay;
    case 'week': {
      const start = addDays(mondayOf(firstDay), 14);
      const when = start === addDays(mondayOf(today), 7) ? copy.monday : formatDay(atNoon(start), Date.parse(m.as_of));
      return inThis ? copy.firstWeek(when) : copy.firstFullWeek(when);
    }
    case 'month': {
      const when = dayMonth(addMonths(firstDay, 2), nowYear);
      return inThis ? copy.firstMonth(when) : copy.firstFullMonth(when);
    }
    case 'year': return inThis ? copy.sameAsLifetime : copy.firstFullYear(dayMonth(`${Number(firstDay.slice(0, 4)) + 2}-01-01`, nowYear));
  }
};

export interface Sentence { figure: string; rest: string; money: boolean; none: boolean }

/** "₹1,190" + "in sales today"; "No sales" + "yet today". Came in at 0 still says "₹0 came in today". */
export const sentence = (key: MetricsPeriodKey, metric: MetricKey, t: MetricsTotals): Sentence => {
  const n = totalOf(t, metric);
  const when = copy.when[key];
  if (metric === 'came_in') return { figure: formatMoney(n), rest: `${copy.moneyWords.came_in} ${when}`, money: true, none: false };
  if (n === 0) return { figure: copy.none[metric], rest: `${copy.yet} ${when}`, money: false, none: true };
  if (metric === 'sales') return { figure: formatMoney(n), rest: `${copy.moneyWords.sales} ${when}`, money: true, none: false };
  return { figure: copy.count(n, metric), rest: when, money: false, none: false };
};

/** "₹2,440" + "in sales", "3" + "orders": a figure and its words, for the readout. */
export const figureParts = (metric: MetricKey, n: number): { figure: string; words: string } =>
  (metric === 'orders' || metric === 'packs'
    ? { figure: n.toLocaleString('en-IN'), words: copy.units[metric](n) }
    : { figure: formatMoney(n), words: copy.moneyWords[metric] });

/** While it loads, the sentence keeps its words around a pulse: "▭ in sales today". */
export const loadingWords = (key: MetricsPeriodKey, metric: MetricKey) =>
  `${metric === 'orders' || metric === 'packs' ? metric : copy.moneyWords[metric]} ${copy.when[key]}`;

/** The sentence and its change, said when someone picks a period or a chip, and as the chart's value. */
export const spokenSummary = (key: MetricsPeriodKey, metric: MetricKey, m: Metrics): string => {
  const p = m.periods[key];
  const s = sentence(key, metric, p.totals);
  const now = totalOf(p.totals, metric);
  const change = key !== 'lifetime' && p.previous ? changeOf(now, totalOf(p.previous.totals, metric)) : null;
  const said = change && key !== 'lifetime' && p.previous
    ? chipChange(key, metric, change, totalOf(p.previous.totals, metric))?.spoken ?? copy.spokenBothZero(copy.by[key])
    : noCompareLine(key, m)?.replace(/\.$/, '') ?? '';
  return copy.sliderPeriod(`${s.figure} ${s.rest}`, said);
};

/** The small print under the change line. */
export const notes = (metric: MetricKey, t: MetricsTotals): string[] => {
  if (metric === 'came_in') return t.came_in.without_amount ? [copy.noAmount(t.came_in.without_amount)] : [];
  return [
    metric === 'packs' && t.packs > 0 && formatWeight(t.grams),
    t.without_total > 0 && copy.withoutTotal(t.without_total),
    t.samples.orders > 0 && copy.notCountingSamples(t.samples.orders),
  ].filter((x): x is string => Boolean(x));
};

// ---- The chart ----------------------------------------------------------------------------

/** A round top for the scale: the next of 1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8 × 10ⁿ at or above v. */
export const nice = (v: number): number => {
  if (v <= 1) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map((k) => Math.round(k * p)).find((x) => x >= v) ?? 10 * p;
};

/** r[0] = 0, r[h + 1] = everything up to the end of bucket h. */
export const runningTotals = (buckets: MetricsBucket[], metric: MetricKey): number[] =>
  buckets.reduce((r, b) => { r.push(r[r.length - 1] + bucketOf(b, metric)); return r; }, [0]);

export interface Tick { label: string; pos: number; now?: boolean; minor?: boolean; align?: 'start' | 'end' }

/** 0–100, for the SVGs' y axis (0 at the top). */
const yOf = (v: number, top: number) => Number((100 - (v / top) * 100).toFixed(2));

/** "10 am", "12 pm", "midnight": the end of hour h - 1. */
const hourName = (end: number) => (end === 24 || end === 0 ? copy.midnight : `${end % 12 || 12} ${end < 12 ? 'am' : 'pm'}`);

export interface LineChart {
  kind: 'line';
  n: 24;
  /** Running totals, 25 points; prev is yesterday's whole day, or null with no comparison. */
  cur: number[];
  prev: number[] | null;
  nowIndex: number;
  /** Hours since midnight, to the minute. */
  nowX: number;
  total: number;
  /** Yesterday at nowX, on its dashed line (for the hollow dot). */
  ghostAtNow: number | null;
  top: number;
  topLabel: string;
  line: string;
  area: string;
  ghost: string | null;
  ticks: Tick[];
}

/** Today: running totals, today solid to now, yesterday's whole day dashed. */
export const lineChart = (p: MetricsPeriod, metric: MetricKey, asOf: string): LineChart => {
  const nowIndex = p.chart.now_index;
  const { minute } = istClock(asOf);
  const nowX = nowIndex + minute / 60;
  const cur = runningTotals(p.chart.current, metric);
  const prev = p.chart.previous ? runningTotals(p.chart.previous, metric) : null;
  const total = cur[nowIndex + 1];
  const ghostAtNow = prev ? prev[nowIndex] + (prev[nowIndex + 1] - prev[nowIndex]) * (nowX - nowIndex) : null;
  const top = nice(Math.max(total, prev ? prev[prev.length - 1] : 0));
  const points = cur.slice(0, nowIndex + 1).map((v, h) => `${h} ${yOf(v, top)}`);
  points.push(`${Number(nowX.toFixed(3))} ${yOf(total, top)}`);
  const line = `M${points.join(' L')}`;
  const ticks: Tick[] = [0, 6, 12, 18]
    .filter((h) => Math.abs(h - nowX) > 3.4)
    .map((h) => ({ label: copy.hours[h / 6], pos: (h / 24) * 100, minor: h % 12 !== 0, align: h === 0 ? 'start' as const : undefined }));
  ticks.push({ label: copy.nowTick, pos: (nowX / 24) * 100, now: true, align: nowX > 22 ? 'end' : undefined });
  return {
    kind: 'line', n: 24, cur, prev, nowIndex, nowX, total, ghostAtNow, top, topLabel: axisValue(metric, top),
    line,
    area: `${line} L${Number(nowX.toFixed(3))} 100 L0 100 Z`,
    ghost: prev ? `M${prev.map((v, h) => `${h} ${yOf(v, top)}`).join(' L')}` : null,
    ticks,
  };
};

export type SlotState = 'past' | 'now' | 'ahead' | 'before';
export interface Slot { value: number; ghost: number | null; state: SlotState; long: string }

export interface BarChart {
  kind: 'bars';
  n: number;
  slots: Slot[];
  nowIndex: number;
  top: number;
  topLabel: string;
  /** Last period as one stepped dashed line over the bars (viewBox 0 0 n 100), or null. */
  ghost: string | null;
  ticks: Tick[];
  /** "This week, by day", "By day", "By week", "By month". */
  grainLabel: string;
  /** "We started in Sep" when bars before the first order are left out. */
  startedIn: string | null;
}

/** The last India day a bucket covers. */
const bucketEnd = (date: string, grain: MetricsPeriod['chart']['grain']) =>
  (grain === 'week' ? addDays(date, 6) : grain === 'month' ? addDays(addMonths(date, 1), -1) : date);

/** Week, Month, Year, Lifetime: one bar per day, week or month, last period as a ghost. */
export const barChart = (key: MetricsPeriodKey, m: Metrics, metric: MetricKey): BarChart => {
  const p = m.periods[key];
  const { grain, now_index: nowIndex, current, previous } = p.chart;
  const n = current.length;
  const now = Date.parse(m.as_of);
  const firstDay = m.first_order_at ? istDateValue(m.first_order_at) : null;
  const ghostOf = (i: number) => (previous && i < previous.length ? bucketOf(previous[i], metric) : null);
  const slots: Slot[] = current.map((b, i) => {
    const state: SlotState = firstDay && bucketEnd(b.date, grain) < firstDay ? 'before'
      : i < nowIndex ? 'past' : i === nowIndex ? 'now' : 'ahead';
    const day = formatDay(atNoon(b.date), now);
    const long = grain === 'week' ? copy.weekOf(day) : grain === 'month' ? `${monthName(b.date, 'long')} ${b.date.slice(0, 4)}` : day;
    return { value: bucketOf(b, metric), ghost: ghostOf(i), state, long };
  });
  const top = nice(Math.max(0, ...slots.map((s) => s.value), ...slots.map((s) => s.ghost ?? 0)));

  let ghost: string | null = null;
  if (previous) {
    let d = '';
    let open = false;
    slots.forEach((s, i) => {
      if (s.ghost === null) { open = false; return; }
      const y = yOf(s.ghost, top);
      d += open ? ` V${y} H${i + 1}` : ` M${i} ${y} H${i + 1}`;
      open = true;
    });
    ghost = d.trim() || null;
  }

  const label = (i: number): { text: string; minor?: boolean } | null => {
    const b = current[i];
    if (key === 'week') return { text: copy.dayLetters[i] };
    if (key === 'month') {
      const isEnd = i === n - 1;
      if (i === 0 || isEnd || i === nowIndex) return { text: String(i + 1) };
      return (i + 1) % 5 === 0 && n - 1 - i >= 3 ? { text: String(i + 1), minor: true } : null;
    }
    if (grain === 'month') {
      const every = Math.ceil(n / 12);
      return i % every === 0 || i === nowIndex ? { text: monthName(b.date, 'short').charAt(0) } : null;
    }
    if (grain === 'week') return i % 4 === 0 || i === nowIndex ? { text: dayMonth(b.date, b.date.slice(0, 4)) } : null;
    return null;
  };
  const ticks: Tick[] = [];
  current.forEach((_, i) => {
    const isNow = i === nowIndex;
    // Ticks near now give way to now's own label.
    if (!isNow && n > 12 && Math.abs(i - nowIndex) / n < 0.1) return;
    const l = label(i);
    if (!l) return;
    const align = n > 7 && i === 0 ? 'start' : n > 7 && i === n - 1 ? 'end' : undefined;
    ticks.push({ label: l.text, pos: ((i + 0.5) / n) * 100, now: isNow || undefined, minor: (l.minor && !isNow) || undefined, align });
  });

  return {
    kind: 'bars', n, slots, nowIndex, top, topLabel: axisValue(metric, top), ghost, ticks,
    grainLabel: key === 'week' ? copy.grain.weekDays : copy.grain[grain === 'hour' ? 'day' : grain],
    startedIn: firstDay && slots.some((s) => s.state === 'before') ? copy.startedIn(monthName(firstDay, 'short')) : null,
  };
};

export interface Readout { when: string; value: { figure: string; words: string } | null; dim: string | null; before: string | null }

/** Under the chart after a tap: "Wed 21 Oct" · "₹2,440 in sales" · "Last week: ₹1,470". */
export const barReadout = (key: MetricsPeriodKey, chart: BarChart, i: number, metric: MetricKey): Readout => {
  const s = chart.slots[i];
  const before = s.ghost !== null && key !== 'lifetime' ? copy.beforeValue(copy.before[key], showValue(metric, s.ghost)) : null;
  if (s.state === 'ahead' || s.state === 'before') {
    return { when: s.long, value: null, dim: s.state === 'ahead' ? copy.notYet : copy.beforeStart, before };
  }
  return { when: s.state === 'now' ? copy.soFar(s.long) : s.long, value: figureParts(metric, s.value), dim: null, before };
};

/** Today's: "By 10 am" · "₹640 in sales" · "Yesterday: ₹520". The now hour is "By now", against yesterday by now. */
export const hourReadout = (chart: LineChart, h: number, metric: MetricKey, yesterdayByNow: number | null): Readout => {
  const isNow = h === chart.nowIndex;
  const ghost = isNow ? yesterdayByNow : chart.prev ? chart.prev[h + 1] : null;
  const before = ghost === null ? null : copy.beforeValue(copy.before.today, showValue(metric, ghost));
  const when = isNow ? copy.byNow : copy.byHour(hourName(h + 1));
  if (h > chart.nowIndex) return { when, value: null, dim: copy.notYet, before };
  return { when, value: figureParts(metric, isNow ? chart.total : chart.cur[h + 1]), dim: null, before };
};

// ---- By product ------------------------------------------------------------------------------

export interface ProductRow { product: Product; packs: number; grams: number; share: number; change: string | null }

/** All three products in the catalogue's order, packs and share of packs. Never ₹. null: still loading (all 0). */
export const productRows = (p: MetricsPeriod | null): ProductRow[] => productsData.map((product) => {
  const row = p?.products.find((r) => r.product_id === product.id);
  const packs = row?.packs ?? 0;
  const was = p?.previous ? (row?.previous?.packs ?? 0) : null;
  let change: string | null = null;
  if (was !== null && (packs || was)) {
    change = was === 0 ? copy.productNew : packs === was ? copy.productSame
      : packs > was ? copy.productMore(packs - was) : copy.productFewer(was - packs);
  }
  return {
    product, packs, grams: row?.grams ?? 0,
    share: p?.totals.packs ? Math.round((packs / p.totals.packs) * 100) : 0,
    change,
  };
});
