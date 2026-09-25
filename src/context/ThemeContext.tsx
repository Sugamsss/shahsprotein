import React, { createContext, useContext, useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { Theme, ThemeContextType } from '../types/theme';

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const STORAGE_KEY = 'shahsnutrition_theme';

// Blocked site storage throws on any access. A failed read means "nothing saved",
// a failed write is skipped: the theme still works, it just isn't remembered.
const readSavedTheme = (): string | null => {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};

const saveTheme = (theme: Theme): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Not remembered this time.
  }
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = readSavedTheme();
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    saveTheme(theme);

    const prefix = theme === 'light' ? 'light' : 'dark';
    const version = '?v=5';
    document.getElementById('theme-favicon')?.setAttribute('href', `/favicon-${prefix}.png${version}`);
    document.getElementById('theme-favicon-ico')?.setAttribute('href', `/favicon-${prefix}.ico${version}`);
    document.getElementById('theme-favicon-32')?.setAttribute('href', `/favicon-${prefix}-32x32.png${version}`);
    document.getElementById('theme-apple-touch-icon')?.setAttribute('href', `/apple-touch-icon-${prefix}.png${version}`);

    // The browser toolbar follows the chosen theme, even when it differs from the OS.
    const toolbar = getComputedStyle(document.documentElement).getPropertyValue('--color-bg-main').trim();
    if (toolbar) {
      document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => meta.setAttribute('content', toolbar));
    }
  }, [theme]);

  // A short crossfade between the two themes, so there's never a frame with
  // one theme's text on the other's backgrounds. Browsers without View
  // Transitions, and people who ask for less motion, switch at once as before.
  const switchTheme = (next: Theme) => {
    if (next === theme) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (typeof document.startViewTransition !== 'function' || reduce) {
      setThemeState(next);
      return;
    }
    document.startViewTransition(() => {
      flushSync(() => setThemeState(next));
      // The effect above sets this too; setting it here makes sure the new
      // snapshot is taken with the new theme in place.
      document.documentElement.setAttribute('data-theme', next);
    });
  };

  const toggleTheme = () => switchTheme(theme === 'dark' ? 'light' : 'dark');

  const setTheme = (newTheme: Theme) => switchTheme(newTheme);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
