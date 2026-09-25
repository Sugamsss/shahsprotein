import React, { useId } from 'react';
import { adminCopy as copy } from '../data/adminCopy';

// Small shared parts for the admin screens (spec 2.3): a form field, the load
// error, skeletons. Styles: parts.css.

/**
 * A labelled field. Pass one input (or textarea, select) as the child: Field
 * gives it its id, aria-describedby and aria-invalid, and shows the error in
 * place of the hint. `prefix` sits inside the input (₹), `action` beside it (Paste).
 */
export const Field: React.FC<{
  label: string;
  children: React.ReactElement;
  hint?: string;
  error?: string | null;
  /** A quiet word after the label: "optional", "only you". */
  optional?: string;
  prefix?: string;
  action?: React.ReactNode;
}> = ({ label, children, hint, error, optional, prefix, action }) => {
  const id = useId();
  const note = error || hint;
  const input = React.cloneElement(children, {
    id,
    'aria-describedby': note ? `${id}-note` : undefined,
    'aria-invalid': error ? true : undefined,
  });
  return (
    <div className={`adm-field${prefix ? ' adm-field--prefix' : ''}`}>
      <label htmlFor={id} className="adm-field__label">
        {label}
        {optional && <small>{optional}</small>}
      </label>
      <div className="adm-field__control">
        {prefix && <span className="adm-field__prefix" aria-hidden="true">{prefix}</span>}
        {input}
        {action}
      </div>
      {note && <span id={`${id}-note`} className={error ? 'adm-field__error' : 'adm-field__hint'}>{note}</span>}
    </div>
  );
};

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
