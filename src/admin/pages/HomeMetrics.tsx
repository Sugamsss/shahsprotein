import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { OrderThumb } from '../../components/order/OrderThumb';
import { adminCopy } from '../../data/adminCopy';
import { formatMoney, formatWeight } from '../format';
import { moneyByMethod } from '../orders/model';
import { LoadError } from '../parts';
import type { Metrics, MetricsPeriodKey } from '../types';
import {
  METRIC_KEYS, PERIOD_KEYS, avgOrder, barChart, barReadout, changeLine, changeOf, chipChange, chipValue, hourReadout,
  lineChart, loadingWords, noCompareLine, notes, productRows, profit, profitLabel, rangeLine, sentence, showValue,
  spokenSummary, totalOf, type BarChart, type LineChart, type MetricKey, type Readout,
} from './metrics';

const copy = adminCopy.homePage.metrics;

// "How it's going": both Homes' metrics block (temp/home-metrics/design.md, "Final: B").
// A period switch, a sentence that answers "how much", how that compares, one chart,
// four chips that pick what the sentence and chart show, profit and avg order, then by
// product. The maths and words are in metrics.ts; this file only draws them. It sizes
// itself by its own width (container queries in metrics.css), so the same block sits in
// a phone's column and a laptop's.

type Css = React.CSSProperties & Record<`--${string}`, string | number>;
const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;
const Pulse: React.FC<{ className?: string }> = ({ className = '' }) => <span className={`adm-pulse ${className}`} aria-hidden="true" />;

// ---- The period switch: five native radios, a measured sliding thumb -----------------------

const PeriodSwitch: React.FC<{ value: MetricsPeriodKey; onChange: (key: MetricsPeriodKey) => void }> = ({ value, onChange }) => {
  const name = useId();
  const track = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);
  // The words aren't the same width, so the thumb takes the checked label's place and size.
  // Measuring (mount, resize, fonts) never animates; a change slides.
  const place = useCallback((slide: boolean) => {
    const el = track.current;
    const label = el?.querySelector('input:checked')?.closest('label');
    if (!el || !label) return;
    el.dataset.still = slide ? '' : '1';
    el.style.setProperty('--x', `${label.offsetLeft}px`);
    el.style.setProperty('--w', `${label.offsetWidth}px`);
    if (!slide) requestAnimationFrame(() => { el.dataset.still = ''; });
  }, []);
  useLayoutEffect(() => {
    place(mounted.current);
    mounted.current = true;
  }, [value, place]);
  useEffect(() => {
    const el = track.current;
    if (!el) return undefined;
    const observer = new ResizeObserver(() => place(false));
    observer.observe(el);
    let live = true;
    void document.fonts?.ready.then(() => { if (live) place(false); });
    return () => { live = false; observer.disconnect(); };
  }, [place]);
  return (
    <div ref={track} className="adm-hm-seg" role="radiogroup" aria-label={copy.periodLabel}>
      {PERIOD_KEYS.map((key) => (
        <label key={key}>
          <input type="radio" name={name} value={key} checked={key === value} onChange={() => onChange(key)} />
          <span>{copy.periods[key]}</span>
        </label>
      ))}
    </div>
  );
};

// ---- The chart: one focusable slider over the plot ------------------------------------------

const ReadoutLine: React.FC<{ readout: Readout }> = ({ readout: r }) => (
  <p className="adm-hm-readout">
    <span className="adm-hm-when">{r.when}</span>
    {r.value ? <span><b>{r.value.figure}</b> {r.value.words}</span> : <span className="adm-hm-dim">{r.dim}</span>}
    {r.before && <span className="adm-hm-dim">{r.before}</span>}
  </p>
);

const Hint: React.FC = () => (
  <span className="adm-hm-hint"><span className="adm-hm-hint--tap">{copy.tapHint}</span><span className="adm-hm-hint--click">{copy.clickHint}</span></span>
);

