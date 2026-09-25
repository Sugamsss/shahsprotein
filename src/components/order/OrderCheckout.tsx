import React, { useId, useRef, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { useOrder } from '../../context/OrderContext';
import { siteConfig } from '../../data/siteConfig';
import { saveOrder } from '../../services/orderService';
import { trackOrderSend } from '../../utils/contact';
import { isValidName, isValidPincode, orderMessageUrl } from '../../utils/orderMessage';
import { WhatsAppIcon } from '../ui/WhatsAppIcon';
import { CouponField } from './CouponField';
import { MessagePreview } from './MessagePreview';

const copy = siteConfig.order;

const prefersReducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

type Field = 'name' | 'pincode';

/** "Your details" (name, pincode, coupon, message preview) and the pinned Send link. */
export const OrderCheckout: React.FC = () => {
  const {
    name, setName, pincode, setPincode, sendLines, currentOrder, currentUrl, markSent, openedFrom,
  } = useOrder();
  const nameRef = useRef<HTMLInputElement>(null);
  const pincodeRef = useRef<HTMLInputElement>(null);
  const sendRef = useRef<HTMLAnchorElement>(null);
  const id = useId();

  // An error shows once someone has typed in a field and left it, or pressed Send.
  // It goes as soon as the field is valid. An untouched field stays quiet until Send.
  const typed = useRef<Record<Field, boolean>>({ name: false, pincode: false });
  const [left, setLeft] = useState<Record<Field, boolean>>({ name: false, pincode: false });
  const [submitted, setSubmitted] = useState(false);

  // Every line is out of stock: there's nothing to send.
  const nothingToSend = sendLines.length === 0;
  const nameOk = isValidName(name);
  const pincodeOk = isValidPincode(pincode);
  const nameError = !nameOk && (submitted || left.name) ? copy.nameMissing : null;
  const pincodeError = !pincodeOk && (submitted || left.pincode)
    ? (pincode ? copy.pincodeInvalid : copy.pincodeMissing)
    : null;

  const leave = (field: Field) => {
    if (typed.current[field]) setLeft((value) => (value[field] ? value : { ...value, [field]: true }));
  };

  const onSend = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!nameOk || !pincodeOk) {
      event.preventDefault();
      setSubmitted(true);
      const field = !nameOk ? nameRef.current : pincodeRef.current;
      if (field) {
        field.focus({ preventScroll: true });
        field.scrollIntoView({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
      }
      return;
    }
    // Rebuilt at click time, so a coupon checked by this same click (its field
    // just lost focus) is in the message. Everything here is synchronous: nothing
    // may wait before the link opens, or iOS and in-app browsers block WhatsApp.
    // The save starts in the background and the message goes either way.
    const order = currentOrder();
    if (order.lines.length === 0) {
      event.preventDefault();
      return;
    }
    const url = orderMessageUrl(order);
    event.currentTarget.href = url;
    saveOrder(order);
    trackOrderSend(openedFrom);
    setTimeout(() => markSent(order, url), 0);
  };

  const nameErrorId = `${id}-name-error`;
  const pincodeNoteId = `${id}-pincode-note`;

  return (
    <>
      <section className="popup-section" aria-label={copy.detailsHeading}>
        <h4>{copy.detailsHeading}</h4>
        <div className="order-fields">
          <div className="order-field">
            <label htmlFor={`${id}-name`} className="order-field__label">{copy.nameLabel}</label>
            <input
              ref={nameRef}
              id={`${id}-name`}
              name="name"
              className="input"
              type="text"
              value={name}
              autoComplete="name"
              maxLength={60}
              enterKeyHint="next"
              aria-invalid={nameError ? true : undefined}
              aria-describedby={nameError ? nameErrorId : undefined}
              onChange={(event) => {
                typed.current.name = true;
                setName(event.target.value);
              }}
              onBlur={() => leave('name')}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  pincodeRef.current?.focus();
                }
              }}
            />
            {nameError && (
              <p id={nameErrorId} className="order-field__error">
                <AlertCircle size={15} aria-hidden="true" />
                <span>{nameError}</span>
              </p>
            )}
          </div>

          <div className="order-field">
            <label htmlFor={`${id}-pincode`} className="order-field__label">{copy.pincodeLabel}</label>
            <input
              ref={pincodeRef}
              id={`${id}-pincode`}
              name="postal-code"
              className="input"
              type="text"
              value={pincode}
              inputMode="numeric"
              autoComplete="postal-code"
              maxLength={6}
              enterKeyHint="send"
              aria-invalid={pincodeError ? true : undefined}
              aria-describedby={pincodeNoteId}
              onChange={(event) => {
                typed.current.pincode = true;
                setPincode(event.target.value);
              }}
              onBlur={() => leave('pincode')}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  sendRef.current?.click();
                }
              }}
            />
            {pincodeError ? (
              <p id={pincodeNoteId} className="order-field__error">
                <AlertCircle size={15} aria-hidden="true" />
                <span>{pincodeError}</span>
              </p>
            ) : (
              <p id={pincodeNoteId} className="order-field__hint">{copy.pincodeHint}</p>
            )}
          </div>
        </div>

        <CouponField />
        <MessagePreview />
        <p className="order-privacy">{copy.privacyNote}</p>
      </section>

      <div className="popup-bar order-send">
        {nothingToSend ? (
          <button type="button" className="order-btn order-btn--lg order-send__btn" disabled aria-describedby={`${id}-send-note`}>
            <WhatsAppIcon size={18} />
            <span>{copy.send}</span>
          </button>
        ) : (
          <a
            ref={sendRef}
            href={currentUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="order-btn order-btn--lg order-send__btn"
            onClick={onSend}
          >
            <WhatsAppIcon size={18} />
            <span>{copy.send}</span>
          </a>
        )}
        <p id={`${id}-send-note`} className="order-send__note">{nothingToSend ? copy.allOutNote : copy.sendNote}</p>
      </div>
    </>
  );
};
