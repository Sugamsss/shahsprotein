import { adminCopy as copy } from '../data/adminCopy';
import type {
  AdminMe, AdminUser, Coupon, CouponInput, CustomerList, EmailList, Order, OrderChanges,
  OrderDetail, OrderFilters, OrderInput, OrderPage, OutOfStock, Overview,
} from './types';

// One typed wrapper per admin RPC in temp/admin-rebuild/contract.md.
// Every failure becomes an AdminError, so screens only ever check `kind`.

/**
 * supabase-js, requested as soon as the admin chunk runs. It's import()ed,
 * not imported: a lazy chunk that statically needs another chunk makes Vite
 * add its preload helper to the landing entry.
 */
export const client = import('../services/supabaseClient').then((m) => m.supabase);
export const hasSupabaseConfig = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);

export type AdminErrorKind = 'unauthorized' | 'message' | 'rate' | 'network' | 'unknown';

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
  const offline = typeof navigator !== 'undefined' && !navigator.onLine;
  if (status === 0 || offline || error instanceof TypeError) return new AdminError('network');
  return new AdminError('unknown');
};

/** { view: 'todo' } → { p_view: 'todo' }, leaving out keys that aren't set. */
const params = (values: object): Record<string, unknown> =>
  Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined).map(([k, v]) => [`p_${k}`, v]));

const rpc = async <T>(name: string, args?: object): Promise<T> => {
  try {
    const supabase = await client;
    if (!supabase) throw new AdminError('unknown', copy.gate.notSetUp);
    const { data, error, status } = await supabase.rpc(name, args && params(args));
    if (error) throw toAdminError(error, status);
    return data as T;
  } catch (error) {
    throw toAdminError(error);
  }
};

export const getMe = () => rpc<AdminMe>('get_admin_me');
export const getUsers = () => rpc<AdminUser[]>('get_admin_users');

export const getOrders = (filters: OrderFilters = {}) => rpc<OrderPage>('get_admin_orders', filters);
/** null when no order has that code. The code may carry `SN-` or `#`, any case. */
export const getOrder = (code: string) => rpc<OrderDetail | null>('get_admin_order', { code });
export const updateOrder = (id: string, changes: OrderChanges) =>
  rpc<Order>('update_admin_order', { id, changes });
/** Creates an order when `id` is left out; otherwise a full edit. */
export const saveOrder = (order: OrderInput, id?: string) => rpc<Order>('save_admin_order', { id, order });
export const deleteOrder = (id: string) => rpc<void>('delete_admin_order', { id });

export const getOverview = () => rpc<Overview>('get_admin_overview');
export const getCustomers = (search?: string) => rpc<CustomerList>('get_admin_customers', { search });

export const getStock = () => rpc<OutOfStock>('get_product_stock');
export const setStock = (productId: string, size: string, inStock: boolean) =>
  rpc<OutOfStock>('set_admin_stock', { product_id: productId, size, in_stock: inStock });

export const getCoupons = () => rpc<Coupon[]>('get_admin_coupons');
export const createCoupon = (code: string, coupon: CouponInput) =>
  rpc<Coupon>('create_admin_coupon', { code, ...coupon });
export const updateCoupon = (id: string, active: boolean, coupon: CouponInput) =>
  rpc<Coupon>('update_admin_coupon', { id, active, ...coupon });
export const setCouponActive = (id: string, active: boolean) =>
  rpc<Coupon>('set_admin_coupon_active', { id, active });

export const getEmailList = () => rpc<EmailList>('get_admin_email_list');
