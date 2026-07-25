import React, { useState, useEffect } from 'react';
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

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 'var(--z-header)' as any,
        height: 'var(--header-height)',
        display: 'flex',
        alignItems: 'center',
        backgroundColor: 'var(--color-bg-header)',
        backdropFilter: 'var(--glass-backdrop)',
        WebkitBackdropFilter: 'var(--glass-backdrop)',
        borderBottom: isScrolled ? '1px solid var(--color-border-card)' : '1px solid transparent',
        transition: 'all var(--transition-normal)',
      }}
    >
      <Container>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Brand Logo */}
          <a href="#" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <img
              src="/assets/logo.png"
              alt={siteConfig.name}
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
              aria-label="Toggle menu"
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
        {mobileMenuOpen && (
          <div
            className="animate-fade-in"
            style={{
              paddingTop: '1rem',
              paddingBottom: '1rem',
              borderTop: '1px solid var(--color-border-subtle)',
              marginTop: '0.75rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
              width: '100%',
            }}
          >
            <a
              href="#products"
              className="nav-link"
              onClick={() => setMobileMenuOpen(false)}
              style={{ fontSize: 'var(--font-size-base)', padding: '0.25rem 0' }}
            >
              Products
            </a>
            <a
              href="#our-story"
              className="nav-link"
              onClick={() => setMobileMenuOpen(false)}
              style={{ fontSize: 'var(--font-size-base)', padding: '0.25rem 0' }}
            >
              Our Story
            </a>
          </div>
        )}
      </Container>
    </header>
  );
};
