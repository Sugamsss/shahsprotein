import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { useModal } from '../../context/ModalContext';
import { useWaitlist } from '../../context/WaitlistContext';
import { Mail, Sparkles } from 'lucide-react';

export const WaitlistModal: React.FC = () => {
  const { isWaitlistModalOpen, closeWaitlistModal } = useModal();
  const { submitEmail, isLoading, waitlistCount } = useWaitlist();
  const [email, setEmail] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    const res = await submitEmail(email, 'header_modal');
    if (res.success) {
      setEmail('');
      closeWaitlistModal();
    }
  };

  return (
    <Modal isOpen={isWaitlistModalOpen} onClose={closeWaitlistModal} title="Join the VIP Waitlist">
      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            width: '48px',
            height: '48px',
            borderRadius: 'var(--radius-full)',
            backgroundColor: 'var(--color-bg-badge)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '1rem',
          }}
        >
          <Sparkles size={24} color="var(--color-text-accent)" />
        </div>

        <p
          style={{
            color: 'var(--color-text-secondary)',
            fontSize: 'var(--font-size-sm)',
            marginBottom: '1.5rem',
            lineHeight: 1.6,
          }}
        >
          Join <strong style={{ color: 'var(--color-text-primary)' }}>{waitlistCount}+ early members</strong> getting first access to our natural high-protein products + exclusive launch discounts.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <Input
            type="email"
            placeholder="Enter your email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            icon={<Mail size={18} />}
            required
          />
          <Button type="submit" fullWidth disabled={isLoading}>
            {isLoading ? 'Joining...' : 'Get Early Access \u2192'}
          </Button>
        </form>
      </div>
    </Modal>
  );
};
