import React from 'react';
import { adminCopy as copy } from '../data/adminCopy';

// Small shared states for the admin screens (spec 2.3): load error and skeletons. Styles: parts.css.

/** A screen that couldn't load: the spec's card with Try again. */
export const LoadError: React.FC<{ onRetry: () => void }> = ({ onRetry }) => (
  <section className="adm-card adm-load-error" role="alert">
    <p>{copy.loadError}</p>
    <button type="button" className="adm-btn adm-btn--quiet adm-btn--sm" onClick={onRetry}>
      {copy.gate.retry}
    </button>
  </section>
);

/** Grey placeholder cards while a list loads: `rows` lines in each. */
export const Skeleton: React.FC<{ cards?: number; rows?: number }> = ({ cards = 3, rows = 2 }) => (
  <div className="adm-stack" aria-busy="true" aria-label={copy.loading}>
    {Array.from({ length: cards }, (_, card) => (
      <div key={card} className="adm-card adm-skeleton">
        {Array.from({ length: rows }, (_, row) => <span key={row} />)}
      </div>
    ))}
  </div>
);
