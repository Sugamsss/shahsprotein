import React from 'react';
import { ArrowDown } from 'lucide-react';
import { Container } from '../layout/Container';
import { Badge } from '../ui/Badge';
import { OrderLink } from '../ui/OrderLink';
import { useScrollReveal } from '../../hooks/useScrollReveal';
import { useTheme } from '../../context/ThemeContext';
import { siteConfig } from '../../data/siteConfig';

export const HeroSection: React.FC = () => {
  const { theme } = useTheme();
  const sectionRef = useScrollReveal<HTMLElement>();

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
              <Badge icon={null} className="badge-underline" style={{ marginBottom: 'var(--space-2)' }}>NOW TAKING ORDERS</Badge>
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
              {siteConfig.heroHeading.map((segment, index) => (
                segment.highlight ? (
                  <span key={`${segment.text}-${index}`} className="text-gradient">{segment.text}</span>
                ) : segment.text
              ))}
            </h1>

            <p
              className="hero-stagger-3 hero-motto"
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
          src={theme === 'light'
            ? '/assets/generated-muesli/muesli-hero-current-light.png'
            : '/assets/generated-muesli/muesli-hero-current-dark.png'}
          alt=""
          className="hero-visual-image"
          width={1672}
          height={941}
          loading="eager"
        />
      </div>
    </section>
  );
};
