import React, { useEffect, useId, useRef, useState } from 'react';
import { CheckCircle2, X } from 'lucide-react';
import { AdminService } from '../../services/adminService';
import { AdminCoupon } from '../../types/admin';
import { siteConfig } from '../../data/siteConfig';
import { Button } from '../ui/Button';
import { endOfDayIst, toDateInputValue, todayDateInputValue } from './couponDates';

const DESCRIPTION_MAX = 60;
const MINIMUM_MAX = 120;
const NOTE_MAX = 500;

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface CouponDrawerProps {
  /** The code being edited, or null to add a new one. */
  coupon: AdminCoupon | null;
  onClose: () => void;
  onSaved: (saved: AdminCoupon) => void;
}

// Matches the popup, which adds a full stop to the description when it has none.
const withFullStop = (text: string) => (/[.!?]$/.test(text) ? text : `${text}.`);

const emptyToNull = (value: string) => (value.trim() === '' ? null : value);

const CouponDrawer: React.FC<CouponDrawerProps> = ({ coupon, onClose, onSaved }) => {
  const isEdit = coupon !== null;
  const id = useId();
  const drawerRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  const initialDate = coupon?.expires_at ? toDateInputValue(coupon.expires_at) : '';
  const [code, setCode] = useState(coupon?.code ?? '');
  const [description, setDescription] = useState(coupon?.description ?? '');
  const [endsOn, setEndsOn] = useState(initialDate);
  const [minimumNote, setMinimumNote] = useState(coupon?.minimum_note ?? '');
  const [internalNote, setInternalNote] = useState(coupon?.internal_note ?? '');
  const [active, setActive] = useState(coupon?.active ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Closing mid-save is ignored, so a save always lands with the drawer open.
  const savingRef = useRef(false);
  savingRef.current = saving;
  const requestClose = () => {
    if (!savingRef.current) onClose();
  };

  // Focus the first field on open, keep Tab inside, close on Escape.
  // The page returns focus to the button that opened the drawer.
  const requestCloseRef = useRef(requestClose);
  requestCloseRef.current = requestClose;
  useEffect(() => {
    firstFieldRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        requestCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !drawerRef.current) return;
      const focusables = Array.from(drawerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');

    // An untouched date keeps the stored time exactly, even if it isn't end of day.
    const expiresAt =
      endsOn === ''
        ? null
        : isEdit && endsOn === initialDate
        ? coupon.expires_at
        : endOfDayIst(endsOn);

    const fields = {
      description,
      expires_at: expiresAt,
      minimum_note: emptyToNull(minimumNote),
      internal_note: emptyToNull(internalNote),
    };

    try {
      const saved = isEdit
        ? await AdminService.updateCoupon(coupon.id, { ...fields, active })
        : await AdminService.createCoupon({ ...fields, code });
      onSaved(saved);
    } catch (err) {
      // adminService already turns these into words meant for Pranjali.
      setError(err instanceof Error ? err.message : "Couldn't save the code. Please try again.");
      setSaving(false);
    }
  };

  const previewCode = (isEdit ? coupon.code : code.trim()) || 'CODE';
  const previewDescription = description.trim();
  const titleId = `${id}-title`;
  const field = (name: string) => `${id}-${name}`;

  return (
    <>
      <div className="admin-drawer-overlay" onClick={requestClose} aria-hidden="true" />
      <div
        ref={drawerRef}
        className="admin-drawer admin-coupon-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="admin-drawer-header">
          <h3 id={titleId}>{isEdit ? `Edit ${coupon.code}` : 'Add a code'}</h3>
          <button type="button" className="admin-drawer-close" onClick={requestClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <form className="admin-coupon-form" onSubmit={handleSubmit} noValidate>
          <div className="admin-drawer-body">
            <div className="admin-form admin-coupon-fields">
              {!isEdit && (
                <div className="admin-field">
                  <label className="admin-field__label" htmlFor={field('code')}>Code</label>
                  <input
                    ref={firstFieldRef}
                    id={field('code')}
                    className="input admin-coupon-code-input"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    maxLength={24}
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    aria-describedby={field('code-hint')}
                  />
                  <p className="admin-field__hint" id={field('code-hint')}>
                    3 to 24 letters, numbers or hyphens. You can&apos;t change it later.
                  </p>
                </div>
              )}

              <div className="admin-field">
                <div className="admin-field__label-row">
                  <label className="admin-field__label" htmlFor={field('description')}>What customers see</label>
                  <span className="admin-field__counter" aria-hidden="true">
                    {description.length}/{DESCRIPTION_MAX}
                  </span>
                </div>
                <input
                  ref={isEdit ? firstFieldRef : undefined}
                  id={field('description')}
                  className="input"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={DESCRIPTION_MAX}
                  autoComplete="off"
                  aria-required="true"
                  aria-describedby={field('description-hint')}
                />
                <p className="admin-field__hint" id={field('description-hint')}>
                  Short and with no amount, like &ldquo;10% off your order&rdquo; or &ldquo;Launch offer&rdquo;.
                </p>

                <div className="admin-coupon-preview">
                  <p className="admin-coupon-preview__label">Customers will see:</p>
                  <p className="admin-coupon-chip">
                    <CheckCircle2 size={17} className="admin-coupon-chip__icon" aria-hidden="true" />
                    <span>
                      <strong className="admin-coupon-chip__code">{previewCode}</strong>{' '}
                      {previewDescription ? (
                        <span className="admin-coupon-chip__description">{withFullStop(previewDescription)}</span>
                      ) : (
                        <span className="admin-coupon-chip__placeholder">Your description.</span>
                      )}{' '}
                      {siteConfig.order.couponAppliedNote}
                    </span>
                  </p>
                </div>
              </div>

              <div className="admin-field">
                <label className="admin-field__label" htmlFor={field('ends')}>
                  Ends on <span className="admin-field__optional">(optional)</span>
                </label>
                <input
                  id={field('ends')}
                  type="date"
                  className="input admin-coupon-date-input"
                  value={endsOn}
                  min={isEdit ? undefined : todayDateInputValue()}
                  onChange={(e) => setEndsOn(e.target.value)}
                  aria-describedby={field('ends-hint')}
                />
                <p className="admin-field__hint" id={field('ends-hint')}>
                  Leave empty to keep it running until you turn it off.
                </p>
              </div>

              <div className="admin-field">
                <label className="admin-field__label" htmlFor={field('minimum')}>
                  Minimum, just for you <span className="admin-field__optional">(optional)</span>
                </label>
                <input
                  id={field('minimum')}
                  className="input"
                  value={minimumNote}
                  onChange={(e) => setMinimumNote(e.target.value)}
                  maxLength={MINIMUM_MAX}
                  autoComplete="off"
                  aria-describedby={field('minimum-hint')}
                />
                <p className="admin-field__hint" id={field('minimum-hint')}>
                  For example, &ldquo;2 packs or more&rdquo;. Customers never see this; check it in the chat.
                </p>
              </div>

              <div className="admin-field">
                <label className="admin-field__label" htmlFor={field('note')}>
                  Private note <span className="admin-field__optional">(optional)</span>
                </label>
                <textarea
                  id={field('note')}
                  className="admin-notes-textarea"
                  rows={3}
                  value={internalNote}
                  onChange={(e) => setInternalNote(e.target.value)}
                  maxLength={NOTE_MAX}
                />
              </div>

              {isEdit && (
                <label className="admin-coupon-active">
                  <input
                    type="checkbox"
                    className="admin-checkbox"
                    checked={active}
                    onChange={(e) => setActive(e.target.checked)}
                  />
                  This code is on
                </label>
              )}
            </div>
          </div>

          {error && (
            <p className="admin-error admin-coupon-form__error" role="alert">
              {error}
            </p>
          )}

          <div className="admin-drawer-footer">
            <Button type="button" variant="ghost" size="sm" onClick={requestClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? 'Saving…' : 'Save code'}
            </Button>
          </div>
        </form>
      </div>
    </>
  );
};

export default CouponDrawer;
