import React from 'react';
import { OrderThumb } from '../../components/order/OrderThumb';
import { adminCopy } from '../../data/adminCopy';
import { productsData } from '../../data/products';
import type { KitchenHistoryEntry } from '../types';
import { historyLine } from './history';

/** One line of the cooking history: the product's thumb, what happened, then who and when. */
export const HistoryRow: React.FC<{ entry: KitchenHistoryEntry }> = ({ entry }) => {
  const product = productsData.find((p) => p.id === entry.product_id);
  const line = historyLine(entry);
  return (
    <li className="adm-hist__row">
      {product ? <OrderThumb product={product} className="adm-kx-thumb" /> : <span />}
      <span className="adm-list__main">
        <span className="adm-list__title">
          {line.title}
          {line.undone && <span className="adm-hist__undo">{adminCopy.kitchen.history.undo}</span>}
        </span>
        <span className="adm-list__sub">{line.detail}</span>
      </span>
    </li>
  );
};
