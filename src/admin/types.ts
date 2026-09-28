// The admin RPCs' JSON, exactly as temp/admin-rebuild/contract.md describes it.
// Timestamps are ISO strings; amounts are whole rupees.

export type OrderStatus = 'new' | 'confirmed' | 'sent' | 'delivered' | 'cancelled';
export type OrderSource = 'site' | 'whatsapp' | 'call' | 'instagram' | 'in_person';
export type OrderView = 'todo' | 'done' | 'all';
/** How a paid order was paid. Old paid orders have none (null). */
export type PaidMethod = 'upi' | 'cash' | 'bank' | 'other';
/** Paid means paid in full: the payments cover the total, or the order has no total. */
export type PaymentState = 'not_paid' | 'part_paid' | 'paid';

/** One payment on an order (20260928000000). Oldest first in `Order.payments`. */
export interface Payment {
  id: string;
  /** Whole rupees. Null only while the order has no total ("paid in full, total not typed"); typing the total fills it in. */
  amount: number | null;
  /** Null only on payments copied from orders paid before methods existed. */
  method: PaidMethod | null;
  /** Only with 'other'. */
  note: string | null;
  /** When the money came in. Home counts it in that week. */
  paid_at: string;
  /** When it was typed in. */
  created_at: string;
  /** Who added it: display name, else email; null when unknown. */
  by_name: string | null;
}

export interface AdminMe {
  id: string;
  email: string;
  display_name: string | null;
  /** Which Home they see: 'cook' is Pranjali's; anything else, or missing, gets the full admin Home. */
  home_view?: 'cook' | 'admin' | null;
}

export interface OrderLine {
  product_id: string;
  size: string;
  quantity: number;
}

export interface Order {
  id: string;
  code: string;
  message_code: string;
  source: OrderSource;
  status: OrderStatus;
  /** Paid in full. A part-paid order is not paid. */
  paid: boolean;
  /** When the payments first covered the total; null while not paid in full. */
  paid_at: string | null;
  /** The method of the payment that completed it; null while not paid in full, and on old paid orders. */
  paid_method: PaidMethod | null;
  /** Only with 'other': one line, up to 60 characters. */
  paid_note: string | null;
  payment_state: PaymentState;
  payments: Payment[];
  /** Sum of the payments' amounts (0 with none). */
  amount_paid: number;
  /** What's left of the total, never negative; null when there's no total. */
  amount_due: number | null;
  /** Paid over the total; 0 when not over, null when there's no total. */
  amount_extra: number | null;
  kept: boolean;
  stale: boolean;
  name: string | null;
  pincode: string | null;
  phone: string | null;
  note: string | null;
  amount: number | null;
  coupon: { code: string; valid: boolean; known: boolean; description: string | null } | null;
  lines: OrderLine[];
  packs: number;
  customer: { order_number: number; orders: number } | null;
  created_at: string;
  updated_at: string;
  status_changed_at: string;
}

export type OrderEvent =
  | 'created' | OrderStatus | 'paid' | 'unpaid' | 'kept' | 'unkept';

export interface OrderDetail extends Order {
  history: { event: OrderEvent; at: string; by_name: string | null }[];
  phone_suggestion: { phone: string; code: string; created_at: string } | null;
}

export interface OrderFilters {
  view?: OrderView;
  status?: OrderStatus[];
  paid?: boolean;
  search?: string;
  phone?: string;
  source?: OrderSource;
  from?: string;
  to?: string;
  before?: string;
  limit?: number;
  /** Only orders with this product, any size. */
  product?: string;
}

export interface OrderPage {
  orders: Order[];
  next_before: string | null;
}

/** update_admin_order: only the keys present change; null clears where allowed. */
export interface OrderChanges {
  status?: OrderStatus;
  /** true records one payment for whatever is left; false removes every payment (Undo: restorePayments). */
  paid?: boolean;
  /** Only with `paid: true` in the same call. */
  paid_method?: PaidMethod;
  /** Only with `paid_method: 'other'`. */
  paid_note?: string;
  kept?: boolean;
  phone?: string | null;
  amount?: number | null;
  note?: string | null;
  name?: string;
  pincode?: string | null;
}

/** add_admin_payment: "Part payment…". The order needs a total first. */
export interface PaymentInput {
  /** Whole rupees, 1 to 10,00,000. More than what's due is fine (it shows as extra). */
  amount: number;
  method: PaidMethod;
  /** Only with 'other'. */
  note?: string;
  /** ISO timestamp; left out means now. Not in the future. */
  paid_at?: string;
}

/** pay_admin_order_rest: "Mark paid", one payment for whatever is left. */
export type PayRestInput = Omit<PaymentInput, 'amount'>;

/** restore_admin_payments (Undo): payments as the order listed them, same ids. */
export type RestorePayment = Pick<Payment, 'id' | 'amount' | 'method' | 'note' | 'paid_at'>;

/** save_admin_order's p_order. On edit, code, status, paid and created_at are ignored. */
export interface OrderInput {
  source: OrderSource;
  code?: string | null;
  name?: string | null;
  phone?: string | null;
  pincode?: string | null;
  note?: string | null;
  amount?: number | null;
  coupon?: string | null;
  lines: OrderLine[];
  status?: OrderStatus;
  /** New orders only: one payment for the whole total (or none typed), dated now. */
  paid?: boolean;
  /** New orders only, with `paid: true`; `paid_note` only with 'other'. */
  paid_method?: PaidMethod;
  paid_note?: string;
  created_at?: string;
}