const LinePlot: React.FC<{ chart: LineChart; picked: number | null; metric: MetricKey }> = ({ chart: c, picked, metric }) => {
  const at = (x: number) => pct(x / 24);
  const up = (v: number) => pct(v / c.top);
  const cursor = picked === null ? null : picked === c.nowIndex ? c.nowX : picked + 1;
  return (
    <div className="adm-hm-area-box">
      <svg className="adm-hm-lines" viewBox="0 0 24 100" preserveAspectRatio="none" aria-hidden="true">
        {c.ghost && <path className="adm-hm-ghostline" d={c.ghost} vectorEffect="non-scaling-stroke" />}
        <path className="adm-hm-area" d={c.area} />
        <path className="adm-hm-line" d={c.line} vectorEffect="non-scaling-stroke" />
      </svg>
      {c.ghostAtNow !== null && <span className="adm-hm-dot is-ghost" style={{ '--px': at(c.nowX), '--py': up(c.ghostAtNow) } as Css} />}
      <span className="adm-hm-dot" style={{ '--px': at(c.nowX), '--py': up(c.total) } as Css} />
      <span className={`adm-hm-dotlabel${c.nowX > 16 ? ' is-left' : ''}`} style={{ '--px': at(c.nowX), '--py': up(c.total) } as Css}>
        {showValue(metric, c.total)}
      </span>
      {cursor !== null && <span className="adm-hm-cursor" style={{ '--px': at(cursor) } as Css} />}
    </div>
  );
};

const BarPlot: React.FC<{ chart: BarChart; picked: number | null }> = ({ chart: c, picked }) => (
  <>
    <ol className="adm-hm-bars">
      {c.slots.map((s, i) => {
        const drawn = s.state === 'past' || s.state === 'now';
        const cls = [`is-${s.state}`, drawn && s.value === 0 && 'is-zero', i === picked && 'is-picked'].filter(Boolean).join(' ');
        return <li key={i} className={cls} style={drawn && s.value > 0 ? { '--h': pct(s.value / c.top) } as Css : undefined}><i /></li>;
      })}
    </ol>
    {c.ghost && (
      <svg className="adm-hm-ghost" viewBox={`0 0 ${c.n} 100`} preserveAspectRatio="none" aria-hidden="true">
        <path d={c.ghost} vectorEffect="non-scaling-stroke" />
      </svg>
    )}
  </>
);

const Chart: React.FC<{
  periodKey: MetricsPeriodKey; metrics: Metrics | null; metric: MetricKey; picked: number | null; onPick: (i: number | null) => void;
}> = ({ periodKey, metrics, metric, picked, onPick }) => {
  const period = metrics?.periods[periodKey];
  const chart = metrics && period ? (periodKey === 'today' ? lineChart(period, metric, metrics.as_of) : barChart(periodKey, metrics, metric)) : null;
  const n = chart?.n ?? (periodKey === 'today' ? 24 : 7);
  const nowIndex = chart?.nowIndex ?? 0;
  const pick = picked !== null && picked < n ? picked : null;
  const yesterdayByNow = period?.previous ? totalOf(period.previous.totals, metric) : null;

  let readout: Readout | null = null;
  if (chart && pick !== null) {
    readout = chart.kind === 'line' ? hourReadout(chart, pick, metric, yesterdayByNow) : barReadout(periodKey, chart, pick, metric);
  }

  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!chart) return;
    const box = e.currentTarget.getBoundingClientRect();
    const i = Math.min(n - 1, Math.max(0, Math.floor(((e.clientX - box.left) / box.width) * n)));
    onPick(i === pick ? null : i);
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!chart) return;
    const from = pick ?? nowIndex;
    const next: Record<string, number | null> = {
      ArrowRight: pick === null ? nowIndex : from + 1, ArrowUp: pick === null ? nowIndex : from + 1,
      ArrowLeft: pick === null ? nowIndex : from - 1, ArrowDown: pick === null ? nowIndex : from - 1,
      Home: 0, End: n - 1, Escape: null,
    };
    if (!(e.key in next) || (e.key === 'Escape' && pick === null)) return;
    e.preventDefault();
    const to = next[e.key];
    onPick(to === null ? null : Math.min(n - 1, Math.max(0, to)));
  };

  const grain = chart?.kind === 'bars' ? metrics!.periods[periodKey].chart.grain : 'hour';
  const name = copy.chartName(copy.metricNames[metric], copy.when[periodKey], copy.grainLower[grain]);
  const valueText = !metrics ? undefined : readout
    ? copy.sliderPick(readout.when, readout.value ? `${readout.value.figure} ${readout.value.words}` : readout.dim ?? '', readout.before)
    : spokenSummary(periodKey, metric, metrics);
  const size = n > 24 ? 'xl' : n > 12 ? 'l' : n > 7 ? 'm' : 's';

  let key: React.ReactNode = null;
  if (chart?.kind === 'line') {
    key = (
      <p className="adm-hm-key">
        <span><i className="adm-hm-sw is-line" />{copy.today}</span>
        {yesterdayByNow !== null && <span><i className="adm-hm-sw is-ghost" />{copy.yesterdayByNow(showValue(metric, yesterdayByNow))}</span>}
      </p>
    );
  } else if (chart) {
    key = (
      <p className="adm-hm-key">
        <span><i className="adm-hm-sw" />{chart.grainLabel}</span>
        {chart.ghost && periodKey !== 'lifetime' && <span><i className="adm-hm-sw is-ghost" />{copy.before[periodKey]}</span>}
        {chart.startedIn && <span>{chart.startedIn}</span>}
        <Hint />
      </p>
    );
  }

  return (
    <figure className={`adm-hm-chart adm-hm-n${size}${chart?.kind === 'line' ? ' is-line' : ''}`} style={{ '--n': n } as Css}>
      <div className="adm-hm-plot" role="slider" tabIndex={0} aria-label={name} aria-valuemin={1} aria-valuemax={n}
        aria-valuenow={(pick ?? nowIndex) + 1} aria-valuetext={valueText} onClick={onClick} onKeyDown={onKeyDown}>
        {!chart ? <Pulse className="adm-pulse--bars adm-hm-pulse-bars" /> : (
          <>
            <span className="adm-hm-top" aria-hidden="true">{chart.topLabel}</span>
            {chart.kind === 'line' ? <LinePlot chart={chart} picked={pick} metric={metric} /> : <BarPlot chart={chart} picked={pick} />}
          </>
        )}
      </div>
      <div className="adm-hm-x" aria-hidden="true">
        {chart?.ticks.map((t) => (
          <span key={`${t.label}-${t.pos}`} className={[t.now && 'is-now', t.minor && 'is-minor', t.align && `is-${t.align}`].filter(Boolean).join(' ') || undefined}
            style={{ '--pos': `${t.pos}%` } as Css}>{t.label}</span>
        ))}
      </div>
      <figcaption>{readout ? <ReadoutLine readout={readout} /> : key}</figcaption>
    </figure>
  );
};

