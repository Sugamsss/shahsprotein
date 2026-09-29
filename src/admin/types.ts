// The admin RPCs' JSON, exactly as the migrations return it (the kitchen flow:
// supabase/migrations/20260929000001_kitchen_flow.sql). Timestamps are ISO
// strings, days are "2026-09-29" (India), amounts are whole rupees, weights grams.

/** Cooking → Packing → Ready → Delivered. Done = delivered and (paid in full, or a free sample order). */
export type OrderStatus = 'cooking' | 'packing' | 'ready' | 'delivered' | 'cancelled';
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
  /**
   * The newest "What's new" note they've seen (20260929000000); null when none.
   * The key is missing on a database without that migration: the admin then keeps it on the device only.
   */
  notes_seen?: string | null;
}

export interface OrderLine {
  product_id: string;
  /** '250 g', '500 g' or 'sample'. */
  size: string;
  quantity: number;
  /** From the server: grams in one pack, fixed when the line was saved (a sample's weight at that moment). */
  grams_each?: number;
}

/** One product of an order in the kitchen: what it needs and what's covered. */
export interface OrderKitchen {
  product_id: string;
  /** Grams the order needs of it (samples included). */
  need: number;
  /** Grams covered: from batches, plus by hand. */
  covered: number;
  /** The part covered by hand (moved on by a person, or an old order), not from a logged batch. */
  by_hand: number;
  /** In Cooking and still short of it. */
  waiting: boolean;
  /** Where its food came from: each batch's made-on day and grams, oldest first. */
  batches: { made_on: string; grams: number }[];
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
  /** Every line is a sample: no total, no coupon, no payments; done once delivered. */
  free_sample: boolean;
  /** Skips the line in the kitchen: fills before the others, never taking food already given. Only matters in Cooking. */
  priority: boolean;
  name: string | null;
  pincode: string | null;
  phone: string | null;
  note: string | null;
  amount: number | null;
  coupon: { code: string; valid: boolean; known: boolean; description: string | null } | null;
  lines: OrderLine[];
  /** Packs, samples left out. */
  packs: number;
  /** Sample packs. */
  samples: number;
  /** Per product, in product id order. */
  kitchen: OrderKitchen[];
  customer: { order_number: number; orders: number } | null;
  created_at: string;
  updated_at: string;
  status_changed_at: string;
}

/** History events. new, confirmed, sent, kept and unkept are only on orders from before the kitchen flow. */
export type OrderEvent =
  | 'created' | OrderStatus | 'paid' | 'unpaid'
  | 'new' | 'confirmed' | 'sent' | 'kept' | 'unkept';

/** Why an auto move happened, when the server knows more. gave_priority: this order gave packed pouches to a priority order. */
export interface HistoryDetail {
  reason: 'gave_priority';
  to_code: string;
  to_name: string | null;
  items: { product_id: string; size: string; count: number }[];
}

export interface OrderDetail extends Order {
  /** auto: moved by the kitchen rules (a batch, spare, an edit), not picked by a person. */
  history: { event: OrderEvent; at: string; by_name: string | null; auto?: boolean; detail?: HistoryDetail | null }[];
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
  /** true: only free sample orders (every line a sample); false: without them. */
  free_sample?: boolean;
  /** true: orders carrying any sample (the Free samples list); false: orders with none. */
  samples?: boolean;
}

export interface OrderPage {
  orders: Order[];
  next_before: string | null;
}

/** update_admin_order: only the keys present change; null clears where allowed. */
export interface OrderChanges {
  status?: OrderStatus;
  /** Only with `status`: Undo puts back when the order entered its old status ("waiting 4 days"). */
  status_changed_at?: string;
  /** true records one payment for whatever is left; false removes every payment (Undo: restorePayments). */
  paid?: boolean;
  /** Only with `paid: true` in the same call. */
  paid_method?: PaidMethod;
  /** Only with `paid_method: 'other'`. */
  paid_note?: string;
  phone?: string | null;
  amount?: number | null;
  note?: string | null;
  name?: string;
  pincode?: string | null;
  /** Skip the line. Undo with the old value (kitchen_effects stays null: it never moves food already given). */
  priority?: boolean;
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
/**
 * update_admin_order's answer: the order, plus what the kitchen did when the status move
 * changed more than this order's status (food back as spare, covered by hand, another
 * order filled). Undo that with undo_admin_kitchen(kitchen_effects.action_id).
 */
export type UpdatedOrder = Order & { kitchen_effects: KitchenEffects | null };

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
  /** Skip the line. Left out: a new order isn't priority, an edit keeps what it had. */
  priority?: boolean;
}

