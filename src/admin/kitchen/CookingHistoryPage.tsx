import React, { useState } from 'react';
import { adminCopy } from '../../data/adminCopy';
import { productsData } from '../../data/products';
import { getKitchenHistory } from '../api';
import { istDateValue } from '../format';
import { LoadError, Skeleton } from '../parts';
import { useRpc } from '../useRpc';
import { dayHeading, groupByDay } from './history';
import { HistoryRow } from './HistoryRow';

const copy = adminCopy.kitchen.history;
const PAGE = 50;

/**
 * Cooking history: every batch logged, fixed or deleted, and each write-off, newest
 * first, by day. Filter by product. Reached from Logged this week and More.
 */
const CookingHistoryPage: React.FC = () => {
  const [product, setProduct] = useState<string | null>(null);
  const list = useRpc(() => getKitchenHistory({ productId: product ?? undefined, limit: PAGE }), [product]);
  const [older, setOlder] = useState(false);
  const [olderFailed, setOlderFailed] = useState(false);

  // Rows show only for the answer to the current filter: not while it reloads, and not on a failure.
  const shown = list.loading || list.error ? null : list.data;
  const entries = shown?.entries ?? [];
  const missing = list.error?.kind === 'missing';
  const today = istDateValue();

  const loadOlder = async () => {
    const last = entries[entries.length - 1];
    if (!last) return;
    setOlder(true);
    setOlderFailed(false);
    try {
      const page = await getKitchenHistory({ productId: product ?? undefined, before: last.at, limit: PAGE });
      list.setData((d) => d && { entries: [...d.entries, ...page.entries], more: page.more });
    } catch {
      setOlderFailed(true);
    }
    setOlder(false);
  };

  return (
    <div className="adm-page adm-hist">
      <h1 className="adm-title">{copy.title}</h1>

      {!missing && (
        <div className="adm-hist__filter" role="group" aria-label={copy.filterLabel}>
          <button
            type="button"
            className={`adm-hist__chip${product === null ? ' is-on' : ''}`}
            aria-pressed={product === null}
            onClick={() => setProduct(null)}
          >
            {copy.all}
          </button>
          {productsData.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`adm-hist__chip${product === p.id ? ' is-on' : ''}`}
              aria-pressed={product === p.id}
              onClick={() => setProduct(p.id)}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}

      {missing && <p className="adm-muted">{adminCopy.errors.missing}</p>}
      {!missing && list.error && <LoadError onRetry={list.reload} />}
      {list.loading && <Skeleton rows={3} cards={2} />}
      {shown && !entries.length && (
        <p className="adm-muted">
          {product ? copy.emptyProduct(productsData.find((p) => p.id === product)?.name ?? '') : copy.empty}
        </p>
      )}

      {groupByDay(entries).map((group) => {
        const headingId = `adm-hist-day-${group.day}`;
        return (
          <section key={group.day} className="adm-hist__day" aria-labelledby={headingId}>
            <h2 id={headingId} className="adm-hist__heading">{dayHeading(group.day, today)}</h2>
            <ul className="adm-card adm-list">
              {group.entries.map((entry) => <HistoryRow key={entry.id} entry={entry} />)}
            </ul>
          </section>
        );
      })}

      {shown?.more && (
        <button type="button" className="adm-btn adm-btn--quiet adm-hist__more" disabled={older} onClick={() => void loadOlder()}>
          {older ? copy.showMoreBusy : copy.showMore}
        </button>
      )}
      {olderFailed && <p className="adm-form__error" role="alert">{adminCopy.loadError}</p>}
    </div>
  );
};

export default CookingHistoryPage;
