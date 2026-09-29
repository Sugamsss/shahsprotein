import { adminCopy as copy } from '../data/adminCopy';
import type {
  AdminMe, AdminUser, Coupon, CouponInput, CouponUse, CustomerList, EmailList, Order, OrderChanges,
  OrderDetail, OrderFilters, OrderInput, OrderPage, OutOfStock, Overview, PaymentInput, PayRestInput,
  PriceChange, Prices, RestorePayment, Totals,
} from './types';
import { holdUntilDone } from './unsavedWork';

// One typed wrapper per admin RPC in temp/admin-rebuild/contract.md.
// Every failure becomes an AdminError, so screens only ever check `kind`.

/**
 * supabase-js, requested as soon as the admin chunk runs. It's import()ed,
 * not imported: a lazy chunk that statically needs another chunk makes Vite
 * add its preload helper to the landing entry.
 */
export const client = import('../services/supabaseClient').then((m) => m.supabase);
/**
 * The session's access token as the auth listener last saw it (auth.tsx). Right
 * around sign-in, getSession() can briefly come back empty, and supabase-js then
 * sends the anon key: admin RPCs would 401 and the gate would say "can't open
 * the admin" to a real admin. So an admin call uses the session's token, or this
 * one, and never goes out without a user token.
 */
let listenerToken: string | null = null;
export const setAccessToken = (token: string | null): void => { listenerToken = token; };

export const hasSupabaseConfig = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);

/** 'missing': the RPC isn't on this database yet (a migration that isn't live). */
export type AdminErrorKind = 'unauthorized' | 'message' | 'rate' | 'network' | 'missing' | 'unknown';

export class AdminError extends Error {
  constructor(readonly kind: AdminErrorKind, message: string = copy.errors[kind as Exclude<AdminErrorKind, 'message'>]) {
    super(message);
  }
}

interface RpcFailure { message?: string; code?: string }

/**
 * Sorts a failure into one of the kinds. `status` is the HTTP status of a
 * supabase response (0 when the request never got an answer). A thrown error
 * only counts as network when it's fetch's TypeError or the device is offline,
 * so a bug in a screen never reads as "check your connection".
 */
export const toAdminError = (error: unknown, status?: number): AdminError => {
  if (error instanceof AdminError) return error;
  const { message = '', code = '' } = (error ?? {}) as RpcFailure;
  // Not an admin comes back as HTTP 400 / P0001 "Unauthorized"; anon gets 401.
  if (message === 'Unauthorized' || status === 401 || status === 403) return new AdminError('unauthorized');
  if (code === '22023' && message) return new AdminError('message', message);
  if (code === 'PT429' || status === 429) return new AdminError('rate');
  // PostgREST's "no such function": an RPC whose migration isn't live yet.
  if (code === 'PGRST202' || status === 404) return new AdminError('missing');
  const offline = typeof navigator !== 'undefined' && !navigator.onLine;
  if (status === 0 || offline || error instanceof TypeError) return new AdminError('network');
  return new AdminError('unknown');
};

/** { view: 'todo' } → { p_view: 'todo' }, leaving out keys that aren't set. */
const params = (values: object): Record<string, unknown> =>
  Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined).map(([k, v]) => [`p_${k}`, v]));

/** Every admin call holds updates while it's out, so a reload never cuts a save off (unsavedWork.ts). */
const rpc = <T>(name: string, args?: object): Promise<T> => holdUntilDone(send<T>(name, args));

const send = async <T>(name: string, args?: object): Promise<T> => {
  try {
    const supabase = await client;
    if (!supabase) throw new AdminError('unknown', copy.gate.notSetUp);
    // getSession() also refreshes a token that expired while the laptop slept.
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? listenerToken;
    if (!token) throw new AdminError('unauthorized');
    const { data, error, status } = await supabase.rpc(name, args && params(args)).setHeader('Authorization', `Bearer ${token}`);
    if (error) throw toAdminError(error, status);
    return data as T;
  } catch (error) {
    throw toAdminError(error);
  }
};