// ---- The block --------------------------------------------------------------------------------

export const HomeMetrics: React.FC<{ metrics: Metrics | null; failed: boolean; onRetry: () => void }> = ({ metrics, failed, onRetry }) => {
  const [periodKey, setPeriodKey] = useState<MetricsPeriodKey>('today');
  const [metric, setMetric] = useState<MetricKey>('sales');
  const [picked, setPicked] = useState<number | null>(null);
  // Said after someone picks a period or a chip; never on load or the minute's refresh.
  const [said, setSaid] = useState('');

  const choosePeriod = (key: MetricsPeriodKey) => {
    setPeriodKey(key);
    setPicked(null);
    if (metrics) setSaid(spokenSummary(key, metric, metrics));
  };
  const chooseMetric = (key: MetricKey) => {
    setMetric(key);
    if (metrics) setSaid(spokenSummary(periodKey, key, metrics));
  };

  const loading = !metrics && !failed;
  const period = metrics?.periods[periodKey];
  const t = period?.totals;
  const prev = periodKey !== 'lifetime' ? period?.previous?.totals ?? null : null;
  const s = t ? sentence(periodKey, metric, t) : null;
  const now = t ? totalOf(t, metric) : 0;
  const before = prev ? totalOf(prev, metric) : null;
  const change = periodKey !== 'lifetime' ? changeOf(now, before) : null;
  const line = change && before !== null && periodKey !== 'lifetime' ? changeLine(periodKey, metric, change, before) : null;
  const quiet = metrics && !line ? noCompareLine(periodKey, metrics) : null;
  const small = t ? notes(metric, t) : [];
  const methods = t && metric === 'came_in' ? moneyByMethod(t.came_in.by_method) : [];
  const avg = t ? avgOrder(t) : null;
  const ChangeIcon = line?.icon === 'up' ? ArrowUp : line?.icon === 'down' ? ArrowDown : null;

  let body: React.ReactNode;
  if (failed && !metrics) {
    body = <LoadError onRetry={onRetry} />;
  } else {
    body = (
      <>
        <div className="adm-hm-story">
          <p className="adm-hm-range">{metrics ? rangeLine(periodKey, metrics) : <Pulse className="adm-hm-pulse-range" />}</p>
          <p className="adm-hm-sentence">
            {s ? <><b className={s.money ? 'is-money' : undefined}>{s.figure}</b> {s.rest}</>
              : <><Pulse className="adm-hm-pulse-figure" /> {loadingWords(periodKey, metric)}</>}
          </p>
          {loading && <p className="adm-hm-change"><Pulse className="adm-hm-pulse-line" /></p>}
          {line && (
            <p className={`adm-hm-change${line.up ? ' is-up' : ''}`}>
              {ChangeIcon && <ChangeIcon size={16} aria-hidden="true" />}<span>{line.text}</span>
            </p>
          )}
          {quiet && <p className="adm-hm-change is-none">{quiet}</p>}
          {methods.length > 0 && (
            <>
              <div className="adm-hm-split" aria-hidden="true">
                {methods.map((x) => <i key={x.key} className={`is-${x.key}`} style={{ '--w': x.amount } as Css} />)}
              </div>
              <ul className="adm-hm-methods" aria-label={copy.byMethod}>
                {methods.map((x) => <li key={x.key}><i className={`is-${x.key}`} />{x.label} <b>{formatMoney(x.amount)}</b></li>)}
              </ul>
            </>
          )}
          {small.length > 0 && (
            <p className="adm-hm-notes">
              {/* Each note stays whole; the line breaks only at the space between notes. */}
              {small.map((x, i) => (
                <React.Fragment key={x}>{i > 0 && ' '}<span>{x}{i < small.length - 1 && <span aria-hidden="true"> ·</span>}</span></React.Fragment>
              ))}
            </p>
          )}
        </div>

        <Chart periodKey={periodKey} metrics={metrics} metric={metric} picked={picked} onPick={setPicked} />

        <div className={`adm-hm-chips${prev ? ' has-change' : ''}`} role="group" aria-label={copy.showOnChart}>
          {METRIC_KEYS.map((key) => {
            const v = t ? totalOf(t, key) : 0;
            const was = prev ? totalOf(prev, key) : null;
            const ch = t && was !== null && periodKey !== 'lifetime' ? changeOf(v, was) : null;
            const cc = ch && was !== null && periodKey !== 'lifetime' ? chipChange(periodKey, key, ch, was) : null;
            const Icon = cc?.icon === 'up' ? ArrowUp : cc?.icon === 'down' ? ArrowDown : null;
            return (
              <button key={key} type="button" className={`adm-hm-chip${key === metric ? ' is-on' : ''}`} aria-pressed={key === metric}
                aria-label={t ? copy.chipName(copy.metricNames[key], showValue(key, v), cc?.spoken ?? '') : copy.metricNames[key]}
                onClick={() => chooseMetric(key)}>
                <span className="adm-hm-chip__label">{copy.metricNames[key]}</span>
                <b>{t ? chipValue(key, v) : <Pulse className="adm-hm-pulse-chip" />}</b>
                {cc && (
                  <span className="adm-hm-delta">
                    {Icon && <Icon size={13} aria-hidden="true" />}{cc.text}
                    {cc.from && <span className="adm-hm-from">{cc.from}</span>}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <dl className="adm-hm-quiet">
          <div><dt>{profitLabel()}</dt><dd>{t ? formatMoney(profit(t.sales)) : <Pulse />}</dd></div>
          {(loading || avg !== null) && <div><dt>{copy.avgOrder}</dt><dd>{avg !== null ? formatMoney(avg) : <Pulse />}</dd></div>}
        </dl>

        <section className="adm-hm-prod" aria-labelledby="adm-hm-prod-h">
          <div className="adm-hm-sub">
            <h3 id="adm-hm-prod-h">{copy.byProduct}</h3>
            {prev && periodKey !== 'lifetime' && <span>{copy.vsShort[periodKey]}</span>}
          </div>
          <ul>
            {productRows(period ?? null).map((row) => (
              <li key={row.product.id} className={!loading && !row.packs ? 'is-none' : undefined}>
                <OrderThumb product={row.product} className="adm-hm-thumb" />
                <span className="adm-hm-prod__main">
                  <span className="adm-hm-prod__name">
                    <b>{row.product.name}</b>
                    <span>{loading ? <Pulse /> : row.packs ? <><span className="adm-hm-nowrap">{formatWeight(row.grams)} ·</span> {row.share}%</> : copy.productNone}</span>
                  </span>
                  <span className="adm-hm-prod__track"><i style={{ '--w': `${row.share}%` } as Css} /></span>
                </span>
                <span className="adm-hm-prod__end">
                  <b>{loading ? <Pulse /> : copy.count(row.packs, 'packs')}</b>
                  {row.change && <small>{row.change}</small>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </>
    );
  }

  return (
    <section className={`adm-card adm-hm${loading ? ' is-loading' : ''}`} aria-labelledby="adm-hm-h" aria-busy={loading || undefined}>
      <h2 id="adm-hm-h" className="visually-hidden">{copy.title}</h2>
      <PeriodSwitch value={periodKey} onChange={choosePeriod} />
      <div className="adm-hm-body">{body}</div>
      <p className="visually-hidden" aria-live="polite">{said}</p>
    </section>
  );
};
