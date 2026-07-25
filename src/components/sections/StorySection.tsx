import React from 'react';
import { Container } from '../layout/Container';
import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';

export const StorySection: React.FC = () => {
  return (
    <section id="our-story" style={{ paddingTop: 'var(--space-16)', paddingBottom: 'var(--space-16)' }}>
      <Container>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: 'var(--space-12)',
            alignItems: 'center',
          }}
        >
          {/* Story Text */}
          <div>
            <Badge style={{ marginBottom: 'var(--space-4)' }}>OUR STORY</Badge>

            <h2
              style={{
                fontSize: 'var(--font-size-3xl)',
                color: 'var(--color-text-primary)',
                marginBottom: 'var(--space-6)',
              }}
            >
              Why we started Shah's Nutrition.
            </h2>

            <div
              style={{
                color: 'var(--color-text-secondary)',
                fontSize: 'var(--font-size-base)',
                lineHeight: 1.7,
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
              }}
            >
              <p>
                We looked around and realized most nutrition foods were either packed with artificial ingredients, ridiculously expensive, or just didn't taste good.
              </p>
              <p>We wanted to change that.</p>
              <p>
                Shah's Nutrition was born out of a simple idea - to make natural, high quality nutrition that fits into everyday life and is affordable for everyone.
              </p>
              <p style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                This is just the beginning.
              </p>
            </div>
          </div>

          {/* Story Visual */}
          <div>
            <Card style={{ padding: 'var(--space-4)' }}>
              <img
                src="/assets/story-kitchen.png"
                alt="Founders preparing Shah's Nutrition"
                style={{ borderRadius: 'var(--radius-lg)', width: '100%', objectFit: 'cover' }}
              />
            </Card>
          </div>
        </div>
      </Container>
    </section>
  );
};
