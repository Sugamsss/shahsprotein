import React, { useState } from 'react';
import { Container } from '../layout/Container';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { AvatarGroup } from '../ui/AvatarGroup';
import { useWaitlist } from '../../context/WaitlistContext';
import { Mail } from 'lucide-react';

export const NewsletterSection: React.FC = () => {
  const [email, setEmail] = useState('');
  const { submitEmail, isLoading } = useWaitlist();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    const res = await submitEmail(email, 'footer_newsletter');
    if (res.success) setEmail('');
  };

  return (
    <section id="waitlist" style={{ paddingTop: 'var(--space-12)', paddingBottom: 'var(--space-16)' }}>
      <Container>
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
            style={{
              display: 'flex',
              gap: '0.75rem',
              maxWidth: '480px',
              margin: '0 auto var(--space-6) auto',
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

          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <AvatarGroup />
          </div>
        </Card>
      </Container>
    </section>
  );
};
