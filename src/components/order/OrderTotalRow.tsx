import React from 'react';
import { siteConfig } from '../../data/siteConfig';
import { formatRupees, type OrderTotal } from '../../utils/prices';

const copy = siteConfig.order;

/** Under the lines: the packs added up, a coupon saving struck through, and a note that delivery comes later. */
export const OrderTotalRow: React.FC<{ total: OrderTotal }> = ({ total }) => (
  <div className="order-total">
    <p className="order-total__row">
      <span className="order-total__label">{copy.totalLabel}</span>
      <span className="order-total__amount">
        {total.total < total.mrpTotal && (
          <>
            <s>
              <span className="visually-hidden">{copy.linePriceWas}</span>
              {formatRupees(total.mrpTotal)}
            </s>{' '}
            <span className="visually-hidden">{copy.linePriceNow}</span>
          </>
        )}
        {formatRupees(total.total)}
      </span>
    </p>
    <p className="order-total__note">{copy.totalNote}</p>
  </div>
);
