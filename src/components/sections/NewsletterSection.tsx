import React, { useState } from 'react';
import { Container } from '../layout/Container';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { AvatarGroup } from '../ui/AvatarGroup';
import { useWaitlist } from '../../context/WaitlistContext';
import { useScrollReveal } from '../../hooks/useScrollReveal';
import { Mail } from 'lucide-react';

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
      id="waitlist"
      ref={sectionRef}
      className="reveal newsletter-section"
      aria-label="Newsletter Subscription"
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
        <div>
          <Card
              style={{
                textAlign: 'center',
              padding: 'var(--space-12) var(--space-6)',
              maxWidth: '840px',
              margin: '0 auto',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: 'var(--radius-full)',
                backgroundColor: 'var(--color-bg-badge)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 'var(--space-4)',
              }}
            >
              <Mail size={24} color="var(--color-text-accent)" />
            </div>

            <h2
              style={{
                fontSize: 'var(--font-size-3xl)',
                color: 'var(--color-text-primary)',
                marginBottom: 'var(--space-2)',
              }}
            >
              Be the first to know.
            </h2>

            <p
              style={{
                fontSize: 'var(--font-size-md)',
                color: 'var(--color-text-secondary)',
                marginBottom: 'var(--space-8)',
              }}
            >
              New products, early access, and exclusive updates.
            </p>

            <form
              onSubmit={handleSubmit}
              className="hero-form waitlist-form"
              style={{
                 maxWidth: '520px',
                 margin: '0 auto var(--space-3)',
              }}
            >
              <div style={{ flex: 1, minWidth: '0' }}>
                <Input
                  type="email"
                  placeholder="Enter your email address"
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
                disabled={isLoading}
                style={{
                  padding: '0.7rem 1.25rem',
                  fontSize: 'var(--font-size-sm)',
                  whiteSpace: 'nowrap',
                }}
              >
                {isLoading ? 'Joining...' : 'Join Waitlist \u2192'}
              </Button>
              <label className="waitlist-consent">
                <input type="checkbox" checked={marketingConsent} onChange={(e) => setMarketingConsent(e.target.checked)} required />
                <span className="waitlist-checkbox" aria-hidden="true" />
                <span className="waitlist-consent__text">I agree to receive an email about the product launch.</span>
              </label>
            </form>

            <div className="waitlist-social-proof" style={{ display: 'flex', justifyContent: 'center' }}>
              <AvatarGroup />
            </div>
          </Card>
        </div>
      </Container>
    </section>
  );
};
