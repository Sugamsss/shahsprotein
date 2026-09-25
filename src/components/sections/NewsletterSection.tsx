import React, { useEffect, useRef, useState } from 'react';
import { Container } from '../layout/Container';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';
import { OrderButton } from '../order/OrderButton';
import { WhatsAppIcon } from '../ui/WhatsAppIcon';
import { useWaitlist } from '../../context/WaitlistContext';
import { useScrollReveal } from '../../hooks/useScrollReveal';
import { WaitlistService } from '../../services/waitlistService';
import { siteConfig } from '../../data/siteConfig';
import { CheckCircle2, Info, Loader2, Mail } from 'lucide-react';

type FieldError = 'email' | 'consent' | null;
type Outcome = { kind: 'done' | 'already'; email: string } | null;

const { signup } = siteConfig;

/**
 * The end of the page: people who've been convinced land here, so ordering comes
 * first. The email row underneath is for people who aren't ready yet. It still
 * runs the Supabase + Loops double opt-in flow through useWaitlist.
 */
export const NewsletterSection: React.FC = () => {
  const [email, setEmail] = useState('');
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [fieldError, setFieldError] = useState<FieldError>(null);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const outcomeRef = useRef<HTMLDivElement>(null);
  const { submitEmail, isLoading } = useWaitlist();
  const sectionRef = useScrollReveal<HTMLElement>();

  // The form is replaced by the result, so move focus to it rather than losing it.
  useEffect(() => {
    if (outcome) outcomeRef.current?.focus();
  }, [outcome]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;

    if (!WaitlistService.validateEmail(email)) {
      setFieldError('email');
      document.getElementById('waitlist-email')?.focus();
      return;
    }
    if (!marketingConsent) {
      setFieldError('consent');
      document.getElementById('waitlist-consent')?.focus();
      return;
    }

    setFieldError(null);
    const res = await submitEmail(email, 'footer_newsletter', undefined, marketingConsent);
    if (res.success) {
      setOutcome({ kind: res.alreadySubscribed ? 'already' : 'done', email: email.trim() });
      setEmail('');
    }
  };

  const errorText = fieldError === 'email' ? signup.emailError : fieldError === 'consent' ? signup.consentError : '';

  return (
    <section id="order" ref={sectionRef} className="reveal newsletter-section" aria-labelledby="order-heading">
      <div className="newsletter-section__glow" aria-hidden="true" />
      <Container>
        <Card className="order-card">
          <div className="order-card__order">
            <div className="order-card__icon" aria-hidden="true">
              <WhatsAppIcon size={24} />
            </div>

            <h2 id="order-heading" className="order-card__title">Ready to give it a try?</h2>

            <p className="order-card__lead">
              Message us on WhatsApp. We’ll help you choose, and tell you the total with delivery.
            </p>

            <OrderButton from="banner" size="lg">Order on WhatsApp</OrderButton>

            <p className="order-card__reply">{siteConfig.replyTime}</p>

            <p className="order-card__number">
              Or save our order number: <strong>{siteConfig.contact.order.display}</strong>
            </p>
          </div>

          <div id="updates" className="order-card__updates">
            <p className="order-card__updates-intro">Not ready yet? Hear about new launches.</p>

            {outcome ? (
              <div ref={outcomeRef} tabIndex={-1} className="waitlist-outcome" role="status">
                {outcome.kind === 'done' ? (
                  <CheckCircle2 size={20} className="waitlist-outcome__icon" aria-hidden="true" />
                ) : (
                  <Info size={20} className="waitlist-outcome__icon" aria-hidden="true" />
                )}
                <p>
                  <strong>{outcome.kind === 'done' ? signup.doneTitle : signup.alreadyTitle}</strong>{' '}
                  {outcome.kind === 'done' ? signup.doneBody(outcome.email) : signup.alreadyBody}
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="waitlist-form" aria-label="Get email updates" noValidate>
                {/* Consent comes first in the DOM, so the tab order matches what's on screen. */}
                <label className="waitlist-consent">
                  <input
                    id="waitlist-consent"
                    type="checkbox"
                    checked={marketingConsent}
                    onChange={(e) => {
                      setMarketingConsent(e.target.checked);
                      if (e.target.checked && fieldError === 'consent') setFieldError(null);
                    }}
                    aria-invalid={fieldError === 'consent' || undefined}
                    aria-describedby={fieldError === 'consent' ? 'waitlist-error' : undefined}
                  />
                  <span className="waitlist-checkbox" aria-hidden="true" />
                  <span className="waitlist-consent__text">
                    Email me about new products from Shah’s Nutrition. I can unsubscribe anytime.
                  </span>
                </label>
                <div className="waitlist-form__field">
                  <Input
                    id="waitlist-email"
                    type="email"
                    placeholder="Email address"
                    aria-label="Email address"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (fieldError === 'email') setFieldError(null);
                    }}
                    readOnly={isLoading}
                    aria-busy={isLoading || undefined}
                    aria-invalid={fieldError === 'email' || undefined}
                    aria-describedby={fieldError === 'email' ? 'waitlist-error' : undefined}
                    icon={<Mail size={18} />}
                  />
                </div>
                <button type="submit" className="waitlist-submit" disabled={isLoading}>
                  {/* The coupon check's spinner: still under reduced motion. */}
                  {isLoading && <Loader2 size={16} className="order-coupon__spinner" aria-hidden="true" />}
                  {isLoading ? 'Adding you…' : 'Keep me posted'}
                </button>
              </form>
            )}
            {!outcome && (
              <p id="waitlist-error" className="waitlist-error" aria-live="polite">
                {errorText}
              </p>
            )}
          </div>
        </Card>
      </Container>
    </section>
  );
};
