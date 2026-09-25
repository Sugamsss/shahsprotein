import React, { useEffect, useId, useRef } from 'react';
import { AlertCircle, CheckCircle, Info, Loader2, TicketPercent } from 'lucide-react';
import { useOrder } from '../../context/OrderContext';
import { siteConfig } from '../../data/siteConfig';

const copy = siteConfig.order;

/** The server's description as a sentence. */
const asSentence = (text: string): string => (/[.!?]$/.test(text) ? text : `${text}.`);

/**
 * "Have a coupon code?" Checked on Apply, Enter or leaving the field, never while
 * typing. A code that isn't valid never blocks Send; it's just left out.
 */
export const CouponField: React.FC = () => {
  const {
    couponOpen, setCouponOpen, couponInput, setCouponInput, coupon, applyCoupon, removeCoupon,
  } = useOrder();
  const inputRef = useRef<HTMLInputElement>(null);
  const focusField = useRef(false);
  const id = useId();
  const inputId = `${id}-code`;
  const resultId = `${id}-result`;

  // Opening the field or removing a code puts focus in the field once it's there.
  useEffect(() => {
    if (focusField.current && inputRef.current) {
      focusField.current = false;
      inputRef.current.focus();
    }
  });

  const checking = coupon.status === 'checking';
  const applyDisabled = !couponInput || checking;
  const open = couponOpen || couponInput !== '';

  const status = (
    <div className="order-coupon__status" role="status">
      {coupon.status === 'invalid' && (
        <p id={resultId} className="order-coupon__result order-coupon__result--invalid">
          <AlertCircle size={15} aria-hidden="true" />
          <span>{copy.couponInvalid}</span>
        </p>
      )}
      {coupon.status === 'valid' && (
        <span className="visually-hidden">{copy.announceCouponValid(coupon.code, asSentence(coupon.description))}</span>
      )}
      {coupon.status === 'unavailable' && <span className="visually-hidden">{copy.couponUnavailable}</span>}
    </div>
  );

  if (!open) {
    return (
      <div className="order-coupon">
        <button
          type="button"
          className="order-coupon__toggle"
          onClick={() => {
            focusField.current = true;
            setCouponOpen(true);
          }}
        >
          <TicketPercent size={17} aria-hidden="true" />
          {copy.couponToggle}
        </button>
        {status}
      </div>
    );
  }

  const remove = () => {
    focusField.current = true;
    removeCoupon();
    setCouponOpen(true);
  };

  if (coupon.status === 'valid' || coupon.status === 'unavailable') {
    const valid = coupon.status === 'valid';
    return (
      <div className="order-coupon">
        <p className="order-field__label">{copy.couponLabel}</p>
        <div className={`order-coupon__applied${valid ? '' : ' order-coupon__applied--unchecked'}`}>
          {valid ? <CheckCircle size={20} aria-hidden="true" /> : <Info size={20} aria-hidden="true" />}
          <p className="order-coupon__text">
            <strong>{coupon.code}</strong>
            {valid ? (
              <>
                <span className="order-coupon__ok">{asSentence(coupon.description)}</span> {copy.couponAppliedNote}
              </>
            ) : (
              copy.couponUnavailable
            )}
          </p>
          <button type="button" className="order-coupon__remove" onClick={remove}>
            {copy.couponRemove}
          </button>
        </div>
        {status}
      </div>
    );
  }

  const invalid = coupon.status === 'invalid';

  return (
    <div className="order-coupon">
      <label htmlFor={inputId} className="order-field__label">{copy.couponLabel}</label>
      <div className="order-coupon__row">
        <input
          ref={inputRef}
          id={inputId}
          className="input"
          type="text"
          value={couponInput}
          placeholder={copy.couponPlaceholder}
          maxLength={24}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          enterKeyHint="done"
          readOnly={checking}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? resultId : undefined}
          onChange={(event) => setCouponInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              applyCoupon();
            }
          }}
          onBlur={() => {
            if (couponInput) applyCoupon();
          }}
        />
        <button
          type="button"
          className="order-coupon__apply"
          aria-disabled={applyDisabled || undefined}
          onClick={() => {
            if (!applyDisabled) applyCoupon();
          }}
        >
          {checking ? (
            <>
              <Loader2 size={16} className="order-coupon__spinner" aria-hidden="true" />
              {copy.couponChecking}
            </>
          ) : (
            copy.couponApply
          )}
        </button>
      </div>
      {status}
    </div>
  );
};
