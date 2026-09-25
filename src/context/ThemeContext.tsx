import React, { createContext, useContext, useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { Theme, ThemeContextType, ThemeMode } from '../types/theme';

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

// Only a choice someone made is saved. With nothing saved the site follows the
// device (as the inline script in index.html also does), so it's removed for 'system'.
const saveMode = (mode: ThemeMode): void => {
  try {
    if (mode === 'system') window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Not remembered this time.
  }
};

const LIGHT_QUERY = '(prefers-color-scheme: light)';
const deviceTheme = (): Theme => (window.matchMedia(LIGHT_QUERY).matches ? 'light' : 'dark');

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    const saved = readSavedTheme();
    return saved === 'light' || saved === 'dark' ? saved : 'system';
  });
  const [device, setDevice] = useState<Theme>(deviceTheme);
  const theme = mode === 'system' ? device : mode;

  // Follow the device live (it matters in 'system' mode).
  useEffect(() => {
    const query = window.matchMedia(LIGHT_QUERY);
    const onChange = () => setDevice(query.matches ? 'light' : 'dark');
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    saveMode(mode);
  }, [mode]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);

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
  // A mode change that doesn't change what's on screen just saves.
  const setMode = (next: ThemeMode) => {
    if (next === mode) return;
    const shown = next === 'system' ? device : next;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (shown === theme || typeof document.startViewTransition !== 'function' || reduce) {
      setModeState(next);
      return;
    }
    document.startViewTransition(() => {
      flushSync(() => setModeState(next));
      // The effect above sets this too; setting it here makes sure the new
      // snapshot is taken with the new theme in place.
      document.documentElement.setAttribute('data-theme', shown);
    });
  };

  const toggleTheme = () => setMode(theme === 'dark' ? 'light' : 'dark');
  const setTheme = (newTheme: Theme) => setMode(newTheme);

  return (
    <ThemeContext.Provider value={{ theme, mode, setMode, toggleTheme, setTheme }}>
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
