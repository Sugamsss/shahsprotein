import React, { useId, useState } from 'react';
import { adminCopy as copy } from '../data/adminCopy';
import { AdminSheet } from './AdminSheet';
import { toAdminError } from './api';

// Small shared parts for the admin screens (spec 2.3): a form field, a sheet
// with a form, a segmented switch, the load error, skeletons. Styles: parts.css.

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

/**
 * A sheet whose body is one form and whose pinned bar is its submit button
 * (Coupons' new/edit, Settings' change password). `onSubmit` does the page's
 * own checks (return early to stay) and the save; while it runs the button says
 * `busyLabel`, and if it throws, the server's message shows at the top.
 */
export const SheetForm: React.FC<{
  title: string;
  submitLabel: string;
  busyLabel: string;
  onClose: () => void;
  onSubmit: () => Promise<void>;
  initialFocus?: React.RefObject<HTMLElement>;
  children: React.ReactNode;
}> = ({ title, submitLabel, busyLabel, onClose, onSubmit, initialFocus, children }) => {
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await onSubmit();
    } catch (err) {
      setError(toAdminError(err).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <AdminSheet
      isOpen
      onClose={onClose}
      title={title}
      closeLabel={copy.close}
      initialFocus={initialFocus}
      bar={<button type="submit" form={id} className="adm-btn adm-btn--primary adm-btn--block" disabled={busy}>{busy ? busyLabel : submitLabel}</button>}
    >
      <form id={id} className="adm-form" noValidate onSubmit={submit}>
        {error && <p className="adm-form__error" role="alert">{error}</p>}
        {children}
      </form>
    </AdminSheet>
  );
};

/**
 * A few choices in one pill (Email list's filter, Customers, Appearance): native
 * radios, so arrow keys move between them. The picked one gets the site's white thumb.
 */
export function Segmented<T extends string>({ label, options, value, onChange }: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const name = useId();
  return (
    <fieldset className="adm-segmented">
      <legend className="visually-hidden">{label}</legend>
      {options.map((option) => (
        <label key={option.value}>
          <input type="radio" name={name} checked={option.value === value} onChange={() => onChange(option.value)} />
          <span>{option.label}</span>
        </label>
      ))}
    </fieldset>
  );
}

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