export const getMe = () => rpc<AdminMe>('get_admin_me');
export const getUsers = () => rpc<AdminUser[]>('get_admin_users');
/** Remembers the newest "What's new" note they've seen. Only where get_admin_me returns notes_seen. */
export const setNotesSeen = (id: string) => rpc<void>('set_admin_notes_seen', { id });

export const getOrders = (filters: OrderFilters = {}) => rpc<OrderPage>('get_admin_orders', filters);
/** null when no order has that code. The code may carry `SN-` or `#`, any case. */
export const getOrder = (code: string) => rpc<OrderDetail | null>('get_admin_order', { code });
export const updateOrder = (id: string, changes: OrderChanges) =>
  rpc<Order>('update_admin_order', { id, changes });
/** Creates an order when `id` is left out; otherwise a full edit. */
export const saveOrder = (order: OrderInput, id?: string) => rpc<Order>('save_admin_order', { id, order });
export const deleteOrder = (id: string) => rpc<void>('delete_admin_order', { id });

// Payments. Each returns the whole order, so a screen just swaps it in.
/** "Part payment…": needs the order's total first. */
export const addPayment = (orderId: string, payment: PaymentInput) =>
  rpc<Order>('add_admin_payment', { order_id: orderId, payment });
/** "Mark paid": one payment for whatever is left. */
export const payRest = (orderId: string, payment: PayRestInput) =>
  rpc<Order>('pay_admin_order_rest', { order_id: orderId, payment });
export const deletePayment = (id: string) => rpc<Order>('delete_admin_payment', { id });
/** Undo for deletePayment and for `paid: false`: pass the payments as the order listed them. Repeats are skipped. */
export const restorePayments = (orderId: string, payments: RestorePayment[]) =>
  rpc<Order>('restore_admin_payments', {
    order_id: orderId,
    payments: payments.map(({ id, amount, method, note, paid_at }) => ({ id, amount, method, note, paid_at })),
  });

export const getOverview = () => rpc<Overview>('get_admin_overview');
/** Both Homes' numbers: every product per stage, the stages overall with money, and this week against last. */
export const getTotals = () => rpc<Totals>('get_admin_totals');
export const getCustomers = (search?: string) => rpc<CustomerList>('get_admin_customers', { search });

export const getStock = () => rpc<OutOfStock>('get_product_stock');
export const setStock = (productId: string, size: string, inStock: boolean) =>
  rpc<OutOfStock>('set_admin_stock', { product_id: productId, size, in_stock: inStock });

/**
 * Admin only: the site, the order popup and the message never see a price. On a
 * database without the prices migration these fail with kind 'missing'.
 */
export const getPrices = () => rpc<Prices>('get_admin_prices');
export const setPrices = (changes: PriceChange[]) => rpc<Prices>('set_admin_prices', { prices: changes });

export const getCoupons = () => rpc<Coupon[]>('get_admin_coupons');
export const createCoupon = (code: string, coupon: CouponInput) =>
  rpc<Coupon>('create_admin_coupon', { code, ...coupon });
export const updateCoupon = (id: string, active: boolean, coupon: CouponInput) =>
  rpc<Coupon>('update_admin_coupon', { id, active, ...coupon });
export const setCouponActive = (id: string, active: boolean) =>
  rpc<Coupon>('set_admin_coupon_active', { id, active });
/** One number's coupon orders (Add order's fill-in and one-time warning). Needs 20260928000002. */
export const getCouponUses = (phone: string) => rpc<CouponUse[]>('get_admin_coupon_uses', { phone });

export const getEmailList = () => rpc<EmailList>('get_admin_email_list');

/** Changes the signed-in admin's password (Settings). */
export const changePassword = async (password: string): Promise<void> => {
  const supabase = await client;
  if (!supabase) throw new AdminError('unknown', copy.gate.notSetUp);
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error.message ? new AdminError('message', error.message) : toAdminError(error, error.status ?? 0);
};
