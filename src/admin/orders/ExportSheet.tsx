import React, { useState } from 'react';
import { adminCopy } from '../../data/adminCopy';
import { AdminError, getOrders } from '../api';
import { downloadCsv, toCsv } from '../csv';
import { formatPhone, formatTime, istDateValue } from '../format';
import type { Order } from '../types';
import { Segmented, SheetForm } from '../parts';
import { itemsText, productName } from './model';

const copy = adminCopy.exportOrders;
type Range = keyof typeof copy.ranges;

/** Where each range starts, from midnight India time. */
const fromOf = (range: Range): string | undefined => {
  if (range === 'all') return undefined;
  const day = range === 'month' ? `${istDateValue().slice(0, 7)}-01` : istDateValue(Date.now() - 29 * 86_400_000);
  return `${day}T00:00:00+05:30`;
};

const statusWord = (o: Order) =>
  o.status === 'cancelled' ? adminCopy.orders.cancelled : adminCopy.order.steps[o.status];

const row = (o: Order) => [
  o.code, istDateValue(o.created_at), formatTime(o.created_at), o.name, o.phone && formatPhone(o.phone), o.pincode,
  itemsText(o), o.packs, o.coupon?.code, adminCopy.orders.via[o.source], statusWord(o),
  o.paid ? adminCopy.orders.paid : adminCopy.orders.notPaid, o.paid_at && istDateValue(o.paid_at), o.amount, o.note,
];

/** Export orders (spec 2.5): every order in the range, newest first, paged with next_before. */
export const ExportSheet: React.FC<{ isOpen: boolean; onClose: () => void; product?: string | null }> = ({ isOpen, onClose, product }) => {
  const [range, setRange] = useState<Range>('month');

  const download = async () => {
    const orders: Order[] = [];
    let before: string | undefined;
    do {
      const page = await getOrders({ view: 'all', from: fromOf(range), before, product: product ?? undefined, limit: 1000 });
      orders.push(...page.orders);
      before = page.next_before ?? undefined;
    } while (before);
    if (!orders.length) throw new AdminError('message', copy.none); // SheetForm shows it at the top
    downloadCsv(copy.file(istDateValue()), toCsv(copy.columns, orders.map(row)));
  };

  if (!isOpen) return null;
  return (
    <SheetForm title={copy.title} submitLabel={copy.download} busyLabel={copy.busy} onClose={onClose} onSubmit={download}>
      <p className="adm-field__label" aria-hidden="true">{copy.range}</p>
      <Segmented label={copy.range} value={range} onChange={setRange}
        options={(Object.keys(copy.ranges) as Range[]).map((r) => ({ value: r, label: copy.ranges[r] }))} />
      {/* From a filtered board: the whole order, but only orders with that product. */}
      {product && <p className="adm-muted">{adminCopy.ordersProduct.exportOnly(productName(product))}</p>}
    </SheetForm>
  );
};
