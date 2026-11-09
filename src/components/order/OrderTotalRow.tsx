import React from 'react';
import { Link } from 'react-router-dom';
import { formatRupees } from '../../utils/prices';
import { siteConfig } from '../../data/siteConfig';
import { deliveryNudge, quoteSavings } from '../../utils/orderOffer';
import type { WebsiteQuote } from '../../types/offer';
import { useCustomerAuth } from '../../context/CustomerAuthContext';

const guestCopy = siteConfig.order.loginNudge;
const copy = siteConfig.order;

/**
 * Delivery (with the nudge above it), the payable total and the saving. The
 * total takes no strike: it includes delivery, so a struck items MRP beside it
 * would not add up. Every amount comes from the server quote, so the cart, the
 * message and the saved bill can't drift apart.
 */
export const OrderTotalRow: React.FC<{ quote: WebsiteQuote }> = ({ quote }) => {
  const { session } = useCustomerAuth();
  const nudge = deliveryNudge(
    { grams: quote.grams, packs: quote.packs },
    quote.free_delivery_rule,
    { weight: copy.deliveryNudgeWeight, packs: copy.deliveryNudgePacks },
  );
  const savings = quoteSavings(quote);
  return <div className="order-total">
    {!session && (
      <div className="order-total__signin">
        <span>{guestCopy}</span>
        <Link className="offer-login-chip offer-login-chip--small" to="/login?return=%2F%23products">{copy.logIn}</Link>
      </div>
    )}
    {nudge && <p className="order-total__nudge" role="status">{nudge}</p>}
    <p className="order-total__delivery">
      <span>{copy.deliveryLabel}</span>
      <b>{quote.delivery_waived ? copy.freeLabel : formatRupees(quote.delivery_fee)}</b>
    </p>
    <p className="order-total__row">
      <span className="order-total__label">{copy.totalLabel}</span>
      <span className="order-total__amount">{formatRupees(quote.total)}</span>
    </p>
    <p className="order-total__savings">{copy.savingsLine(formatRupees(savings))}</p>
  </div>;
};
