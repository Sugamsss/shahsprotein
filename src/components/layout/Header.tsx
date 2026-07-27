import React, { useState, useEffect, useRef } from 'react';
import { ThemeToggle } from '../ui/ThemeToggle';
import { Instagram, Mail, Menu, X } from 'lucide-react';
import { siteConfig } from '../../data/siteConfig';
import { useTheme } from '../../context/ThemeContext';

export const Header: React.FC = () => {
  const { theme } = useTheme();
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
    <header
      ref={headerRef}
      className="header-entrance"
      style={{
        position: 'fixed',
        top: '16px',
        left: 0,
        right: 0,
        zIndex: 'var(--z-header)' as unknown as number,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '0 20px',
        paddingBottom: mobileMenuOpen ? '0' : '0',
        pointerEvents: 'none',
      }}
    >
      {/* Floating Glass Pill */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          pointerEvents: 'auto',
          width: '100%',
          maxWidth: 'var(--container-max-width)',
          height: '46px',
          padding: '0 10px',
          borderRadius: 'var(--radius-full)',
          backgroundColor: 'var(--color-bg-header)',
          backdropFilter: 'blur(32px) saturate(180%)',
          WebkitBackdropFilter: 'blur(32px) saturate(180%)',
          border: '1px solid var(--color-border-header)',
          boxShadow: isScrolled
            ? 'var(--shadow-header-scrolled)'
            : 'var(--shadow-header)',
          transition:
            'box-shadow var(--transition-normal), background-color var(--transition-theme), border-color var(--transition-theme)',
        }}
      >
        {/* Brand Logo */}
        <a
          href="#"
          style={{ display: 'flex', alignItems: 'center', flex: '1', justifyContent: 'flex-start' }}
          aria-label={siteConfig.name}
        >
          <img
            src={theme === 'dark' ? '/assets/logo-dark.png' : '/assets/logo.png'}
            alt={siteConfig.name}
            width={507}
            height={160}
            loading="eager"
            style={{ height: '24px', width: 'auto', objectFit: 'contain' }}
          />
        </a>

        {/* Desktop Nav Links — centered */}
        <nav
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1.5rem',
            position: 'absolute',
            left: '50%',
            transform: 'translateX(-50%)',
          }}
          className="desktop-nav"
        >
          <a href="#products" className="header-nav-link">
            Products
          </a>
          <a href="#values" className="header-nav-link">
            Our Principles
          </a>
          <a href="#our-story" className="header-nav-link">
            Our Story
          </a>
        </nav>

        {/* Right: Actions */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '8px',
            flex: '1',
          }}
        >
          <ThemeToggle />

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

          {/* Mobile Menu Toggle */}
          <button
            className="mobile-toggle"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-drawer"
            style={{
              color: 'var(--color-text-primary)',
              padding: '0.25rem',
              display: 'none',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Mobile Dropdown Drawer */}
      <div
        id="mobile-drawer"
        aria-hidden={!mobileMenuOpen}
        style={{
          width: '100%',
          maxWidth: 'var(--container-max-width)',
          maxHeight: mobileMenuOpen ? '300px' : '0px',
          opacity: mobileMenuOpen ? 1 : 0,
          overflow: 'hidden',
          borderRadius: mobileMenuOpen ? 'var(--radius-lg)' : '0',
          backgroundColor: 'var(--color-bg-header)',
          backdropFilter: 'blur(32px) saturate(180%)',
          WebkitBackdropFilter: 'blur(32px) saturate(180%)',
          border: mobileMenuOpen ? '1px solid var(--color-border-header)' : '1px solid transparent',
          marginTop: mobileMenuOpen ? '6px' : '0px',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          padding: mobileMenuOpen ? '0.75rem 1.5rem' : '0 1.5rem',
          pointerEvents: mobileMenuOpen ? 'auto' : 'none',
          transition:
            'max-height 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease, padding 0.3s ease, border-color 0.3s ease, margin-top 0.3s ease',
        }}
      >
        <a
          href="#products"
          onClick={() => setMobileMenuOpen(false)}
          className="header-nav-btn"
        >
          Products
        </a>
        <a
          href="#values"
          onClick={() => setMobileMenuOpen(false)}
          className="header-nav-btn"
        >
          Our Principles
        </a>
        <a
          href="#our-story"
          onClick={() => setMobileMenuOpen(false)}
          className="header-nav-btn"
        >
          Our Story
        </a>
      </div>
    </header>
  );
};
