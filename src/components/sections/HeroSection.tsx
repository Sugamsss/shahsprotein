import React from 'react';
import { ArrowDown } from 'lucide-react';
import { Container } from '../layout/Container';
import { Badge } from '../ui/Badge';
import { OrderLink } from '../ui/OrderLink';
import { useTheme } from '../../context/ThemeContext';
import { siteConfig } from '../../data/siteConfig';

export const HeroSection: React.FC = () => {
  const { theme } = useTheme();

  return (
    <section className="snap-section hero-section" aria-label="Hero">
      <Container>
        <div className="hero-grid">
          {/* Hero Content Left (unboxed) */}
          <div className="hero-card-entrance">
            <div className="hero-content">
            <div className="hero-stagger-1">
              <Badge icon={null} className="badge-underline" style={{ marginBottom: 'var(--space-2)' }}>NOW TAKING ORDERS</Badge>
            </div>

            <h1 className="hero-title hero-stagger-2">
              {siteConfig.heroHeading.map((segment, index) => (
                segment.highlight ? (
                  <span key={`${segment.text}-${index}`} className="text-gradient">{segment.text}</span>
                ) : segment.text
              ))}
            </h1>

            <p className="hero-motto hero-stagger-3">
              {siteConfig.motto}
            </p>

            <div className="hero-actions hero-stagger-4">
              <OrderLink source="hero" size="lg" className="hero-actions__order">
                Order on WhatsApp
              </OrderLink>
              <a href="#products" className="hero-actions__range">
                See the range <ArrowDown size={16} aria-hidden="true" />
              </a>
            </div>
            <p className="hero-note hero-stagger-5">Made fresh in small batches. Delivered across India.</p>
            </div>
          </div>
        </div>
      </Container>

      <div className={`hero-visual-space hero-visual-space--${theme}`} aria-hidden="true">
        <img
          // index.html preloads this same URL for the saved theme. Keep the two in sync.
          src={`/assets/generated-muesli/muesli-hero-current-${theme}.webp`}
          alt=""
          className="hero-visual-image"
          width={1672}
          height={941}
          loading="eager"
          // The hero art is the LCP element. React 18 has no typed fetchPriority prop.
          {...{ fetchpriority: 'high' }}
        />
      </div>
    </section>
  );
};
