import React from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { adminCopy } from '../../data/adminCopy';
import { formatDay, formatMoney, formatMoneyShort, istDateValue } from '../format';
import { moneyByMethod } from '../orders/model';
import type { Totals, TotalsByMethod } from '../types';

const copy = adminCopy.homePage;

// This week against last, on Sunit's Home. Every comparison is with last week
// up to the same moment ("last_so_far"), so a Saturday morning isn't measured
// against a whole week. Until there is a real last week, neither card compares.

/** 'this' when the first real order is this week (or none yet), 'last' when it was last week, else null. */
const firstWeek = (totals: Totals): 'this' | 'last' | null => {
  const first = totals.first_order_at ? Date.parse(totals.first_order_at) : null;
  if (first === null || first >= Date.parse(totals.weeks.this.starts_at)) return 'this';
  return first > Date.parse(totals.weeks.last.starts_at) ? 'last' : null;
};

const Pulse: React.FC<{ className?: string }> = ({ className = '' }) => <span className={`adm-pulse ${className}`} aria-hidden="true" />;

const Change: React.FC<{ now: number; before: number; show: (n: number) => string; first: boolean }> = ({ now, before, show, first }) => {
  if (first) return <em>{copy.vsFirst}</em>;
  const Icon = now > before ? ArrowUp : now < before ? ArrowDown : null;
  const text = now > before ? copy.vsUp(show(before)) : now < before ? copy.vsDown(show(before)) : copy.vsSame(show(before));
  return <em className={now > before ? 'is-up' : ''}>{Icon && <Icon size={13} aria-hidden="true" />}{text}</em>;
};

/** Under ₹ came in: this week's money by how it was paid, one quiet line each, zeros left out. */
const ByMethod: React.FC<{ totals: TotalsByMethod | undefined }> = ({ totals }) => {
  const rows = moneyByMethod(totals);
  if (!rows.length) return null;
  return (
    <ul className="adm-home__methods" aria-label={copy.vsByMethod}>
      {rows.map((r) => <li key={r.key}><span>{r.label}</span><span>{formatMoney(r.amount)}</span></li>)}
    </ul>
  );
};

/** Sunit's: orders and ₹ in against this time last week, and the days with last week's height dashed. */
export const AdminWeek: React.FC<{ totals: Totals | null | undefined }> = ({ totals }) => {
  const first = totals ? firstWeek(totals) !== null : false;
  const w = totals?.weeks;
  const today = istDateValue();
  const days = w?.this.days ?? [];
  const lastDays = first ? [] : w?.last.days ?? [];
  const max = Math.max(1, ...days.map((d) => d.orders), ...lastDays.map((d) => d.orders));

  return (
    <section className="adm-card adm-home__card" aria-labelledby="adm-home-vs" aria-busy={totals ? undefined : true}>
      <div className="adm-home__head">
        <h2 id="adm-home-vs">{copy.vsTitle}</h2>
        {!first && <span>{copy.vsMeta}</span>}
      </div>
      <div className="adm-home__vs">
        <div>
          {w ? <b>{w.this.orders}</b> : <Pulse className="adm-pulse--big" />}
          <span>{copy.vsOrders(w?.this.orders ?? 0)}</span>
          {w && <Change now={w.this.orders} before={w.last_so_far.orders} show={String} first={first} />}
        </div>
        <div>
          {w ? (
            <b className="is-money">
              <span aria-hidden="true">{formatMoneyShort(w.this.amount_in)}</span>
              <span className="visually-hidden">{formatMoney(w.this.amount_in)}</span>
            </b>
          ) : <Pulse className="adm-pulse--big" />}
          <span>{copy.vsCameIn}</span>
          {w && <Change now={w.this.amount_in} before={w.last_so_far.amount_in} show={formatMoney} first={first} />}
          {w && <ByMethod totals={w.this.amount_by_method} />}
          {w && w.this.paid_without_amount > 0 && <small>{copy.vsNoTotal(w.this.paid_without_amount)}</small>}
        </div>
      </div>
      {w && w.this.part_payments > 0 && <p className="adm-home__vsnote">{adminCopy.payments.weekNote}</p>}
      {w ? (
        <ol className="adm-home__bars" aria-label={copy.vsBars}>
          {days.map((d, i) => {
            const last = lastDays[i]?.orders ?? null;
            const ahead = d.date > today;
            const state = d.date === today ? 'is-today' : ahead ? 'is-ahead' : d.orders ? '' : 'is-zero';
            const day = formatDay(`${d.date}T12:00:00+05:30`);
            return (
              <li key={d.date} className={state} aria-label={ahead ? copy.vsDayAhead(day, last) : copy.vsDay(day, d.orders, last)}>
                <span className="adm-home__slot" aria-hidden="true">
                  {last !== null && <span className="adm-home__ghost" style={{ '--g': `${(last / max) * 100}%` } as React.CSSProperties} />}
                  {!ahead && <span className="adm-home__bar" style={{ '--h': `${(d.orders / max) * 100}%` } as React.CSSProperties} />}
                </span>
                <span className="adm-home__day" aria-hidden="true">{copy.dayLetters[i]}</span>
              </li>
            );
          })}
        </ol>
      ) : <Pulse className="adm-pulse--bars" />}
      <div className="adm-home__legend" aria-hidden="true">
        <span><i />{copy.thisWeek}</span>
        {!first && <span><i className="is-ghost" />{copy.lastWeek}</span>}
      </div>
    </section>
  );
};
