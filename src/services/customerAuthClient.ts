import { createClient, type Session } from '@supabase/supabase-js';
import { parseWebsiteQuote } from './offerService';
import type { QuoteLines, QuoteResult } from '../types/offer';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
let client: ReturnType<typeof createClient> | null | undefined;
export const getCustomerAuthClient = () => {
  if (client !== undefined) return client;
  client = url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'shahs-customer-memory' } }) : null;
  return client;
};
export const requestCustomerOtp = async (phone: string) => {
  const supabase = getCustomerAuthClient();
  if (!supabase) return { error: new Error('Authentication is unavailable.') };
  return supabase.auth.signInWithOtp({ phone });
};
export const verifyCustomerOtp = async (phone: string, token: string) => {
  const supabase = getCustomerAuthClient();
  if (!supabase) return { data: { session: null as Session | null }, error: new Error('Authentication is unavailable.') };
  return supabase.auth.verifyOtp({ phone, token, type: 'sms' });
};
export const signOutCustomer = async () => { await getCustomerAuthClient()?.auth.signOut(); };
export const currentCustomerSession = async (): Promise<Session | null> => (await getCustomerAuthClient()?.auth.getSession())?.data.session ?? null;
export const postCustomerQuote = (quoteId: string, code: string, details: { name: string; phone: string; address: import('../types/delivery').DeliveryAddress }): void => {
  const supabase = getCustomerAuthClient();
  if (!supabase) return;
  const sessionPromise = supabase.auth.getSession();
  void sessionPromise.then(({ data }) => {
    const base = url;
    if (!base || !key) return;
    try { fetch(`${base}/rest/v1/rpc/submit_website_request_v2`, { method: 'POST', keepalive: true, headers: { apikey: key, Authorization: `Bearer ${data.session?.access_token ?? key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_quote_id: quoteId, p_code: code, p_name: details.name, p_phone: details.phone, p_address: details.address }) }).catch(() => undefined); } catch { /* WhatsApp Send never waits on persistence. */ }
  });
};
export const quoteWithCustomerSession = async (lines: QuoteLines, code: string, coupon: string | null): Promise<QuoteResult> => {
  const auth = getCustomerAuthClient();
  if (!url || !key) return { status: 'unavailable', message: 'Offer could not be confirmed.' };
  const session = (await auth?.auth.getSession())?.data.session;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`${url}/rest/v1/rpc/quote_website_order`, { method: 'POST', signal: controller.signal, headers: { apikey: key, Authorization: `Bearer ${session?.access_token ?? key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_code: code, p_lines: lines.map((line) => ({ product_id: line.productId, size: line.size, quantity: line.quantity })), p_coupon: coupon }) });
    const data: unknown = response.ok ? await response.json() : null;
    const quote = parseWebsiteQuote(data, lines.length);
    const covers = quote && lines.every((line) => quote.lines.some((priced) => priced.product_id === line.productId
      && priced.size === line.size && priced.quantity === line.quantity));
    if (!quote || !covers) return { status: 'unavailable', message: 'Offer could not be confirmed.' };
    const prices = Object.fromEntries(quote.lines.map((line) => [`${line.product_id}|${line.size}`, line.unit_price]));
    return { status: 'ready', quote, prices };
  } catch { return { status: 'unavailable', message: 'Offer could not be confirmed.' }; }
  finally { window.clearTimeout(timeout); }
};
