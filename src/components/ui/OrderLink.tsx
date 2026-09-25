import React from 'react';
import { WhatsAppIcon } from './WhatsAppIcon';
import { askUrl, orderUrl, trackOrderClick } from '../../utils/contact';

export interface OrderLinkProps {
  /** Where the click came from, for `whatsapp_order_click` (e.g. "faq", "nutrition:muesli"). */
  source: string;
  /** Open the order chat with nothing prefilled, for questions rather than orders. */
  ask?: boolean;
  /** `text` is an inline link; `plain` takes only `className`. */
  variant?: 'text' | 'plain';
  showIcon?: boolean;
  className?: string;
  children: React.ReactNode;
}

/**
 * A link straight to the order chat, for the few places that skip the "Your order"
 * popup (questions, and the order number itself). URL and tracking stay consistent here.
 */
export const OrderLink: React.FC<OrderLinkProps> = ({
  source,
  ask = false,
  variant = 'text',
  showIcon = false,
  className = '',
  children,
}) => (
  <a
    href={ask ? askUrl() : orderUrl()}
    target="_blank"
    rel="noopener noreferrer"
    className={[variant === 'text' && 'order-text-link', className].filter(Boolean).join(' ')}
    onClick={() => trackOrderClick(source)}
  >
    {showIcon && <WhatsAppIcon size={15} />}
    <span>{children}</span>
  </a>
);
