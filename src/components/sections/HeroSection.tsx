import React, { useState } from 'react';
import { Container } from '../layout/Container';
import { Badge } from '../ui/Badge';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { AvatarGroup } from '../ui/AvatarGroup';
import { useWaitlist } from '../../context/WaitlistContext';
import { useScrollReveal } from '../../hooks/useScrollReveal';
import { useTheme } from '../../context/ThemeContext';
import { Mail } from 'lucide-react';
import { siteConfig } from '../../data/siteConfig';

export const HeroSection: React.FC = () => {
  const [email, setEmail] = useState('');
  const [marketingConsent, setMarketingConsent] = useState(false);
  const { submitEmail, isLoading } = useWaitlist();
  const { theme } = useTheme();
  const sectionRef = useScrollReveal<HTMLElement>();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    const res = await submitEmail(email, 'hero_section', undefined, marketingConsent);
    if (res.success) setEmail('');
  };

  return (
    <section
      ref={sectionRef}
      className="reveal snap-section"
      aria-label="Hero"
       style={{
        minHeight: '100vh',
        paddingTop: 'calc(var(--header-height) + var(--space-10))',
        paddingBottom: 'var(--space-8)',
        justifyContent: 'flex-start',
         // Both themes use a continuous hero canvas. The dark scene is mounted
         // below; light mode uses its own luminous, full-page scene asset.
         background: 'transparent',
         position: 'relative',
         boxSizing: 'border-box',
       }}
    >
      <Container>
        <div className="hero-grid">
          {/* Hero Content Left (unboxed) */}
          <div className="hero-card-entrance">
            <div className="hero-content">
            <div className="hero-stagger-1">
              <Badge icon={null} className="badge-underline" style={{ marginBottom: 'var(--space-2)' }}>OUR GOAL</Badge>
            </div>

            <h1
              className="hero-stagger-2"
              style={{
                fontSize: '2.4rem',
                color: 'var(--color-text-primary)',
                lineHeight: 1.2,
                marginBottom: 'var(--space-3)',
                letterSpacing: '-0.02em',
              }}
            >
              To make <span className="text-gradient">natural, <span style={{ whiteSpace: 'nowrap' }}>high quality</span></span> nutrition available and <span className="text-gradient">affordable</span> to everyone.
            </h1>

            <p
              className="hero-stagger-3"
              style={{
                fontSize: 'var(--font-size-base)',
                color: 'var(--color-text-secondary)',
                marginBottom: '1.25rem',
                maxWidth: '450px',
                lineHeight: 1.5,
              }}
            >
              {siteConfig.motto}
            </p>

            {/* Email Waitlist Form */}
            <form
              onSubmit={handleSubmit}
              className="hero-form waitlist-form hero-stagger-4"
              style={{
                 maxWidth: '500px',
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

            {/* Social Proof */}
            <div className="hero-stagger-5 waitlist-social-proof">
              <AvatarGroup />
            </div>
            </div>
          </div>
        </div>
      </Container>

      {/* Both modes share one product composition; each theme supplies its own
          colour treatment so the hero remains a matched pair. */}
      <div className={`hero-visual-space hero-visual-space--${theme}`} aria-hidden="true">
          <img
            src={theme === 'light' ? '/assets/generated-muesli/muesli-hero-selected-light.png' : '/assets/generated-muesli/muesli-hero-selected.png'}
            alt="Shah's Nutrition muesli with a bowl, seeds, and toasted flakes"
            className="hero-visual-image"
            loading="eager"
          />
      </div>
    </section>
  );
};
