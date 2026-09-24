import React, { useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { siteConfig } from '../../data/siteConfig';
import { useTheme } from '../../context/ThemeContext';

/** Any URL that isn't a page. The SPA rewrite serves it with a 200, so it also asks search engines not to index it. */
export const NotFound: React.FC = () => {
  const { theme } = useTheme();
  const { notFound } = siteConfig;

  useEffect(() => {
    const previousTitle = document.title;
    document.title = `Page not found · ${siteConfig.name}`;
    const robots = document.createElement('meta');
    robots.name = 'robots';
    robots.content = 'noindex';
    document.head.appendChild(robots);
    return () => {
      document.title = previousTitle;
      robots.remove();
    };
  }, []);

  return (
    <main className="not-found">
      <div className="not-found__card glass-card">
        <img
          src={theme === 'dark' ? '/assets/logo-dark-v2.webp' : '/assets/logo-v2.webp'}
          alt={siteConfig.name}
          width={600}
          height={200}
          className="not-found__logo"
        />
        <h1 className="not-found__title">{notFound.title}</h1>
        <p className="not-found__body">{notFound.body}</p>
        <a href="/" className="order-btn order-btn--lg">
          <ArrowLeft size={18} aria-hidden="true" />
          <span>{notFound.home}</span>
        </a>
      </div>
    </main>
  );
};
