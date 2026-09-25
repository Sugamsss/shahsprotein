import React from 'react';
import { Container } from './Container';
import { siteConfig } from '../../data/siteConfig';
import { Mail, Phone } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { OrderLink } from '../ui/OrderLink';
import { OrderButton } from '../order/OrderButton';
import { careCallUrl } from '../../utils/contact';
import { logoSrc } from '../../utils/themeAssets';

const { footer: text } = siteConfig;

export const Footer: React.FC = () => {
  const { theme } = useTheme();

  return (
    <footer className="site-footer">
      <Container>
        <div className="footer-grid">
          {/* Brand Info */}
          <div>
            <img
              src={logoSrc(theme)}
              alt={siteConfig.name}
              width={600}
              height={200}
              loading="lazy"
              className="footer-logo"
            />
            <p className="footer-tagline">
              {siteConfig.tagline}
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h2 className="footer-heading">{text.linksHeading}</h2>
            <ul className="footer-links">
              <li><a href="#products" className="footer-link">{text.products}</a></li>
              <li><a href="#our-story" className="footer-link">{text.story}</a></li>
              <li>
                <OrderButton from="footer" variant="plain" className="footer-link">{siteConfig.orderCta}</OrderButton>
              </li>
              <li><a href="#updates" className="footer-link">{text.updates}</a></li>
            </ul>
          </div>

          {/* Get in touch: every way to reach us, each labelled by what it's for. */}
          <div>
            <h2 className="footer-heading">{text.contactHeading}</h2>
            <ul className="footer-contact">
              <li>
                <OrderLink source="footer" variant="plain" showIcon className="footer-link footer-contact__row">
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
                <a href={`mailto:${siteConfig.social.email}`} className="footer-link footer-contact__row">
                  <Mail size={16} aria-hidden="true" /> {siteConfig.social.email}
                </a>
              </li>
            </ul>
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
