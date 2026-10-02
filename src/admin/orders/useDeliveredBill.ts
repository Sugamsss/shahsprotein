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

  return {
    billState,
    onDelivered,
    onOpenBill,
    closeBill,
    setBillState,
  };
};
