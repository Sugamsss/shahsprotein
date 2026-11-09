import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
interface CustomerAuthValue { session: Session | null; loading: boolean; requestOtp: (phone: string) => Promise<boolean>; verifyOtp: (phone: string, token: string) => Promise<boolean>; logout: () => Promise<void> }
const Context = createContext<CustomerAuthValue | null>(null);
export const CustomerAuthProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null); const [loading, setLoading] = useState(true);
  useEffect(() => { let active = true; let unsubscribe: () => void = () => {}; void import('../services/customerAuthClient').then(async (auth) => { const value = await auth.currentCustomerSession(); if (active) { setSession(value); setLoading(false); } const subscription = auth.getCustomerAuthClient()?.auth.onAuthStateChange((_event, next) => setSession(next)).data.subscription; unsubscribe = () => subscription?.unsubscribe(); }); return () => { active = false; unsubscribe(); }; }, []);
  const value = useMemo<CustomerAuthValue>(() => ({ session, loading, requestOtp: async (phone) => !(await (await import('../services/customerAuthClient')).requestCustomerOtp(phone)).error, verifyOtp: async (phone, token) => { const result = await (await import('../services/customerAuthClient')).verifyCustomerOtp(phone, token); if (!result.error) setSession(result.data.session); return !result.error; }, logout: async () => { await (await import('../services/customerAuthClient')).signOutCustomer(); setSession(null); } }), [session, loading]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
};
const guestAuth: CustomerAuthValue = { session: null, loading: false, requestOtp: async () => false, verifyOtp: async () => false, logout: async () => undefined };
export const useCustomerAuth = () => useContext(Context) ?? guestAuth;
