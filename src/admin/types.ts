// The admin RPCs' JSON, exactly as temp/admin-rebuild/contract.md describes it.
// Timestamps are ISO strings; amounts are whole rupees.

export type OrderStatus = 'new' | 'confirmed' | 'sent' | 'delivered' | 'cancelled';
export type OrderSource = 'site' | 'whatsapp' | 'call' | 'instagram' | 'in_person';
export type OrderView = 'todo' | 'done' | 'all';

export interface AdminMe {
  id: string;
  email: string;
  display_name: string | null;
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
  paid: boolean;
  paid_at: string | null;
  kept: boolean;
  stale: boolean;
  name: string | null;
  pincode: string | null;
  phone: string | null;
  note: string | null;
  amount: number | null;
  coupon: { code: string; valid: boolean; known: boolean } | null;
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
}

export interface OrderPage {
  orders: Order[];
  next_before: string | null;
}

/** update_admin_order: only the keys present change; null clears where allowed. */
export interface OrderChanges {
  status?: OrderStatus;
  paid?: boolean;
  kept?: boolean;
  phone?: string | null;
  amount?: number | null;
  note?: string | null;
  name?: string;
  pincode?: string | null;
}

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
  paid?: boolean;
  created_at?: string;
}

export interface Overview {
  queue: {
    to_confirm: number;
    to_send: { count: number; paid: number };
    to_collect: {
      count: number;
      amount: number;
      without_amount: number;
      oldest: { code: string; name: string | null; since: string } | null;
      people: number;
    };
    on_the_way: { count: number; not_paid: number };
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
