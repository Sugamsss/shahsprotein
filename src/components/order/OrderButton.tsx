import React from 'react';
import { WhatsAppIcon } from '../ui/WhatsAppIcon';
import { useOrder } from '../../context/OrderContext';
import type { OrderPopupOpener } from '../../utils/contact';
import { preloadOrderPanel } from './orderPanelLoader';

export interface OrderButtonProps {
  /** Where it sits. Only Send is tracked, with this as the place the popup was opened from. */
  from: OrderPopupOpener;
  /** `button` is the brand pill; `plain` takes only `className`. Same looks as OrderLink. */
  variant?: 'button' | 'plain';
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  className?: string;
  'aria-label'?: string;
  children: React.ReactNode;
}

/** Warms the popup's chunk the moment someone heads for a button that opens it. */
export const preloadOrderHandlers = {
  onPointerEnter: () => void preloadOrderPanel().catch(() => {}),
  onFocus: () => void preloadOrderPanel().catch(() => {}),
};

/** An "Order on WhatsApp" button that opens "Your order". It tracks nothing itself. */
export const OrderButton: React.FC<OrderButtonProps> = ({
  from,
  variant = 'button',
  size = 'md',
  showIcon = variant === 'button',
  className = '',
  children,
  ...rest
}) => {
  const { openOrder } = useOrder();
  const classes = [variant === 'button' && `order-btn order-btn--${size}`, className].filter(Boolean).join(' ');

  return (
    <button
      type="button"
      aria-haspopup="dialog"
      className={classes}
      onClick={() => openOrder(from)}
      aria-label={rest['aria-label']}
      {...preloadOrderHandlers}
    >
      {showIcon && <WhatsAppIcon size={size === 'sm' ? 15 : 18} />}
      <span>{children}</span>
    </button>
  );
};
