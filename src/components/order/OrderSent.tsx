import React, { useState } from 'react';
import { productsData } from '../../data/products';
import { siteConfig } from '../../data/siteConfig';
import type { SentOrder } from '../../context/OrderContext';
import { saveOrder } from '../../services/orderService';
import { buildOrderMessage } from '../../utils/orderMessage';
import { useModalClose } from '../ui/Modal';
import { WhatsAppIcon } from '../ui/WhatsAppIcon';
import { lineKey } from './orderLineKey';

const copy = siteConfig.order;
const order = siteConfig.contact.order;

/** Clipboard API first, then the old select-and-copy for browsers that block it. Never throws. */
const copyText = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.className = 'visually-hidden';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
};

interface OrderSentProps {
  sent: SentOrder;
  onNewOrder: () => void;
}

/** After Send: what was sent, a way to open WhatsApp again, and what's next. */
export const OrderSent: React.FC<OrderSentProps> = ({ sent, onNewOrder }) => {
  const close = useModalClose();
  const [copied, setCopied] = useState<'ok' | 'failed' | null>(null);

  // The same text WhatsApp gets (buildOrderMessage), so the two can't drift apart.
  const onCopy = () => {
    void copyText(buildOrderMessage(sent)).then((ok) => setCopied(ok ? 'ok' : 'failed'));
  };
  const meta = [sent.name, sent.pincode, sent.coupon && copy.recapCoupon(sent.coupon.code)].filter(Boolean).join(' · ');

  return (
    <>
      <div className="order-sent">
        <span className="order-sent__icon" aria-hidden="true">
          <WhatsAppIcon size={26} />
        </span>
        <h4 className="order-sent__title" tabIndex={-1}>{copy.sentTitle}</h4>
        <p className="order-sent__body">{copy.sentBody}</p>

        <div className="order-recap">
          <ul>
            {sent.lines.map((line) => {
              const product = productsData.find((p) => p.id === line.productId);
              return (
                <li key={lineKey(line)}>
                  {product?.name} {line.size} <span>{copy.recapQty(line.quantity)}</span>
                </li>
              );
            })}
          </ul>
          <p className="order-recap__code">{copy.sentCode(sent.code)}</p>
          {meta && <p className="order-recap__meta">{meta}</p>}
        </div>

        <p className="order-sent__retry">
          {copy.retryLead}{' '}
          {/* Opens the same message again, and saves the same order again in case the
              first save didn't make it (the server ignores a repeat). Not counted again
              as a click: it's the same order. */}
          <a
            href={sent.url}
            target="_blank"
            rel="noopener noreferrer"
            className="order-text-link"
            onClick={() => saveOrder(sent)}
          >
            {copy.retry}
          </a>{' '}
          {copy.copyLead}{' '}
          <button type="button" className="order-text-link" onClick={onCopy}>
            {copy.copyMessage}
          </button>
        </p>
        {/* Always in the page, so the result is read out when it appears. */}
        <p className="order-sent__copied" role="status">
          {copied && (copied === 'ok' ? copy.copied(order.display) : copy.copyFailed(order.display))}
        </p>
        <p className="order-sent__forgot">{copy.forgot}</p>
      </div>

      <div className="popup-bar order-sent__bar">
        <button type="button" className="pill-btn pill-btn--secondary" onClick={onNewOrder}>
          {copy.newOrder}
        </button>
        <button type="button" className="pill-btn pill-btn--primary" onClick={close}>
          {copy.done}
        </button>
      </div>
    </>
  );
};
