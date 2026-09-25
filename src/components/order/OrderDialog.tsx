import React, { useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { useOrder } from '../../context/OrderContext';
import { siteConfig } from '../../data/siteConfig';
import { LazyOrderPanel, preloadOrderPanel } from './orderPanelLoader';

/** Loads the popup body once the page has settled, so the first open is instant. */
const usePreloadWhenIdle = () => {
  useEffect(() => {
    let cancelled = false;
    let idleId: number | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const run = () => {
      if (cancelled) return;
      void preloadOrderPanel().catch(() => {});
    };
    const schedule = () => {
      if ('requestIdleCallback' in window) idleId = window.requestIdleCallback(run, { timeout: 4000 });
      else timer = setTimeout(run, 1500);
    };

    if (document.readyState === 'complete') schedule();
    else window.addEventListener('load', schedule, { once: true });

    return () => {
      cancelled = true;
      window.removeEventListener('load', schedule);
      if (idleId !== undefined) window.cancelIdleCallback(idleId);
      if (timer) clearTimeout(timer);
    };
  }, []);
};

/**
 * "Your order", opened from the header, hero, banner, footer and product cards.
 * The product popup's "Add to order" switches that popup in place instead
 * (see ProductsSection), so this one stays shut for `product-details`.
 */
export const OrderDialog: React.FC = () => {
  const { isOpen, openedFrom, closeOrder } = useOrder();
  usePreloadWhenIdle();

  if (!isOpen || openedFrom === 'product-details') return null;

  return (
    <Modal isOpen onClose={closeOrder} title={siteConfig.order.title} className="order-dialog">
      <React.Suspense fallback={null}>
        <LazyOrderPanel />
      </React.Suspense>
    </Modal>
  );
};
