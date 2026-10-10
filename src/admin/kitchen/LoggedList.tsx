import React from 'react';
import { ChevronRight } from 'lucide-react';
import { OrderThumb } from '../../components/order/OrderThumb';
import { adminCopy } from '../../data/adminCopy';
import { productsData } from '../../data/products';
import { formatDayInSentence, formatWeight } from '../format';
import { madeOnDay, productName } from '../orders/model';
import { AdminLink } from '../router';
import type { Kitchen, KitchenBatch } from '../types';
import { useHistoryAvailable } from './useHistoryAvailable';
import { HISTORY_PATH } from './history';
import { loggedThisWeek, shiftDay } from './model';

const copy = adminCopy.kitchen;

/** "Today", "Yesterday", "Thu 17 Sep": when a batch was made, at the start of a line. */
const madeText = (day: string, today: string) =>
  (day === today ? copy.today : day === shiftDay(today, -1) ? copy.yesterday : madeOnDay(day));

/**
 * "Logged this week" on Pranjali's Home: each batch with where its food went. A tap
 * opens Fix a batch. Nothing shows when nothing was logged.
 */
export const LoggedList: React.FC<{ kitchen: Kitchen; onFix: (batch: KitchenBatch) => void }> = ({ kitchen, onFix }) => {
  const historyOn = useHistoryAvailable();
  const batches = loggedThisWeek(kitchen);
  if (!batches.length) return null;
  return (
    <section className="adm-card adm-home__card adm-home__card--flush" aria-labelledby="adm-home-logged">
      <div className="adm-home__head">
        <h2 id="adm-home-logged">{copy.loggedTitle}</h2>
        <span className="adm-home__meta-wide">{copy.loggedMeta}</span>
        {historyOn && <AdminLink className="adm-kx-history-link" to={HISTORY_PATH}>{copy.history.seeAll}</AdminLink>}
      </div>
      <div className="adm-list adm-kx-logged">
        {batches.map((b) => {
          const product = productsData.find((p) => p.id === b.product_id);
          const name = productName(b.product_id);
          const weight = formatWeight(b.grams);
          const parts = copy.batchParts(
            b.to_orders ? formatWeight(b.to_orders) : null,
            b.orders,
            b.spare ? formatWeight(b.spare) : null,
            b.written_off ? formatWeight(b.written_off) : null,
          );
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => onFix(b)}
              aria-label={`${copy.fixName(weight, name, formatDayInSentence(`${b.made_on}T12:00:00+05:30`))}. ${parts.join(', ')}.`}
            >
              {product ? <OrderThumb product={product} className="adm-kx-thumb" /> : <span />}
              <span className="adm-list__main">
                <span className="adm-list__title">{copy.batchTitle(name, weight)}</span>
                <span className="adm-list__sub">{[madeText(b.made_on, kitchen.today), ...parts].join(' · ')}</span>
              </span>
              <ChevronRight className="adm-list__end" size={20} aria-hidden="true" />
            </button>
          );
        })}
      </div>
    </section>
  );
};
