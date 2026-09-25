import React, { useState } from 'react';
import { Download } from 'lucide-react';
import { adminCopy } from '../../data/adminCopy';
import { AdminSheet } from '../AdminSheet';
import { getOrders, toAdminError } from '../api';
import { downloadCsv, toCsv } from '../csv';
import { formatPhone, formatTime, istDateValue } from '../format';
import type { Order } from '../types';
import { Segmented } from '../parts';
import { itemsText } from './model';

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
export const ExportSheet: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const [range, setRange] = useState<Range>('month');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const download = async () => {
    setBusy(true);
    setNote('');
    try {
      const orders: Order[] = [];
      let before: string | undefined;
      do {
        const page = await getOrders({ view: 'all', from: fromOf(range), before, limit: 1000 });
        orders.push(...page.orders);
        before = page.next_before ?? undefined;
      } while (before);
      if (!orders.length) setNote(copy.none);
      else downloadCsv(copy.file(istDateValue()), toCsv(copy.columns, orders.map(row)));
    } catch (err) {
      setNote(toAdminError(err).message);
    }
    setBusy(false);
  };

  return (
    <AdminSheet isOpen={isOpen} onClose={onClose} title={copy.title} closeLabel={adminCopy.close}
      bar={
        <button type="button" className="adm-btn adm-btn--primary adm-btn--block" disabled={busy} onClick={download}>
          <Download size={18} aria-hidden="true" />{busy ? copy.busy : copy.download}
        </button>
      }>
      <p className="adm-field__label" aria-hidden="true">{copy.range}</p>
      <Segmented label={copy.range} value={range} onChange={setRange}
        options={(Object.keys(copy.ranges) as Range[]).map((r) => ({ value: r, label: copy.ranges[r] }))} />
      <p className="adm-muted" role="status">{note}</p>
    </AdminSheet>
  );
};
