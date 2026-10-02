import { useCallback, useState } from 'react';
import type { Order } from '../types';

export interface DeliveredBillState {
  order: Order;
  moment: 'delivered' | 'again';
}

export const useDeliveredBill = () => {
  const [billState, setBillState] = useState<DeliveredBillState | null>(null);

  const onDelivered = useCallback((order: Order) => {
    setBillState({ order, moment: 'delivered' });
  }, []);

  const onOpenBill = useCallback((order: Order) => {
    setBillState({ order, moment: 'again' });
  }, []);

  const closeBill = useCallback(() => {
    setBillState(null);
  }, []);

  // Owner refreshes may bring a payment/edit or Undo for the bill's order,
  // even after the popup has moved to the next order.
  const syncBill = useCallback((order: Order) => {
    setBillState((state) => {
      if (!state || state.order.id !== order.id) return state;
      if (order.status !== 'delivered') return null;
      return state.order.updated_at === order.updated_at
        ? state
        : { ...state, order };
    });
  }, []);

  return {
    billState,
    onDelivered,
    onOpenBill,
    closeBill,
    syncBill,
  };
};
