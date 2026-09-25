import type { OrderLine } from '../../types/order';

/** productId + size is a line's identity. */
export const lineKey = (line: Pick<OrderLine, 'productId' | 'size'>): string => `${line.productId}|${line.size}`;
