import React, { useState } from 'react';
import { Container } from '../layout/Container';
import { Badge } from '../ui/Badge';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { AvatarGroup } from '../ui/AvatarGroup';
import { useWaitlist } from '../../context/WaitlistContext';
import { useScrollReveal } from '../../hooks/useScrollReveal';
import { Mail } from 'lucide-react';
import { siteConfig } from '../../data/siteConfig';

export const HeroSection: React.FC = () => {
  const [email, setEmail] = useState('');
  const { submitEmail, isLoading } = useWaitlist();
  const sectionRef = useScrollReveal<HTMLElement>();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    const res = await submitEmail(email, 'hero_section');
    if (res.success) setEmail('');
  };

  return (
    <section
      ref={sectionRef}
      className="reveal"
      style={{
        paddingTop: 'calc(var(--section-padding-y) * 0.75)',
        paddingBottom: 'var(--section-padding-y)',
        background: 'var(--color-hero-gradient)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <Container>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))',
            gap: 'var(--space-12)',
            alignItems: 'center',
          }}
        >
          {/* Hero Content Left */}
          <div>
            <Badge style={{ marginBottom: 'var(--space-4)' }}>OUR GOAL</Badge>

            <h1
              style={{
                fontSize: 'var(--font-size-4xl)',
                color: 'var(--color-text-primary)',
                lineHeight: 1.15,
                marginBottom: 'var(--space-4)',
              }}
            >
              To make <span className="text-gradient">natural, high quality</span> nutrition available and affordable to everyone.
            </h1>

            <p
              style={{
                fontSize: 'var(--font-size-md)',
                color: 'var(--color-text-secondary)',
                marginBottom: 'var(--space-8)',
                maxWidth: '540px',
                lineHeight: 1.6,
              }}
            >
              {siteConfig.motto}
            </p>

            {/* Email Waitlist Form */}
            <form
              onSubmit={handleSubmit}
              className="hero-form"
              style={{
                display: 'flex',
                gap: '0.75rem',
                maxWidth: '480px',
                marginBottom: 'var(--space-6)',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ flex: 1, minWidth: '240px' }}>
                <Input
                  type="email"
                  placeholder="Enter your email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  icon={<Mail size={18} />}
                  required
                />
              </div>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? 'Joining...' : 'Join Waitlist \u2192'}
              </Button>
            </form>

            {/* Social Proof */}
            <AvatarGroup />
          </div>

          {/* Hero Visual Right */}
          <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
            <div
              className="glass-card animate-float"
              style={{
                padding: 'var(--space-4)',
                borderRadius: 'var(--radius-xl)',
                maxWidth: '520px',
                width: '100%',
              }}
            >
              <img
                src="/assets/hero-composition.png"
                alt="Shah's Nutrition Product Lineup"
                style={{ borderRadius: 'var(--radius-lg)', width: '100%', objectFit: 'cover' }}
              />
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
};

