import React from 'react';
import { WhatsAppIcon } from './WhatsAppIcon';
import { askUrl, orderUrl, trackOrderClick } from '../../utils/contact';

export interface OrderLinkProps {
  /** Where the click came from, for `whatsapp_order_click` (e.g. "hero", "product:muesli"). */
  source: string;
  /** Prefill the chat for this product. Without it, the general order message is used. */
  productName?: string;
  /** Open the order chat with nothing prefilled, for questions rather than orders. */
  ask?: boolean;
  /** `button` is the brand pill; `text` is an inline link; `plain` takes only `className`. */
  variant?: 'button' | 'text' | 'plain';
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  className?: string;
  'aria-label'?: string;
  children: React.ReactNode;
}

/** Every "order on WhatsApp" link on the page goes through here, so URL and tracking stay consistent. */
export const OrderLink: React.FC<OrderLinkProps> = ({
  source,
  productName,
  ask = false,
  variant = 'button',
  size = 'md',
  showIcon = variant === 'button',
  className = '',
  children,
  ...rest
}) => {
  const classes = [
    variant === 'button' && `order-btn order-btn--${size}`,
    variant === 'text' && 'order-text-link',
    className,
  ].filter(Boolean).join(' ');

  return (
    <a
      href={ask ? askUrl() : orderUrl(productName)}
      target="_blank"
      rel="noopener noreferrer"
      className={classes}
      onClick={() => trackOrderClick(source)}
      aria-label={rest['aria-label']}
    >
      {showIcon && <WhatsAppIcon size={size === 'sm' ? 15 : 18} />}
      <span>{children}</span>
    </a>
  );
};
