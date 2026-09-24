import React, { useState } from 'react';
import { Container } from '../layout/Container';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { OrderLink } from '../ui/OrderLink';
import { WhatsAppIcon } from '../ui/WhatsAppIcon';
import { useWaitlist } from '../../context/WaitlistContext';
import { useScrollReveal } from '../../hooks/useScrollReveal';
import { siteConfig } from '../../data/siteConfig';
import { Mail } from 'lucide-react';

/**
 * The end of the page: people who've been convinced land here, so ordering comes
 * first. The email row underneath is for people who aren't ready yet. It still
 * runs the Supabase + Loops double opt-in flow through useWaitlist.
 */
export const NewsletterSection: React.FC = () => {
  const [email, setEmail] = useState('');
  const [marketingConsent, setMarketingConsent] = useState(false);
  const { submitEmail, isLoading } = useWaitlist();
  const sectionRef = useScrollReveal<HTMLElement>();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    const res = await submitEmail(email, 'footer_newsletter', undefined, marketingConsent);
    if (res.success) setEmail('');
  };

  return (
    <section
      id="order"
      ref={sectionRef}
      className="reveal newsletter-section"
      aria-labelledby="order-heading"
      style={{
        position: 'relative',
        overflow: 'visible',
        paddingTop: 'var(--space-12)',
        paddingBottom: 'var(--space-16)',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'var(--color-hero-gradient)',
          filter: 'blur(60px)',
          zIndex: -1,
          pointerEvents: 'none',
        }}
      />
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

            <OrderLink source="banner" size="lg">Order on WhatsApp</OrderLink>

            <p className="order-card__number">
              Or save our order number: <strong>{siteConfig.contact.order.display}</strong>
            </p>
          </div>

          <div id="updates" className="order-card__updates">
            <p className="order-card__updates-intro">Not ready yet? Hear about new launches.</p>

            <form
              onSubmit={handleSubmit}
              className="hero-form waitlist-form"
              aria-label="Get email updates"
              style={{
                maxWidth: '520px',
                margin: '0 auto',
              }}
            >
              <div style={{ flex: 1, minWidth: '0' }}>
                <Input
                  type="email"
                  placeholder="Email address"
                  aria-label="Email address"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  icon={<Mail size={18} />}
                  required
                  style={{
                    paddingTop: '0.7rem',
                    paddingBottom: '0.7rem',
                    fontSize: 'var(--font-size-sm)',
                  }}
                />
              </div>
              <Button
                type="submit"
                variant="secondary"
                disabled={isLoading}
                style={{
                  padding: '0.7rem 1.25rem',
                  fontSize: 'var(--font-size-sm)',
                  whiteSpace: 'nowrap',
                  // The card border token disappears on the light card; match the input instead.
                  borderColor: 'var(--color-border-input)',
                }}
              >
                {isLoading ? 'Adding you…' : 'Keep me posted'}
              </Button>
              <label className="waitlist-consent">
                <input type="checkbox" checked={marketingConsent} onChange={(e) => setMarketingConsent(e.target.checked)} required />
                <span className="waitlist-checkbox" aria-hidden="true" />
                <span className="waitlist-consent__text">
                  Email me about new products from Shah’s Nutrition. I can unsubscribe anytime.
                </span>
              </label>
            </form>
          </div>
        </Card>
      </Container>
    </section>
  );
};
