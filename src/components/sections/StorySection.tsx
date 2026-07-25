import React from 'react';
import { Container } from '../layout/Container';
import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';
import { siteConfig } from '../../data/siteConfig';
import { useScrollReveal } from '../../hooks/useScrollReveal';

export const StorySection: React.FC = () => {
  const leftRef = useScrollReveal<HTMLDivElement>();
  const rightRef = useScrollReveal<HTMLDivElement>();

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
          <div ref={leftRef} className="reveal reveal-left">
            <Badge style={{ marginBottom: 'var(--space-4)' }}>OUR STORY</Badge>

            <h2
              style={{
                fontSize: 'var(--font-size-3xl)',
                color: 'var(--color-text-primary)',
                marginBottom: 'var(--space-6)',
              }}
            >
              {siteConfig.story.heading}
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
              {siteConfig.story.paragraphs.map((paragraph, index) => {
                const isLast = index === siteConfig.story.paragraphs.length - 1;
                const isBold = isLast && siteConfig.story.boldLastParagraph;

                return (
                  <p
                    key={index}
                    style={
                      isBold
                        ? { fontWeight: 600, color: 'var(--color-text-primary)' }
                        : undefined
                    }
                  >
                    {paragraph}
                  </p>
                );
              })}
            </div>
          </div>

          {/* Story Visual */}
          <div ref={rightRef} className="reveal reveal-right">
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
