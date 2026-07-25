import React, { useState, useEffect, useRef } from 'react';
import { Container } from './Container';
import { ThemeToggle } from '../ui/ThemeToggle';
import { Button } from '../ui/Button';
import { useModal } from '../../context/ModalContext';
import { Instagram, Mail, Menu, X } from 'lucide-react';
import { siteConfig } from '../../data/siteConfig';

export const Header: React.FC = () => {
  const { openWaitlistModal } = useModal();
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (!mobileMenuOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileMenuOpen(false);
      }
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
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 'var(--z-header)' as unknown as number,
        height: 'auto',
        minHeight: 'var(--header-height)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        backgroundColor: 'var(--color-bg-header)',
        backdropFilter: 'var(--glass-backdrop)',
        WebkitBackdropFilter: 'var(--glass-backdrop)',
        borderBottom: isScrolled ? '1px solid var(--color-border-card)' : '1px solid transparent',
        transition: 'all var(--transition-normal)',
      }}
    >
      <Container>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 'var(--header-height)' }}>
          {/* Brand Logo */}
          <a href="#" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <img
              src="/assets/logo.png"
              alt={siteConfig.name}
              width={1536}
              height={1024}
              loading="eager"
              style={{ height: '38px', width: 'auto', objectFit: 'contain' }}
            />
          </a>

          {/* Desktop Nav Links */}
          <nav
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '2rem',
            }}
            className="desktop-nav"
          >
            <a href="#products" className="nav-link">
              Products
            </a>
            <a href="#our-story" className="nav-link">
              Our Story
            </a>
          </nav>

          {/* Actions & Theme Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <ThemeToggle />

            <a
              href={siteConfig.social.instagram}
              target="_blank"
              rel="noreferrer"
              aria-label="Instagram"
              className="icon-link"
            >
              <Instagram size={18} />
            </a>

            <a
              href={`mailto:${siteConfig.social.email}`}
              aria-label="Email Us"
              className="icon-link"
            >
              <Mail size={18} />
            </a>

            <Button size="sm" onClick={openWaitlistModal}>
              Join Waitlist &rarr;
            </Button>

            {/* Mobile Menu Toggle Button */}
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
            maxHeight: mobileMenuOpen ? '300px' : '0px',
            opacity: mobileMenuOpen ? 1 : 0,
            overflow: 'hidden',
            borderTop: mobileMenuOpen ? '1px solid var(--color-border-subtle)' : '1px solid transparent',
            marginTop: mobileMenuOpen ? '0.25rem' : '0px',
            paddingTop: mobileMenuOpen ? '0.5rem' : '0px',
            paddingBottom: mobileMenuOpen ? '0.75rem' : '0px',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
            width: '100%',
            transition: 'max-height 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease, margin 0.3s ease, padding 0.3s ease, border-color 0.3s ease',
            pointerEvents: mobileMenuOpen ? 'auto' : 'none',
          }}
        >
          <a
            href="#products"
            className="nav-link"
            onClick={() => setMobileMenuOpen(false)}
            style={{
              fontSize: 'var(--font-size-base)',
              minHeight: '44px',
              display: 'flex',
              alignItems: 'center',
              width: '100%',
              padding: '0 0.5rem',
            }}
          >
            Products
          </a>
          <a
            href="#our-story"
            className="nav-link"
            onClick={() => setMobileMenuOpen(false)}
            style={{
              fontSize: 'var(--font-size-base)',
              minHeight: '44px',
              display: 'flex',
              alignItems: 'center',
              width: '100%',
              padding: '0 0.5rem',
            }}
          >
            Our Story
          </a>
        </div>
      </Container>
    </header>
  );
};

