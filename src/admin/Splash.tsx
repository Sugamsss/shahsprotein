import React from 'react';
import { useTheme } from '../context/ThemeContext';
import { adminCopy as copy } from '../data/adminCopy';

export const Logo: React.FC<{ className?: string }> = ({ className }) => {
  const { theme } = useTheme();
  return (
    <img
      className={className}
      src={theme === 'dark' ? '/assets/logo-dark-v2.webp' : '/assets/logo-v2.webp'}
      alt={copy.brand}
      width={150}
      height={50}
    />
  );
};

/** The logo over one small card: sign in, loading, no access, can't connect. */
export const Splash: React.FC<{ busy?: boolean; children?: React.ReactNode }> = ({ busy, children }) => (
  <main className="adm adm-splash" aria-busy={busy || undefined}>
    <Logo className="adm-splash__logo" />
    {busy ? (
      <p className="adm-splash__text" role="status">{copy.gate.loading}</p>
    ) : (
      <section className="adm-card adm-splash__card">{children}</section>
    )}
  </main>
);
