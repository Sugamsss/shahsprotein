import React from 'react';
import { Container } from './Container';
import { siteConfig } from '../../data/siteConfig';
import { Instagram, Mail } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer
      style={{
        backgroundColor: 'var(--color-bg-main)',
        borderTop: '1px solid var(--color-border-subtle)',
        paddingTop: 'var(--space-16)',
        paddingBottom: 'var(--space-8)',
        color: 'var(--color-text-secondary)',
      }}
    >
      <Container>
        <div
          className="footer-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 'var(--space-8)',
            marginBottom: 'var(--space-12)',
          }}
        >
          {/* Brand Info */}
          <div>
            <img
              src="/assets/logo.png"
              alt={siteConfig.name}
              style={{ height: '42px', width: 'auto', marginBottom: 'var(--space-4)' }}
            />
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
              {siteConfig.motto}
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h4 style={{ color: 'var(--color-text-primary)', marginBottom: 'var(--space-4)', fontSize: 'var(--font-size-sm)' }}>
              Quick Links
            </h4>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: 'var(--font-size-xs)' }}>
              <li><a href="#products" className="footer-link">Products</a></li>
              <li><a href="#our-story" className="footer-link">Our Story</a></li>
              <li><a href="#waitlist" className="footer-link">Join Waitlist</a></li>
            </ul>
          </div>

          {/* Follow Us */}
          <div>
            <h4 style={{ color: 'var(--color-text-primary)', marginBottom: 'var(--space-4)', fontSize: 'var(--font-size-sm)' }}>
              Follow Us
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: 'var(--font-size-xs)' }}>
              <a href={siteConfig.social.instagram} target="_blank" rel="noreferrer" className="footer-link" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Instagram size={16} /> Instagram
              </a>
              <a href={`mailto:${siteConfig.social.email}`} className="footer-link" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Mail size={16} /> {siteConfig.social.email}
              </a>
            </div>
          </div>

          {/* Business Inquiries */}
          <div>
            <h4 style={{ color: 'var(--color-text-primary)', marginBottom: 'var(--space-4)', fontSize: 'var(--font-size-sm)' }}>
              For Business Inquiries
            </h4>
            <p style={{ fontSize: 'var(--font-size-xs)' }}>
              <a href={`mailto:${siteConfig.social.business}`} className="footer-link">
                {siteConfig.social.business}
              </a>
            </p>
          </div>
        </div>

        {/* Bottom Copyright */}
        <div
          style={{
            borderTop: '1px solid var(--color-border-subtle)',
            paddingTop: 'var(--space-6)',
            textAlign: 'center',
            fontSize: 'var(--font-size-xs)',
            color: 'var(--color-text-muted)',
          }}
        >
          {siteConfig.copyright}
        </div>
      </Container>
    </footer>
  );
};
