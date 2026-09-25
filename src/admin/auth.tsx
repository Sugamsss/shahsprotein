import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { client, getMe } from './api';
import { adminCopy as copy } from '../data/adminCopy';
import { Splash } from './Splash';
import { useRpc } from './useRpc';
import type { AdminMe } from './types';

/** The Supabase session: undefined while it's still being read. */
export const useSession = (): Session | null | undefined => {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    void client.then((supabase) => {
      if (cancelled) return;
      if (!supabase) return setSession(null);
      // Fires INITIAL_SESSION first, then every sign-in, sign-out and refresh.
      const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
      unsubscribe = () => data.subscription.unsubscribe();
    }).catch(() => !cancelled && setSession(null)); // offline: sign-in shows, and says so
    return () => { cancelled = true; unsubscribe?.(); };
  }, []);
  return session;
};

/** Signs out on this device only, so Sunit's phone stays signed in when he leaves the laptop. */
export const signOut = async (): Promise<void> => {
  await (await client)?.auth.signOut({ scope: 'local' });
};

const AdminContext = createContext<AdminMe | null>(null);

/** Who is signed in. Only inside the gate, so it's always there. */
export const useAdminMe = (): AdminMe => {
  const me = useContext(AdminContext);
  if (!me) throw new Error('useAdminMe must be used inside AdminGate');
  return me;
};

const SignOutButton: React.FC = () => (
  <button type="button" className="adm-btn adm-btn--quiet adm-btn--block" onClick={() => void signOut()}>
    {copy.signOut}
  </button>
);

/**
 * Having a session isn't the same as being an admin: get_admin_me() decides.
 * It keys on the user id, so a token refresh doesn't ask again.
 */
export const AdminGate: React.FC<{ userId: string; children: React.ReactNode }> = ({ userId, children }) => {
  const { data: me, error, loading, reload } = useRpc(getMe, [userId]);

  if (me) return <AdminContext.Provider value={me}>{children}</AdminContext.Provider>;

  if (error?.kind === 'unauthorized') {
    return (
      <Splash>
        <p className="adm-splash__text">{copy.gate.noAccess}</p>
        <SignOutButton />
      </Splash>
    );
  }

  if (error) {
    return (
      <Splash>
        <p className="adm-splash__text" role="alert">
          {error.kind === 'network' ? copy.gate.offline : error.message}
        </p>
        <button type="button" className="adm-btn adm-btn--primary adm-btn--block" onClick={reload} disabled={loading}>
          {copy.gate.retry}
        </button>
        <SignOutButton />
      </Splash>
    );
  }

  return <Splash busy />;
};
