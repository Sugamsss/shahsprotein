import { adminCopy } from '../../data/adminCopy';
import { firstName, formatBillDate, formatPhone } from '../format';
import type { Coupon, Order, OrderStatus, Prices } from '../types';
import { SAMPLE, productName, sortLines } from './model';
import { couponState } from './quote';

export type BillLine = {
  name: string;
  quantity: number;
  rate: number | null;
  /** Pack size or sample descriptor. */
  detail: string;
  /** Whole rupees. Samples are 0. */
  amount: number;
  sample: boolean;
};

export type BillSum =
  | { kind: 'items'; amount: number }
  | { kind: 'coupon'; code: string; saving: number | null } // null = "Applied", no fake ₹0
  | { kind: 'deliveryOther'; amount: number }
  | { kind: 'adjusted'; amount: number }
  | { kind: 'extraDiscount'; amount: number }
  | { kind: 'advance'; amount: number }
  | { kind: 'deliverySatara' };

export type Bill = {
  code: string;
  date: string; // already formatted, "2 October 2026"
  name: string | null;
  phone: string | null; // already formatPhone'd, or null
  deliverTo: string; // pincode, or "Satara"
  lines: BillLine[];
  sums: BillSum[]; // empty when the total simply equals the items
  total: number;
  balanceDue: number | null;
  payment:
    | { kind: 'paid' }
    | { kind: 'notPaid' }
    | { kind: 'part'; paid: number; due: number }
    | { kind: 'freeSample' };
};

export type BillInput = {
  order: Pick<
    Order,
    | 'code'
    | 'name'
    | 'phone'
    | 'pincode'
    | 'lines'
    | 'coupon'
    | 'amount'
    | 'free_sample'
    | 'payment_state'
    | 'amount_paid'
    | 'amount_due'
    | 'paid'
    | 'status_changed_at'
  > & { status?: OrderStatus; extra_discount?: number | null; advance?: number | null };
  prices: Prices | null;
  coupons: Coupon[] | null;
  now: Date;
};