export interface Overview {
  queue: {
    to_confirm: number;
    /** paid is paid in full; part_paid has a payment but not enough (20260928000000). */
    to_send: { count: number; paid: number; part_paid: number };
    to_collect: {
      count: number;
      /** The totals quoted on these orders. */
      amount: number;
      /** What's still owed on them (orders with a total). Use this for "₹X to collect". */
      amount_due: number;
      part_paid: number;
      without_amount: number;
      oldest: { code: string; name: string | null; since: string } | null;
      people: number;
    };
    /** not_paid counts part-paid orders too. */
    on_the_way: { count: number; not_paid: number; part_paid: number };
    stale: number;
    to_confirm_oldest: string | null;
    stale_oldest: string | null;
  };
  week: {
    starts_on: string;
    days: { date: string; orders: number; packs: number }[];
    orders: number;
    packs: number;
    delivered: number;
    cancelled: number;
    repeat_customers: number;
    last_week: { orders: number; packs: number };
  };
  selling: { product_id: string; size: string; packs: number; orders: number }[];
  coupons: { code: string; orders: number; last_used_at: string | null }[];
  email: { active: number };
  /** All time. */
  done: { delivered_paid: number; cancelled: number };
}

/** get_admin_totals(): one pack size, lightest first, only sizes with packs. */
export interface TotalsSize { size: string; grams_each: number; packs: number }

/** One product in one stage: orders that contain it, and its packs and weight in them. */
export interface TotalsCell { orders: number; packs: number; grams: number; by_size: TotalsSize[] }

/** The stages, in Home's order. Every order is in at most one; cancelled and done orders in none. */
export type TotalsStage = 'to_confirm' | 'to_send' | 'on_the_way' | 'to_collect' | 'stale';

/** One stage across all products. Money is per order, so it's only here, never per product. */
export interface TotalsOverall {
  orders: number;
  packs: number;
  /** ₹ quoted on the stage's orders. */
  amount: number;
  /** Orders with no amount typed yet. */
  without_amount: number;
  /** Paid in full. */
  paid: number;
  /** ₹ quoted on the ones not paid in full. */
  unpaid_amount: number;
  /** ₹ still owed on the stage's orders that have a total (20260928000000). */
  amount_due: number;
  /** Orders with a payment that's not the whole total. */
  part_paid: number;
}

export interface TotalsWeek {
  starts_at: string;
  ends_at: string;
  /** Real orders (confirmed, sent or delivered), by created_at. */
  orders: number;
  packs: number;
  /** ₹ that came in during the week: each payment on its own date (20260928000000). */
  amount_in: number;
  /** Orders paid in full in the week (by when the payments covered the total). */
  paid_orders: number;
  paid_without_amount: number;
}
export interface TotalsDay { date: string; orders: number; packs: number }
/**
 * This week's amount_in by how each payment was made, zeros included. not_recorded is
 * payments from orders marked paid before methods existed. Payments with no amount add
 * nothing, so the five add up to amount_in.
 */
export type TotalsByMethod = Record<PaidMethod | 'not_recorded', number>;
export interface TotalsWeekProduct { product_id: string; packs: number; orders: number }

/** get_admin_totals(): the numbers behind both Homes (temp/home-totals.md, v2). Zeros, never null. */
export interface Totals {
  as_of: string;
  /** The earliest real order, or null. After last week's start, there's no fair comparison yet. */
  first_order_at: string | null;
  /** Only products with lines in some stage; Home shows all three and uses zeros for the rest. */
  products: { product_id: string; stages: Record<TotalsStage, TotalsCell> }[];
  overall: {
    to_confirm: TotalsOverall;
    to_send: TotalsOverall;
    /** First names, oldest first, at most 3. */
    on_the_way: TotalsOverall & { unpaid_names: string[] };
    to_collect: TotalsOverall & { without_amount_names: string[] };
    /** They never came through, so no money. */
    stale: { orders: number; packs: number };
  };
  weeks: {
    /** Monday 00:00 India time up to now. */
    this: TotalsWeek & {
      days: TotalsDay[];
      by_product: TotalsWeekProduct[];
      /** From 20260926000008; missing on a database without it. */
      amount_by_method?: TotalsByMethod;
    };
    /** The whole of last week. */
    last: TotalsWeek & { days: TotalsDay[] };
    /** Last week up to the same weekday and time, for a fair comparison. */
    last_so_far: TotalsWeek & { by_product: TotalsWeekProduct[] };
  };
}

export interface Customer {
  phone: string;
  pincode: string | null;
  name: string | null;
  orders: number;
  delivered: number;
  open: number;
  first_order_at: string;
  last_order_at: string;
  amount_total: number;
}

export interface CustomerList {
  customers: Customer[];
  without_phone: number;
}

/** Only products and sizes that are out. [] means everything is in stock. */
export type OutOfStock = { product_id: string; size: string; since: string }[];

export interface Coupon {
  id: string;
  code: string;
  description: string;
  active: boolean;
  expires_at: string | null;
  minimum_note: string | null;
  internal_note: string | null;
  created_at: string;
  updated_at: string;
  /** Only from get_admin_coupons: confirmed-and-later orders, all time. */
  order_count?: number;
  last_used_at?: string | null;
}

export interface CouponInput {
  description: string;
  expires_at: string | null;
  minimum_note: string | null;
  internal_note: string | null;
}

export interface EmailList {
  members: {
    id: string;
    email: string;
    source: string | null;
    status: string;
    marketing_consent: boolean;
    signed_up_at: string;
    verified_at: string | null;
    unsubscribed_at: string | null;
  }[];
  stats: {
    total: number;
    active: number;
    unsubscribed: number;
    bounced: number;
    spam: number;
    verified: number;
    marketing_consent: number;
  };
}

export interface AdminUser {
  email: string;
  display_name: string | null;
  created_at: string;
  is_me: boolean;
}
