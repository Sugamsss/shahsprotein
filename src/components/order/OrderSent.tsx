import React, { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
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
  const [codeCopied, setCodeCopied] = useState<'ok' | 'failed' | null>(null);
  const codeRef = useRef<HTMLSpanElement>(null);

  // "Copied" goes back to "Copy" after a moment, so it can be copied again.
  useEffect(() => {
    if (codeCopied !== 'ok') return undefined;
    const timer = window.setTimeout(() => setCodeCopied(null), 2000);
    return () => window.clearTimeout(timer);
  }, [codeCopied]);

  const onCopyCode = () => {
    void copyText(sent.code).then((ok) => {
      setCodeCopied(ok ? 'ok' : 'failed');
      if (ok || !codeRef.current) return;
      // Couldn't copy: select the code, so a long-press or Ctrl+C gets all of it.
      try {
        const range = document.createRange();
        range.selectNodeContents(codeRef.current);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      } catch {
        // Nothing more to do: the code is still there to read.
      }
    });
  };

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
          <div className="order-recap__code">
            <p>
              <span className="order-recap__code-label">{copy.sentCode}</span>
              <span ref={codeRef} className="order-code">{sent.code}</span>
            </p>
            <button
              type="button"
              className={`order-recap__copy${codeCopied === 'ok' ? ' is-copied' : ''}`}
              aria-label={copy.copyCodeLabel(sent.code)}
              onClick={onCopyCode}
            >
              {codeCopied === 'ok'
                ? <Check size={15} strokeWidth={2.5} aria-hidden="true" />
                : <Copy size={15} strokeWidth={2.25} aria-hidden="true" />}
              <span>{codeCopied === 'ok' ? copy.codeCopied : copy.copyCode}</span>
            </button>
            <span className="visually-hidden" role="status">
              {codeCopied && (codeCopied === 'ok' ? copy.codeCopied : copy.codeCopyFailed)}
            </span>
          </div>
          {meta && <p className="order-recap__meta">{meta}</p>}
        </div>

        <p className="order-sent__retry">
          <span>{copy.retryLead}</span>
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
          </a>
          <span>{copy.copyLead}</span>
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
