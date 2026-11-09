import React, { useId, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useCustomerAuth } from '../../context/CustomerAuthContext';
import { customerLoginCopy } from '../../data/customerAuthCopy';

/** Supabase wants E.164; people type 10 digits, spaces, +91 or 0-prefixed numbers. */
const toE164 = (raw: string): string => {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `+91${digits.slice(1)}`;
  if (digits.startsWith('91') && digits.length === 12) return `+${digits}`;
  return `+${digits}`;
};

const phoneDigits = (raw: string): number => raw.replace(/\D/g, '').length;

export const CustomerLogin: React.FC = () => {
  const { requestOtp, verifyOtp, session } = useCustomerAuth();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const id = useId();
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const rawReturn = params.get('return') || '/';
  const returnTo = rawReturn.startsWith('/') && !rawReturn.startsWith('//') ? rawReturn : '/';

  React.useEffect(() => {
    if (session) navigate(returnTo, { replace: true });
  }, [session, navigate, returnTo]);

  const send = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    const ok = await requestOtp(toE164(phone));
    setBusy(false);
    if (ok) setSent(true);
    else setError(customerLoginCopy.error);
  };

  const confirm = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    const ok = await verifyOtp(toE164(phone), code.trim());
    setBusy(false);
    if (!ok) setError(customerLoginCopy.invalid);
  };

  return (
    <main className="customer-login" aria-labelledby={`${id}-title`}>
      <section className="customer-login__card">
        <Link className="customer-login__back" to="/">{customerLoginCopy.back}</Link>
        <p className="customer-login__eyebrow">{customerLoginCopy.eyebrow}</p>
        <h1 id={`${id}-title`}>{customerLoginCopy.title}</h1>
        <p className="customer-login__body">{customerLoginCopy.body}</p>
        {error && <p className="customer-login__error" role="alert">{error}</p>}

        {!sent ? (
          <form className="customer-login__form" onSubmit={send} noValidate>
            <label className="customer-login__label" htmlFor={`${id}-phone`}>{customerLoginCopy.phone}</label>
            <input
              id={`${id}-phone`}
              className="input"
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              aria-invalid={error ? true : undefined}
              required
            />
            <button type="submit" className="pill-btn pill-btn--primary customer-login__submit" disabled={busy || phoneDigits(phone) < 8}>
              {busy ? customerLoginCopy.sending : customerLoginCopy.send}
            </button>
          </form>
        ) : (
          <form className="customer-login__form" onSubmit={confirm} noValidate>
            <label className="customer-login__label" htmlFor={`${id}-code`}>{customerLoginCopy.code}</label>
            <input
              id={`${id}-code`}
              className="input customer-login__code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              required
            />
            <button type="submit" className="pill-btn pill-btn--primary customer-login__submit" disabled={busy || code.trim().length < 4}>
              {busy ? customerLoginCopy.checking : customerLoginCopy.confirm}
            </button>
            <button type="button" className="customer-login__secondary" disabled={busy} onClick={() => void send()}>
              {customerLoginCopy.resend}
            </button>
          </form>
        )}

        <Link className="customer-login__guest" to={returnTo}>{customerLoginCopy.guest}</Link>
      </section>
    </main>
  );
};
