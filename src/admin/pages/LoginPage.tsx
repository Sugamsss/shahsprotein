import React, { useEffect, useState } from 'react';
import { ChevronLeft, Info, X } from 'lucide-react';
import { adminCopy as copy } from '../../data/adminCopy';
import { client } from '../api';
import { forgetSessionEnded, sessionEnded as endedBefore } from '../auth';
import { Splash } from '../Splash';
import { usernameToEmail } from '../username';

const messageFor = (status: number): string => {
  if (status === 429) return copy.errors.rate;
  if (status >= 400 && status < 500) return copy.login.wrong;
  return status === 0 ? copy.errors.network : copy.errors.unknown;
};

// No sign-up and no reset email: admins are added by hand, and sign in with a
// username (see username.ts). On success the auth listener in AdminApp takes
// over and goes back to where they were heading.
const LoginPage: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // The last session ended by itself (spec 2.14 "Session ended"): say so once.
  const [sessionEnded] = useState(endedBefore);
  useEffect(forgetSessionEnded, []);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!username.trim() || !password) {
      setError(copy.login.missing);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const supabase = await client;
      if (!supabase) return;
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: usernameToEmail(username), password });
      if (signInError) setError(messageFor(signInError.status ?? 0));
    } catch {
      setError(copy.errors.network);
    } finally {
      setBusy(false);
    }
  };

  const errorProps = error ? { 'aria-invalid': true, 'aria-describedby': 'adm-login-error' } : {};

  return (
    <Splash footer={<a className="adm-back" href="/"><ChevronLeft size={18} aria-hidden="true" />{copy.login.back}</a>}>
      <form className="adm-login" onSubmit={onSubmit} noValidate>
        <h1 className="adm-login__title">{copy.login.title}</h1>
        <p className="adm-login__sub">{copy.login.sub}</p>
        {sessionEnded && !error && (
          <p className="adm-login__note" role="status"><Info size={18} aria-hidden="true" />{copy.login.sessionEnded}</p>
        )}
        <label className="adm-field">
          <span className="adm-field__label">{copy.login.username}</span>
          <input className="adm-input" type="text" autoComplete="username" autoCapitalize="none"
            autoCorrect="off" spellCheck={false} value={username}
            onChange={(e) => setUsername(e.target.value)} {...errorProps} />
        </label>
        <label className="adm-field">
          <span className="adm-field__label">{copy.login.password}</span>
          <input className="adm-input" type="password" autoComplete="current-password"
            value={password} onChange={(e) => setPassword(e.target.value)} {...errorProps} />
        </label>
        {error && <p id="adm-login-error" className="adm-login__error" role="alert"><X size={18} aria-hidden="true" />{error}</p>}
        <button type="submit" className="adm-btn adm-btn--primary adm-btn--block" disabled={busy}>
          {busy ? copy.login.busy : copy.login.submit}
        </button>
      </form>
    </Splash>
  );
};

export default LoginPage;