export function buildBill(input: BillInput): Bill | null {
  const { order, prices, coupons, now } = input;
  const dateValue =
    order.status === 'delivered' && order.status_changed_at
      ? order.status_changed_at
      : now;
  const date = formatBillDate(dateValue);
  const deliverTo =
    order.pincode && order.pincode.trim()
      ? order.pincode.trim()
      : adminCopy.bill.satara;

  const orderedLines = sortLines(order.lines.filter((l) => l.quantity > 0));

  // Free sample order: lines at 0, total 0, no coupon or items row.
  if (order.free_sample) {
    const lines: BillLine[] = orderedLines.map((l) => ({
      name: productName(l.product_id),
      quantity: l.quantity,
      rate: null,
      detail: adminCopy.bill.sample,
      amount: 0,
      sample: true,
    }));
    const sums: BillSum[] = [];
    if (!order.pincode || !order.pincode.trim()) {
      sums.push({ kind: 'deliverySatara' });
    }
    return {
      code: order.code,
      date,
      name: order.name ?? null,
      phone: order.phone ? formatPhone(order.phone) : null,
      deliverTo,
      lines,
      sums,
      total: 0,
      balanceDue: null,
      payment: { kind: 'freeSample' },
    };
  }

  // Live coupon check (same rule as quote)
  const couponCode = order.coupon?.code;
  const coupon =
    couponCode && coupons
      ? coupons.find(
          (c) => c.code.toUpperCase() === couponCode.trim().toUpperCase(),
        )
      : undefined;
  const couponId =
    coupon && couponState(coupon.code, coupons ?? [], now) === 'live'
      ? coupon.id
      : null;

  const lines: BillLine[] = [];
  let missingAnyPrice = false;
  let itemsSum = 0;
  let workedSum = 0;

  for (const l of orderedLines) {
    if (l.size === SAMPLE) {
      lines.push({
        name: productName(l.product_id),
        quantity: l.quantity,
        rate: null,
        detail: adminCopy.bill.sample,
        amount: 0,
        sample: true,
      });
      continue;
    }

    const same = (r: { product_id: string; size: string }) =>
      r.product_id === l.product_id && r.size === l.size;
    const basePrice = prices ? prices.base.find(same)?.price : undefined;
    const couponPrice =
      couponId && prices
        ? prices.coupons.find((r) => r.coupon_id === couponId && same(r))?.price
        : undefined;
    const unitPrice = couponPrice ?? basePrice;

    if (basePrice == null || unitPrice == null) {
      if (typeof order.amount !== 'number') {
        // Missing price and no amount set: cannot build a bill
        return null;
      }
      missingAnyPrice = true;
      lines.push({
        name: productName(l.product_id),
        detail: `${l.size} · ${l.quantity}`,
        amount: 0,
        sample: false,
        quantity: l.quantity,
        rate: null,
      });
    } else {
      const lineAmount = unitPrice * l.quantity;
      lines.push({
        name: productName(l.product_id),
        detail: l.size,
        amount: lineAmount,
        sample: false,
        quantity: l.quantity,
        rate: unitPrice,
      });
      itemsSum += basePrice * l.quantity;
      workedSum += lineAmount;
    }
  }

  const hasPincode = Boolean(order.pincode && order.pincode.trim());
  let total: number;
  let sums: BillSum[] = [];

  if (missingAnyPrice) {
    // Missing prices but typed amount is set
    total = order.amount!;
    if (order.coupon) {
      sums.push({
        kind: 'coupon',
        code: order.coupon.code,
        saving: null,
      });
    }
    if (!hasPincode) {
      sums.push({ kind: 'deliverySatara' });
    }
  } else {
    // All non-sample lines were priced
    total = typeof order.amount === 'number' ? order.amount : workedSum;
    const otherRows: BillSum[] = [];

    if (order.coupon) {
      const saving = itemsSum - workedSum;
      otherRows.push({
        kind: 'coupon',
        code: order.coupon.code,
        saving: saving > 0 ? saving : null,
      });
    }

    if (typeof order.amount === 'number') {
      const gap = order.amount - workedSum;
      if (gap > 0) {
        otherRows.push({ kind: 'deliveryOther', amount: gap });
      } else if (gap < 0) {
        otherRows.push({ kind: 'adjusted', amount: Math.abs(gap) });
      }
    }

    if (!hasPincode) {
      otherRows.push({ kind: 'deliverySatara' });
    }

    if (otherRows.length > 0) {
      sums = [{ kind: 'items', amount: itemsSum }, ...otherRows];
    } else {
      sums = [];
    }
  }

  const extraDiscount = order.extra_discount ?? 0;
  const advance = order.advance ?? 0;
  if (extraDiscount > 0) {
    sums.push({ kind: 'extraDiscount', amount: extraDiscount });
    total = Math.max(0, total - extraDiscount);
  }

  let payment: Bill['payment'];
  if (order.paid) {
    payment = { kind: 'paid' };
  } else if (order.payment_state === 'part_paid') {
    payment = {
      kind: 'part',
      paid: order.amount_paid,
      due: order.amount_due ?? Math.max(0, total - order.amount_paid),
    };
  } else {
    payment = { kind: 'notPaid' };
  }
  if (advance > 0) sums.push({ kind: 'advance', amount: advance });

  return {
    code: order.code,
    date,
    name: order.name ?? null,
    phone: order.phone ? formatPhone(order.phone) : null,
    deliverTo,
    lines,
    sums,
    total,
    balanceDue: advance > 0 ? Math.max(0, total - advance) : null,
    payment,
  };
}

export type BillShare =
  | { kind: 'send' } // share files, has phone
  | { kind: 'share' } // share files, no phone
  | { kind: 'downloadChat' } // no file share, has phone
  | { kind: 'downloadOnly' }; // no file share, no phone

export function billShare(canShareFiles: boolean, hasPhone: boolean): BillShare {
  if (canShareFiles) {
    return hasPhone ? { kind: 'send' } : { kind: 'share' };
  }
  return hasPhone ? { kind: 'downloadChat' } : { kind: 'downloadOnly' };
}

export function billShareText(input: {
  name: string | null;
  code: string;
  total: string | null;
}): string {
  const first = firstName(input.name);
  return adminCopy.bill.shareText({
    name: first,
    code: input.code,
    total: input.total,
  });
}
