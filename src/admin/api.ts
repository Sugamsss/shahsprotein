import { adminCopy as copy } from '../data/adminCopy';
import type {
  AdminMe, AdminUser, BatchInput, Coupon, CouponInput, CouponUse, CustomerList, EmailList, Kitchen, KitchenEffects,
  KitchenHistoryPage, KitchenSettings, Metrics, Order, OrderChanges, OrderDetail, OrderFilters, OrderInput, OrderPage, OutOfStock, Overview,
  PaymentInput, PayRestInput, PriceChange, Prices, PriorityGiveEffects, RestorePayment, Totals, UpdatedOrder, WriteOffReason,
  WebsiteRequest, WebsiteRequestPage, EntryInput, HomeExtras, IngredientBook, IngredientInput, JournalEntry, JournalFeed,
  JournalLookback, JournalMilestone, JournalMonth, JournalSearch, JournalSearchFilter, Todo, TodoInput, TodoList, WorkDay,
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
/**
 * Every status or priority change answers with `kitchen_effects` and an action_id (other
 * orders may or may not have moved); Undo is undoKitchen(that action_id).
 */
export const updateOrder = (id: string, changes: OrderChanges) =>
  rpc<UpdatedOrder>('update_admin_order', { id, changes });
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
/**
 * The × on a payment, or (`undo`) the Undo of Mark paid / Part payment: then the server also
 * removes the "paid" event that payment wrote. `p_undo` is sent only when true.
 */
export const deletePayment = (id: string, undo = false) =>
  rpc<Order>('delete_admin_payment', { id, undo: undo || undefined });
/** Undo for deletePayment and for `paid: false`: pass the payments as the order listed them. Repeats are skipped. */
export const restorePayments = (orderId: string, payments: RestorePayment[]) =>
  rpc<Order>('restore_admin_payments', {
    order_id: orderId,
    payments: payments.map(({ id, amount, method, note, paid_at }) => ({ id, amount, method, note, paid_at })),
  });

// The kitchen: batches, spare, shelf life. Every change returns its effects; with
// `preview` it runs for real and rolls back, so the preview can't drift from the save.
export const getKitchen = () => rpc<Kitchen>('get_admin_kitchen');
/** "Log a batch": 1 to 10 at once. */
export const logBatches = (batches: BatchInput[], preview = false) =>
  rpc<KitchenEffects>('log_admin_batches', { batches, preview });
/** Fix a batch's grams or made-on day. */
export const updateBatch = (id: string, changes: { grams?: number; made_on?: string }, preview = false) =>
  rpc<KitchenEffects>('update_admin_batch', { id, changes, preview });
export const deleteBatch = (id: string, preview = false) => rpc<KitchenEffects>('delete_admin_batch', { id, preview });
/** Used up / thrown out: `grams` null is all of the batch's spare. Only when kitchen.can_write_off. */
export const writeOffSpare = (batchId: string, grams: number | null, reason: WriteOffReason) =>
  rpc<KitchenEffects>('write_off_admin_spare', { batch_id: batchId, grams, reason });
/**
 * Undo of any kitchen action (a batch, a write-off, a status move with kitchen_effects).
 * A second call is a no-op. If anything moved since, it fails with a plain message (kind 'message').
 */
export const undoKitchen = (actionId: string) =>
  rpc<{ undone: boolean; kitchen: Kitchen }>('undo_admin_kitchen', { action_id: actionId });
/**
 * A priority order in Cooking takes whole packed pouches (same product and size) from non-priority
 * orders in Packing or Ready, newest first; those go back to Cooking unless still covered.
 * `preview` changes nothing. Undo with undoKitchen(action_id). A refusal is a plain 22023 message.
 */
export const givePriority = (orderId: string, preview = false) =>
  rpc<PriorityGiveEffects>('give_admin_priority', { order_id: orderId, preview });
/** Products page: sample weight and shelf life. Returns the kitchen. */
export const setKitchenProduct = (productId: string, settings: KitchenSettings) =>
  rpc<Kitchen>('set_admin_kitchen_product', { product_id: productId, settings });

/**
 * The cooking history, newest first: every batch logged, changed or deleted, and each write-off. Filter by
 * batch or product. Page with `before` (the last entry's `at`). 'missing' until 20261010000000 is live.
 */
export const getKitchenHistory = (filter: { batchId?: string; productId?: string; before?: string; limit?: number } = {}) =>
  rpc<KitchenHistoryPage>('get_admin_kitchen_history', {
    batch_id: filter.batchId,
    product_id: filter.productId,
    before: filter.before,
    limit: filter.limit,
  });

export const getOverview = () => rpc<Overview>('get_admin_overview');
/** Both Homes' numbers: every product per stage, the stages overall with money, and this week against last. */
export const getTotals = () => rpc<Totals>('get_admin_totals');
/** Home's metrics block: Today, Week, Month, Year and Lifetime, each against the same moment last time. 'missing' until 20261001000000 is live. */
export const getMetrics = () => rpc<Metrics>('get_admin_metrics');
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

export const getWebsiteRequests = (filter: { state?: string; search?: string; before?: string; before_id?: string; limit?: number } = {}) =>
  rpc<WebsiteRequestPage>('get_admin_website_requests', filter);
export const getWebsiteRequest = (id: string) => rpc<WebsiteRequest | null>('get_admin_website_request', { id });
export const confirmWebsiteRequest = (id: string, details: object = {}) =>
  rpc<{ state: 'confirmed' | 'dismissed'; order: Order | null }>('confirm_admin_website_request', { id, details });
export const dismissWebsiteRequest = (id: string) =>
  rpc<{ state: 'dismissed' | 'confirmed' }>('dismiss_admin_website_request', { id });

// The journal, to-dos and ingredients (20261026000000). Every one answers 'missing' until
// that migration is live; useJournalAvailable hides their links until then.

/** The feed, newest day first: `limit` days before `before` (default: up to today). */
export const getJournal = (before?: string, limit?: number) => rpc<JournalFeed>('get_admin_journal', { before, limit });
export const getJournalLookback = () => rpc<JournalLookback>('get_admin_journal_lookback');
/** One month, oldest first: the keepsake page. `month` is any day in it. */
export const getJournalMonth = (month: string) => rpc<JournalMonth>('get_admin_journal_month', { month });
export const searchJournal = (filter: JournalSearchFilter) =>
  rpc<JournalSearch>('search_admin_journal', {
    query: filter.query || undefined, author: filter.author, tag: filter.tag,
    kept: filter.kept || undefined, photos: filter.photos || undefined,
  });
/** Hours and ₹ spent per day, for Home's "How it's going". */
export const getWorkDays = () => rpc<WorkDay[]>('get_admin_work_days');
/** The caller's entry for `day` (default today): made if it isn't there, else replaced. */
export const saveJournalEntry = (day: string | null, entry: EntryInput) =>
  rpc<JournalEntry>('save_admin_journal_entry', { day, entry });
/** Their own entry only. Answers with its photo paths, whose files are then removed. */
export const deleteJournalEntry = async (id: string): Promise<void> => {
  const { photos } = await rpc<{ photos: string[] }>('delete_admin_journal_entry', { id });
  if (photos.length) await removePhotoFiles(photos);
};
export const addJournalReply = (entryId: string, body: string) => rpc<JournalEntry>('add_admin_journal_reply', { entry_id: entryId, body });
export const deleteJournalReply = (id: string) => rpc<JournalEntry>('delete_admin_journal_reply', { id });
export const setJournalKept = (entryId: string, kept: boolean) => rpc<JournalEntry>('set_admin_journal_kept', { entry_id: entryId, kept });
export const saveMilestone = (day: string, title: string) => rpc<JournalMilestone>('save_admin_milestone', { day, title });
export const deleteMilestone = (id: string) => rpc<void>('delete_admin_milestone', { id });

const PHOTO_BUCKET = 'journal';

const storage = async () => {
  const supabase = await client;
  if (!supabase) throw new AdminError('unknown', copy.gate.notSetUp);
  return supabase.storage.from(PHOTO_BUCKET);
};

/** Uploads a photo (already made small, journal/photos.ts) to the caller's own entry, then records it. */
export const addJournalPhoto = (entryId: string, photo: { blob: Blob; ext: 'webp' | 'jpg'; width: number; height: number }) =>
  holdUntilDone((async () => {
    const path = `${entryId}/${crypto.randomUUID()}.${photo.ext}`;
    try {
      const bucket = await storage();
      const { error } = await bucket.upload(path, photo.blob, { contentType: photo.blob.type, upsert: false });
      if (error) throw toAdminError(error, Number((error as { statusCode?: string }).statusCode ?? 0));
    } catch (error) {
      throw toAdminError(error);
    }
    return rpc<JournalEntry>('add_admin_journal_photo', { entry_id: entryId, path, width: photo.width, height: photo.height });
  })());

export const removeJournalPhoto = async (id: string): Promise<JournalEntry> => {
  const { path, entry } = await rpc<{ path: string; entry: JournalEntry }>('remove_admin_journal_photo', { id });
  await removePhotoFiles([path]);
  return entry;
};

/** Best effort: a file left behind is harmless (nothing points at it). */
const removePhotoFiles = async (paths: string[]): Promise<void> => {
  try {
    await (await storage()).remove(paths);
  } catch {
    // Leave it.
  }
};

/** Short-lived links to show photos (the bucket is private). Missing ones are left out. */
export const signPhotos = async (paths: string[], seconds: number): Promise<Record<string, string>> => {
  try {
    const { data, error } = await (await storage()).createSignedUrls(paths, seconds);
    if (error) throw error;
    const signed: Record<string, string> = {};
    for (const d of data ?? []) if (d.path && d.signedUrl) signed[d.path] = d.signedUrl;
    return signed;
  } catch (error) {
    throw toAdminError(error);
  }
};

/** Open to-dos and those done in the last week. */
export const getTodos = () => rpc<TodoList>('get_admin_todos');
/** Makes a to-do when `id` is left out; otherwise changes it. */
export const saveTodo = (todo: TodoInput, id?: string) => rpc<Todo>('save_admin_todo', { id: id ?? null, todo });
export const setTodoDone = (id: string, done: boolean) => rpc<Todo>('set_admin_todo_done', { id, done });
/** Hides it; deleteTodo(id, false) is the Undo. */
export const deleteTodo = (id: string, deleted = true) => rpc<Todo>('delete_admin_todo', { id, deleted });

export const getIngredients = () => rpc<IngredientBook>('get_admin_ingredients');
export const saveIngredient = (ingredient: IngredientInput, id?: string) =>
  rpc<IngredientBook>('save_admin_ingredient', { id: id ?? null, ingredient });
/** Several names at once, skipping any already on the list. */
export const addIngredients = (names: string[]) => rpc<IngredientBook>('add_admin_ingredients', { names });
export const deleteIngredient = (id: string) => rpc<IngredientBook>('delete_admin_ingredient', { id });
/** A count by hand; the answer's count_id is for Undo (uncountIngredient). */
export const countIngredient = (id: string, amount: number) => rpc<IngredientBook>('count_admin_ingredient', { id, amount });
export const uncountIngredient = (countId: string) => rpc<IngredientBook>('uncount_admin_ingredient', { count_id: countId });

/** Home: the caller's to-dos due soon, ingredients running low, and whether they've written today. */
export const getHomeExtras = () => rpc<HomeExtras>('get_admin_home_extras');

/** Changes the signed-in admin's password (Settings). */
export const changePassword = async (password: string): Promise<void> => {
  const supabase = await client;
  if (!supabase) throw new AdminError('unknown', copy.gate.notSetUp);
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error.message ? new AdminError('message', error.message) : toAdminError(error, error.status ?? 0);
};
