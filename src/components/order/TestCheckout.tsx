import React, { useState } from 'react';
import type { SentOrder } from '../../context/OrderContext';
import { siteConfig } from '../../data/siteConfig';

const copy = siteConfig.order.testCheckout;

/** TEST ONLY (docs/slice-b-test.md). Hidden unless VITE_TEST_CHECKOUT is "true". */
const enabled = import.meta.env.VITE_TEST_CHECKOUT === 'true';

type Step = 'idle' | 'starting' | 'paid' | 'unconfirmed' | 'failed';

/**
 * Prepaid test-mode payment for the order that was just sent. It exists only
 * when Send froze a priced quote: an unpriced order keeps the WhatsApp path.
 * Every failure falls back to the same WhatsApp message.
 */
export const TestCheckout: React.FC<{ sent: SentOrder }> = ({ sent }) => {
  const [step, setStep] = useState<Step>('idle');
  const quote = sent.quote;
  if (!enabled || !quote || sent.unpriced) return null;

  const start = () => {
    setStep('starting');
    void import('../../services/testCheckout')
      .then(({ startTestPayment }) => startTestPayment(quote.quote_id, {
        onPaid: (verified) => setStep(verified ? 'paid' : 'unconfirmed'),
        onDismiss: () => setStep('idle'),
        onError: () => setStep('failed'),
      }))
      .catch(() => setStep('failed'));
  };

  const fallback = (
    <a href={sent.url} target="_blank" rel="noopener noreferrer" className="order-text-link">
      {copy.fallback}
    </a>
  );

  return (
    <div className="order-test-pay">
      <p className="order-test-pay__lead">{copy.lead}</p>
      <p className="order-test-pay__note">{copy.note}</p>

      {step === 'idle' && (
        <button type="button" className="pill-btn pill-btn--primary order-test-pay__button" onClick={start}>
          {copy.label}
        </button>
      )}

      {step === 'starting' && (
        <p className="order-test-pay__status" role="status">{copy.opening}</p>
      )}

      {step === 'paid' && (
        <p className="order-test-pay__status order-test-pay__status--ok" role="status">{copy.paid}</p>
      )}

      {step === 'unconfirmed' && (
        <div className="order-test-pay__fallback">
          <p className="order-test-pay__status" role="status">{copy.unconfirmed}</p>
          {fallback}
        </div>
      )}

      {step === 'failed' && (
        <div className="order-test-pay__fallback">
          <p className="order-test-pay__status" role="status">{copy.failedLead}</p>
          <div className="order-test-pay__actions">
            {fallback}
            <button type="button" className="order-text-link" onClick={start}>{copy.retry}</button>
          </div>
        </div>
      )}
    </div>
  );
};