export interface Overview {
  queue: {
    cooking: { count: number; oldest: string | null };
    /** paid is paid in full; part_paid has a payment but not enough. */
    packing: { count: number; paid: number; part_paid: number };
    /** not_paid counts part-paid orders too, never free samples. oldest_since: when the longest-waiting one got Ready. */
    ready: {
      count: number; not_paid: number; part_paid: number; oldest_since: string | null;
      /** The longest-waiting Ready order ("Farah's has waited 4 days"). */
      oldest: { code: string; name: string | null; since: string } | null;
    };
    /** Delivered and not paid in full. Free sample orders are never here. */
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
    /** Orders carrying a sample (free sample orders and paid orders with a taster). */
    /** total: every order carrying a sample, not cancelled (the Free samples list). */
    free_samples: { total: number; open: number; sent_this_month: number; grams_this_month: number };
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
  /** All time. delivered_paid doesn't count free samples; free_samples is delivered free sample orders. */
  done: { delivered_paid: number; free_samples: number; cancelled: number };
}

/** get_admin_totals(): one pack size, lightest first, only sizes with packs. */
export interface TotalsSize { size: string; grams_each: number; packs: number }

/** One product in one stage: orders that contain it, its packs (samples apart) and weight in them. by_size lists 'sample' last. */
export interface TotalsCell { orders: number; packs: number; samples: number; grams: number; by_size: TotalsSize[] }

/** The stages, in Home's order. Every order is in at most one; cancelled and done orders in none. */
export type TotalsStage = 'cooking' | 'packing' | 'ready' | 'to_collect';

/** One stage across all products. Money is per order, so it's only here, never per product. */
export interface TotalsOverall {
  orders: number;
  packs: number;
  samples: number;
  /** Free sample orders in the stage. They never add to the money keys. */
  free_samples: number;
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
  /** Real orders (not cancelled, not a free sample), by created_at. Packs leave samples out. */
  orders: number;
  packs: number;
  /** ₹ that came in during the week: each payment on its own date (20260928000000). */
  amount_in: number;
  /** Orders paid in full in the week (by when the payments covered the total). */
  paid_orders: number;
  paid_without_amount: number;
  /** Payments in the week that were part of a split. Home notes "Part payments count on the day they came in." */
  part_payments: number;
  /** Grams logged in batches made in the week (by made_on). */
  grams_made: number;
  /** Orders carrying a sample, and sample packs. */
  samples: { orders: number; packs: number };
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
    cooking: TotalsOverall;
    packing: TotalsOverall;
    /** First names, oldest first, at most 3. unpaid_names includes the part paid; part_paid_names is just those. */
    ready: TotalsOverall & { unpaid_names: string[]; part_paid_names: string[] };
    to_collect: TotalsOverall & { without_amount_names: string[]; part_paid_names: string[] };
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
  /** The same object as get_admin_kitchen(), so Home stays one call. */
  kitchen: Kitchen;
}

// ---- The kitchen: batches, spare, shelf life (20260929000001) -------------------

/** fresh; near: less than a fifth of its shelf life left (at least 2 days); past: from expires_on on. Past spare never fills an order. */
export type SpareState = 'fresh' | 'near' | 'past';
export type ShelfLifeUnit = 'days' | 'months';
export interface ShelfLife { amount: number; unit: ShelfLifeUnit }

export interface KitchenProduct {
  product_id: string;
  sample_grams: number;
  shelf_life: ShelfLife | null;
  /** Grams still short across Cooking orders. */
  to_cook: number;
  /** The packs those short orders hold, samples last: "250 g × 2 · 500 g × 3". size is '250 g' or 'sample'. */
  waiting_packs: { size: string; grams_each: number; packs: number }[];
  /** The short orders in fill order: priority first, then oldest first. covered: the order's other products that are already covered ("only waiting on this"). */
  queue: {
    order_id: string; code: string; name: string | null; created_at: string; priority: boolean;
    short: number; also_waiting: string[]; covered: string[];
  }[];
  /** Usable spare grams (fresh and near). */
  spare: number;
  /** Every batch with food on the shelf, oldest first, past ones too. grams is what's left of it. expires_on is the first day it's past; "use by" is the day before. */
  spare_batches: { batch_id: string; made_on: string; grams: number; expires_on: string | null; days_left: number | null; state: SpareState }[];
}

export interface KitchenBatch {
  id: string;
  product_id: string;
  grams: number;
  made_on: string;
  created_at: string;
  by_name: string | null;
  /** Grams given to orders. */
  to_orders: number;
  /** How many orders its food went to. */
  orders: number;
  spare: number;
  written_off: number;
}

/** get_admin_kitchen(). */
export interface Kitchen {
  /** This person may mark spare used up / thrown out (the cook, or anyone when nobody is the cook). */
  can_write_off: boolean;
  /** India's today. */
  today: string;
  /** Every kitchen product, by product id. */
  products: KitchenProduct[];
  /** Batches made or logged in the last 14 days, newest first. */
  batches: KitchenBatch[];
}

/**
 * What a kitchen call did (or, with preview, would do). "Covers 4 orders, 200 g left over" is
 * the orders with from 'cooking' to 'packing', plus the batch's spare.
 */
export interface KitchenEffects {
  preview: boolean;
  /** Undo with undoKitchen(action_id). Null on a preview. */
  action_id: string | null;
  batches: { id: string; product_id: string; grams: number; made_on: string; to_orders: number; spare: number; written_off: number; deleted: boolean }[];
  /** Orders whose stage or batch grams changed, oldest first. change is net batch grams per product; waiting is what a Cooking order still waits for. */
  orders: {
    id: string; code: string; name: string | null; from: OrderStatus; to: OrderStatus;
    grams: { product_id: string; change: number }[];
    waiting: string[];
  }[];
  /** The kitchen after it. */
  kitchen: Kitchen;
}

/** give_admin_priority: one packed pouch kind a priority order can take from another order (Packing or Ready, never Delivered). */
export interface PriorityPouch {
  order_id: string; code: string; name: string | null; from: 'packing' | 'ready';
  product_id: string; size: string; grams_each: number; count: number;
}
/** give_admin_priority's answer: the usual effects plus the pouches. `pouches: []` on a preview means nothing to offer. */
export type PriorityGiveEffects = KitchenEffects & { pouches: PriorityPouch[] };

/** log_admin_batches' p_batches: 1 to 10. made_on left out is today. */
export interface BatchInput { product_id: string; grams: number; made_on?: string }
export type WriteOffReason = 'used_up' | 'thrown_out';
/** set_admin_kitchen_product: only the keys present change. */
export interface KitchenSettings { sample_grams?: number; shelf_life?: ShelfLife | null }

export interface Customer {
  phone: string;
  pincode: string | null;
  name: string | null;
  orders: number;
  delivered: number;
  open: number;
  /** Free sample orders; they don't count in orders. */
  samples: number;
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

/** Repeat: a standing offer. One-time: once per phone number (20260928000002). */
export type CouponKind = 'repeat' | 'one_time';

export interface Coupon {
  id: string;
  code: string;
  description: string;
  active: boolean;
  /** Missing on a database without 20260928000002: kinds are off there. */
  kind?: CouponKind;
  expires_at: string | null;
  minimum_note: string | null;
  internal_note: string | null;
  created_at: string;
  updated_at: string;
  /** Only from get_admin_coupons: orders that used it, all time. */
  order_count?: number;
  last_used_at?: string | null;
}

/** A base price: one pack size of one product, whole rupees (20260928000001). */
export interface PriceRow { product_id: string; size: string; price: number }
/** A coupon's own price for a pack. No row: that pack uses the base price. */
export interface CouponPriceRow extends PriceRow { coupon_id: string }
/** get_admin_prices / set_admin_prices. Lists are [] when empty, never null. */
export interface Prices { base: PriceRow[]; coupons: CouponPriceRow[] }
/** One row to set: `coupon_id` null is the base price; `price` null deletes that row. */
export interface PriceChange { coupon_id: string | null; product_id: string; size: string; price: number | null }

export interface CouponInput {
  description: string;
  expires_at: string | null;
  minimum_note: string | null;
  internal_note: string | null;
  /** Only sent where kinds are on; left out, create makes One-time and update keeps the kind. */
  kind?: CouponKind;
}

/** get_admin_coupon_uses: one number's orders that carried a coupon, not cancelled, newest first. */
export interface CouponUse {
  order_id: string;
  order_code: string;
  coupon_code: string;
  created_at: string;
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
