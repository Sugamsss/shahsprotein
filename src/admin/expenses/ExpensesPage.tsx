import React, { useState } from 'react';
import { ChevronRight, Plus, ReceiptIndianRupee, Search, X } from 'lucide-react';
import { adminCopy } from '../../data/adminCopy';
import { getExpenses } from '../api';
import { formatMoney } from '../format';
import { dayTitle } from '../journal/model';
import { LoadError, Segmented, Skeleton } from '../parts';
import type { Expense } from '../types';
import { useRpc, useSettled } from '../useRpc';
import { ExpenseSheet } from './ExpenseSheet';
import {
  groupExpenses, istToday, monthHeading, rangeFor, sumOf, timeOfDay12, type ExpenseRange,
} from './model';

const copy = adminCopy.expenses;

/**
 * Expenses, from More: what both owners paid out. One list, newest day first, with
 * a month's line and a day's card around each group; one search over the words,
 * the money and the days; and All / This month / Last month. A row opens the same
 * sheet as "Edit expense".
 */
const ExpensesPage: React.FC = () => {
  const [range, setRange] = useState<ExpenseRange>('all');
  const [text, setText] = useState('');
  const search = useSettled(text.trim(), 250);
  const today = istToday();
  const { from, to } = rangeFor(range, today);
  const list = useRpc(() => getExpenses({ from, to, search }), [from, to, search], { refreshOnFocus: true });
  const [sheet, setSheet] = useState<{ expense: Expense | null } | null>(null);

  const data = list.data;
  const rows = data?.expenses ?? [];
  const missing = list.error?.kind === 'missing';
  const months = groupExpenses(rows);

  let body: React.ReactNode;
  if (missing) body = <p className="adm-card adm-empty">{adminCopy.errors.missing}</p>;
  else if (list.error && !data) body = <LoadError onRetry={() => void list.reload()} />;
  else if (!data) body = <Skeleton cards={2} rows={3} />;
  else if (!rows.length) {
    body = search ? (
      <section className="adm-card adm-exp__empty" aria-label={copy.title}>
        <p>{copy.noMatch(search)}</p>
      </section>
    ) : range !== 'all' ? (
      <section className="adm-card adm-exp__empty" aria-label={copy.title}>
        <p>{copy.emptyMonth}</p>
      </section>
    ) : (
      <section className="adm-card adm-exp__empty" aria-label={copy.title}>
        <span className="adm-exp__empty-icon" aria-hidden="true">
          <ReceiptIndianRupee size={28} strokeWidth={1.5} />
        </span>
        <p>{copy.empty}</p>
      </section>
    );
  } else {
    body = (
      <div className="adm-exp__list" aria-busy={list.loading || undefined}>
        {search && !list.error && (
          <p className="adm-exp__found">
            <b>{copy.entries(rows.length)}</b> · {copy.inAll(formatMoney(sumOf(rows)))}
          </p>
        )}
        {months.map((month) => (
          <React.Fragment key={month.month}>
            <div className="adm-exp__month">
              <h2>{monthHeading(month.month, today)}</h2>
              <div><span>{copy.entries(month.count)}</span><b>{formatMoney(month.total)}</b></div>
            </div>
            {month.days.map((group) => (
              <section key={group.day} className="adm-card adm-xday" aria-label={dayTitle(group.day, today)}>
                <div className="adm-xday__head">
                  <h3>{dayTitle(group.day, today)}</h3>
                  <span className="adm-xday__facts">
                    <span className="adm-xday__count">{copy.entries(group.expenses.length)} · </span>
                    <b>{formatMoney(group.total)}</b>
                  </span>
                </div>
                {group.expenses.map((expense) => (
                  <button key={expense.id} type="button" className="adm-xrow" onClick={() => setSheet({ expense })}>
                    <span className="adm-xrow__main">
                      <span className="adm-xrow__title">{expense.title}</span>
                      <span className="adm-xrow__sub">
                        {timeOfDay12(expense.spent_at)}{expense.note ? ` · ${expense.note}` : ''}
                      </span>
                    </span>
                    <span className="adm-xrow__amt">{formatMoney(expense.amount)}</span>
                    <ChevronRight className="adm-xrow__end" size={20} aria-hidden="true" />
                  </button>
                ))}
              </section>
            ))}
          </React.Fragment>
        ))}
      </div>
    );
  }

  return (
    <div className="adm-page adm-page--list">
      <div className="adm-title-row">
        <h1 className="adm-title">{copy.title}</h1>
        {!missing && (
          <button type="button" className="adm-btn adm-btn--primary adm-btn--sm" disabled={!data} onClick={() => setSheet({ expense: null })}>
            <Plus size={18} strokeWidth={1.75} aria-hidden="true" />{copy.new}
          </button>
        )}
      </div>

      {!missing && (
        <div className="adm-exp__tools">
          <div className="adm-search-field">
            <Search size={20} strokeWidth={1.75} aria-hidden="true" />
            <input className="adm-input" type="search" placeholder={copy.search} aria-label={copy.searchLabel}
              autoComplete="off" enterKeyHint="search" value={text} onChange={(event) => setText(event.target.value)} />
            {text && (
              <button type="button" className="adm-search-field__clear" aria-label={copy.clear} onClick={() => setText('')}>
                <X size={20} strokeWidth={1.75} aria-hidden="true" />
              </button>
            )}
          </div>
          <Segmented
            label={copy.filterLabel}
            slide
            value={range}
            onChange={setRange}
            options={[
              { value: 'all', label: copy.ranges.all },
              { value: 'this', label: copy.ranges.this },
              { value: 'last', label: copy.ranges.last },
            ]}
          />
        </div>
      )}

      {list.error && data && <div className="adm-exp__refresh-error" role="alert">
        <span>{copy.refreshFailed} {copy.staleResults}</span>
        <button type="button" className="adm-text-btn" onClick={() => void list.reload()}>{copy.retry}</button>
      </div>}

      {body}

      {sheet && (
        <ExpenseSheet
          expense={sheet.expense}
          today={istToday()}
          onSaved={() => void list.reload()}
          onDeleted={() => void list.reload()}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  );
};

export default ExpensesPage;
