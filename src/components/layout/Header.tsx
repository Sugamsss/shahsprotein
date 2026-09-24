import React, { useState, useEffect, useRef } from 'react';
import { ThemeToggle } from '../ui/ThemeToggle';
import { OrderLink } from '../ui/OrderLink';
import { Instagram, Mail, Menu, Moon, Sun, X } from 'lucide-react';
import { siteConfig } from '../../data/siteConfig';
import { useTheme } from '../../context/ThemeContext';

export const Header: React.FC = () => {
  const { theme, setTheme } = useTheme();
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (!mobileMenuOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileMenuOpen(false);
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) {
        setMobileMenuOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
      document.body.style.overflow = '';
    };
  }, [mobileMenuOpen]);

  return (
    <header ref={headerRef} className="site-header header-entrance">
      {/* Floating Glass Pill */}
      <div className={`header-pill${isScrolled ? ' is-scrolled' : ''}`}>
        <a href="#" className="header-brand" aria-label={siteConfig.name}>
          <img
            src={theme === 'dark' ? '/assets/logo-dark.webp' : '/assets/logo.webp'}
            alt={siteConfig.name}
            width={507}
            height={160}
            loading="eager"
            className="header-logo"
          />
        </a>

        {/* Section links, centred. On phones they live in the menu below. */}
        <nav className="header-nav desktop-nav" aria-label="Main">
          {siteConfig.nav.map((item) => (
            <a key={item.href} href={item.href} className="header-nav-link">
              {item.label}
            </a>
          ))}
        </nav>

        <div className="header-actions">
          {/* On the smallest phones the toggle moves into the menu ("Appearance"). */}
          <span className="header-theme-toggle">
            <ThemeToggle />
          </span>

          <a
            href={siteConfig.social.instagram}
            target="_blank"
            rel="noreferrer"
            aria-label="Instagram"
            className="icon-link header-icon-btn desktop-nav"
          >
            <Instagram size={18} />
          </a>

          <a
            href={`mailto:${siteConfig.social.email}`}
            aria-label="Email Us"
            className="icon-link header-icon-btn desktop-nav"
          >
            <Mail size={18} />
          </a>

          {/* Stays visible on phones too, where WhatsApp lives. */}
          <OrderLink source="header" size="sm" className="header-order-btn" aria-label="Order on WhatsApp">
            Order
          </OrderLink>

          <button
            type="button"
            className="mobile-toggle"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-drawer"
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Phone menu */}
      <div
        id="mobile-drawer"
        className={`mobile-drawer${mobileMenuOpen ? ' is-open' : ''}`}
        aria-hidden={!mobileMenuOpen}
        // Keeps the closed drawer's links out of the tab order. React 18 has no
        // typed `inert` prop, so it's passed as a plain attribute.
        {...(!mobileMenuOpen && { inert: '' })}
      >
        <nav className="drawer-nav" aria-label="Menu">
          {siteConfig.nav.map((item) => (
            <a key={item.href} href={item.href} onClick={() => setMobileMenuOpen(false)} className="header-nav-btn">
              {item.label}
            </a>
          ))}
        </nav>

        <div className="drawer-social">
          <a href={siteConfig.social.instagram} target="_blank" rel="noreferrer" className="drawer-pill">
            <Instagram size={18} aria-hidden="true" />
            Instagram
          </a>
          <a href={`mailto:${siteConfig.social.email}`} className="drawer-pill">
            <Mail size={18} aria-hidden="true" />
            Email us
          </a>
        </div>

        <div className="drawer-appearance">
          <span id="drawer-appearance-label">Appearance</span>
          <div className="segmented" role="group" aria-labelledby="drawer-appearance-label">
            <button type="button" aria-pressed={theme === 'light'} onClick={() => setTheme('light')}>
              <Sun size={16} aria-hidden="true" />
              Light
            </button>
            <button type="button" aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')}>
              <Moon size={16} aria-hidden="true" />
              Dark
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
