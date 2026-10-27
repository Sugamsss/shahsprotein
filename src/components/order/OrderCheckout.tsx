import React, { useId, useRef, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { useOrder } from '../../context/OrderContext';
import { siteConfig } from '../../data/siteConfig';
import { saveOrder } from '../../services/orderService';
import { trackOrderSend } from '../../utils/contact';
import { isValidName, orderMessageUrl } from '../../utils/orderMessage';
import { WhatsAppIcon } from '../ui/WhatsAppIcon';
import { CouponField } from './CouponField';
import { MessagePreview } from './MessagePreview';
import { DeliveryAddressFields } from './DeliveryAddressFields';
import { cleanPhone, isValidDeliveryAddress } from '../../utils/deliveryAddress';

const copy = siteConfig.order;

const prefersReducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

type Field = 'name' | 'phone';

/** "Your details" (name, pincode, coupon, message preview) and the pinned Send link. */
export const OrderCheckout: React.FC = () => {
  const {
    name, setName, phone, setPhone, address, sendLines, currentOrder, currentUrl, markSent, openedFrom,
  } = useOrder();
  const nameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const sendRef = useRef<HTMLAnchorElement | HTMLButtonElement>(null);
  const id = useId();

  // An error shows once someone has typed in a field and left it, or pressed Send.
  // It goes as soon as the field is valid. An untouched field stays quiet until Send.
  const typed = useRef<Record<Field, boolean>>({ name: false, phone: false });
  const [left, setLeft] = useState<Record<Field, boolean>>({ name: false, phone: false });
  const [submitted, setSubmitted] = useState(false);

  // Every line is out of stock: there's nothing to send.
  const nothingToSend = sendLines.length === 0;
  const nameOk = isValidName(name);
  const phoneOk = /^91[1-9]\d{9}$/.test(cleanPhone(phone));
  const addressOk = isValidDeliveryAddress(address);
  const nameError = !nameOk && (submitted || left.name) ? copy.nameMissing : null;

  const leave = (field: Field) => {
    if (typed.current[field]) setLeft((value) => (value[field] ? value : { ...value, [field]: true }));
  };
  const valid = nameOk && phoneOk && addressOk;

  const onSend = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!nameOk || !phoneOk || !addressOk) {
      event.preventDefault();
      setSubmitted(true);
      const firstAddressKey = (['premises', 'area', 'city', 'state', 'pincode'] as const).find((key) => !address[key].trim() || (key === 'pincode' && !/^[1-9]\d{5}$/.test(address.pincode)));
      const field = !nameOk ? nameRef.current : !phoneOk ? phoneRef.current : document.getElementById(`delivery-${firstAddressKey ?? 'premises'}`) as HTMLInputElement;
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

  return (
    <>
      <section className="popup-section" aria-label={copy.detailsHeading}>
        <h4>{copy.detailsHeading}</h4>
        {/* A real form, so phones offer their saved name, number and address
            (Safari's AutoFill needs one). It never submits: Send is the link below. */}
        <form className="order-details-form" autoComplete="on" noValidate onSubmit={(event) => event.preventDefault()}>
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
                    phoneRef.current?.focus();
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
              <label htmlFor={`${id}-phone`} className="order-field__label">{copy.phoneLabel}</label>
              <input ref={phoneRef} id={`${id}-phone`} name="tel" className="input" type="tel" inputMode="tel" autoComplete="tel" maxLength={20} value={phone}
                aria-invalid={!phoneOk && (submitted || left.phone) || undefined} aria-describedby={`${id}-phone-note`}
                onChange={(event) => { typed.current.phone = true; setPhone(event.target.value); }} onBlur={() => leave('phone')} />
              {!phoneOk && (submitted || left.phone) ? (
                <p id={`${id}-phone-note`} className="order-field__error">
                  <AlertCircle size={15} aria-hidden="true" />
                  <span>{phone ? copy.phoneInvalid : copy.phoneMissing}</span>
                </p>
              ) : <p id={`${id}-phone-note`} className="order-field__hint">{copy.phoneHint}</p>}
            </div>
          </div>
          <DeliveryAddressFields submitted={submitted} />
        </form>

        <CouponField />
        <MessagePreview />
        <p className="order-privacy">{copy.privacyNote}</p>
      </section>

      <div className="popup-bar order-send">
        {nothingToSend ? (
          // Everything left is out: the reason shows above the lines (allBackSoon),
          // and the note below says why Send is off.
          <button type="button" className="order-btn order-btn--lg order-send__btn" disabled aria-describedby={`${id}-send-note`}>
            <WhatsAppIcon size={18} />
            <span>{copy.send}</span>
          </button>
        ) : valid ? (
          <a
            ref={sendRef as React.RefObject<HTMLAnchorElement>}
            href={currentUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="order-btn order-btn--lg order-send__btn"
            onClick={(event) => onSend(event)}
          >
            <WhatsAppIcon size={18} />
            <span>{copy.send}</span>
          </a>
        ) : (
          <button ref={sendRef as React.RefObject<HTMLButtonElement>} type="button" className="order-btn order-btn--lg order-send__btn" onClick={() => {
            setSubmitted(true); const firstAddressKey = (['premises', 'area', 'city', 'state', 'pincode'] as const).find((key) => !address[key].trim() || (key === 'pincode' && !/^[1-9]\d{5}$/.test(address.pincode)));
            const target = !nameOk ? nameRef.current : !phoneOk ? phoneRef.current : document.getElementById(`delivery-${firstAddressKey ?? 'premises'}`) as HTMLInputElement | null;
            target?.focus({ preventScroll: true }); target?.scrollIntoView({ block:'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
          }}><WhatsAppIcon size={18} /><span>{copy.send}</span></button>
        )}
        {/* The "why Send is off" note stays on short screens; the plain hint doesn't. */}
        <p id={`${id}-send-note`} className={`order-send__note${nothingToSend ? ' order-send__note--reason' : ''}`}>
          {nothingToSend ? copy.allOutNote : copy.sendNote}
        </p>
      </div>
    </>
  );
};
