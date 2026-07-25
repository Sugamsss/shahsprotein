import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useModal } from '../../context/ModalContext';
import { useWaitlist } from '../../context/WaitlistContext';
import { Input } from '../ui/Input';
import { Check, Mail } from 'lucide-react';

export const ProductDetailModal: React.FC = () => {
  const { selectedProduct, closeProductModal } = useModal();
  const { submitEmail, isLoading } = useWaitlist();
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  if (!selectedProduct) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    const res = await submitEmail(email, 'product_modal', selectedProduct.id);
    if (res.success) {
      setSubmitted(true);
      setEmail('');
    }
  };

  return (
    <Modal isOpen={!!selectedProduct} onClose={closeProductModal} title={selectedProduct.name}>
      <div>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginBottom: '1rem' }}>
          {selectedProduct.fullDescription}
        </p>

        {/* Features Checklist */}
        <div style={{ marginBottom: '1.5rem' }}>
          <h4 style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
            KEY HIGHLIGHTS
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            {selectedProduct.features.map((feat, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: 'var(--font-size-xs)' }}>
                <Check size={14} color="var(--color-text-accent)" />
                <span style={{ color: 'var(--color-text-primary)' }}>{feat}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Nutrition Table */}
        <div style={{ marginBottom: '1.5rem', backgroundColor: 'var(--color-bg-pill)', padding: '1rem', borderRadius: 'var(--radius-md)' }}>
          <h4 style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginBottom: '0.75rem' }}>
            NUTRITION PER SERVING
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', textAlign: 'center' }}>
            {selectedProduct.nutritionFacts.map((fact, idx) => (
              <div key={idx}>
                <div style={{ fontSize: 'var(--font-size-md)', fontWeight: 700, color: 'var(--color-text-accent)' }}>
                  {fact.value}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>{fact.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Product Waitlist Pre-order */}
        <div style={{ paddingTop: '0.5rem', borderTop: '1px solid var(--color-border-subtle)' }}>
          <h4 style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-primary)', marginBottom: '0.5rem' }}>
            Get Early Launch Access for {selectedProduct.name}
          </h4>

          {submitted ? (
            <div style={{ color: '#22c55e', fontSize: 'var(--font-size-sm)', fontWeight: 500 }}>
              &check; You are on the VIP reservation list!
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '0.5rem' }}>
              <Input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                icon={<Mail size={16} />}
                required
              />
              <Button type="submit" size="sm" disabled={isLoading}>
                Reserve
              </Button>
            </form>
          )}
        </div>
      </div>
    </Modal>
  );
};
