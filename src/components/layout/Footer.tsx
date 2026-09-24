import React from 'react';
import { Container } from './Container';
import { siteConfig } from '../../data/siteConfig';
import { Instagram, Mail, Phone } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { OrderLink } from '../ui/OrderLink';
import { careCallUrl } from '../../utils/contact';

export const Footer: React.FC = () => {
  const { theme } = useTheme();

  return (
    <footer className="site-footer">
      <Container>
        <div className="footer-grid">
          {/* Brand Info */}
          <div>
            <img
              src={theme === 'dark' ? '/assets/logo-dark.webp' : '/assets/logo.webp'}
              alt={siteConfig.name}
              width={507}
              height={160}
              loading="lazy"
              className="footer-logo"
            />
            <p className="footer-tagline">
              {siteConfig.tagline}
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h2 className="footer-heading">
              Quick Links
            </h2>
            <ul className="footer-links">
              <li><a href="#products" className="footer-link">Products</a></li>
              <li><a href="#our-story" className="footer-link">Our Story</a></li>
              <li>
                <OrderLink source="footer" variant="plain" className="footer-link">Order on WhatsApp</OrderLink>
              </li>
              <li><a href="#updates" className="footer-link">Get updates</a></li>
            </ul>
          </div>

          {/* Get in touch: every way to reach us, each labelled by what it's for. */}
          <div>
            <h2 className="footer-heading">
              Get in touch
            </h2>
            <ul className="footer-contact">
              <li>
                <OrderLink source="footer" variant="plain" size="sm" showIcon className="footer-link footer-contact__row">
                  <span className="footer-contact__label">{siteConfig.contact.order.label}</span>{' '}
                  {siteConfig.contact.order.display}
                </OrderLink>
              </li>
              <li>
                <a href={careCallUrl()} className="footer-link footer-contact__row">
                  <Phone size={16} aria-hidden="true" />
                  <span>
                    <span className="footer-contact__label">{siteConfig.contact.care.label}</span>{' '}
                    {siteConfig.contact.care.display}
                  </span>
                </a>
              </li>
              <li>
                <a href={siteConfig.social.instagram} target="_blank" rel="noreferrer" className="footer-link footer-contact__row">
                  <Instagram size={16} aria-hidden="true" /> Instagram
                </a>
              </li>
              <li>
                <a href={`mailto:${siteConfig.social.email}`} className="footer-link footer-contact__row">
                  <Mail size={16} aria-hidden="true" /> {siteConfig.social.email}
                </a>
              </li>
            </ul>
          </div>

          {/* Business Inquiries */}
          <div>
            <h2 className="footer-heading">
              For Business Inquiries
            </h2>
            <p className="footer-business">
              <a href={`mailto:${siteConfig.social.business}`} className="footer-link">
                {siteConfig.social.business}
              </a>
            </p>
          </div>
        </div>

        {/* Bottom Copyright */}
        <div className="footer-copyright">
          {siteConfig.copyright}
        </div>
      </Container>
    </footer>
  );
};
