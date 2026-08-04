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
    <section
      id="our-story"
      className="snap-section"
      aria-label="Our Story"
      style={{
        minHeight: '100vh',
        paddingTop: 'calc(var(--header-height) + var(--space-8))',
        paddingBottom: 'var(--space-12)',
        boxSizing: 'border-box',
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
          {/* Story Text */}
          <div ref={leftRef} className="reveal reveal-left-far reveal-story-slow">
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
              {siteConfig.story.paragraphs.map((paragraph, index) => (
                <p key={index}>
                  {paragraph.map((segment, segmentIndex) => (
                    segment.highlight ? (
                      <span key={`${segment.text}-${segmentIndex}`} className="story-highlight">
                        {segment.text}
                      </span>
                    ) : segment.text
                  ))}
                </p>
              ))}
            </div>
          </div>

          {/* Story Visual */}
          <div ref={rightRef} className="reveal reveal-right-far reveal-story-slow delay-200">
            <Card style={{ padding: 'var(--space-4)' }}>
              <img
                src="/assets/story-kitchen.png"
                alt="Founders preparing Shah's Nutrition"
                width={1376}
                height={768}
                loading="lazy"
                style={{ borderRadius: 'var(--radius-lg)', width: '100%', objectFit: 'cover' }}
              />
            </Card>
          </div>
        </div>
      </Container>
    </section>
  );
};
