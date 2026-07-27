import React, { createContext, useContext, useEffect, useState } from 'react';
import { Theme, ThemeContextType } from '../types/theme';

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const STORAGE_KEY = 'shahsnutrition_theme';

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_KEY, theme);

    const prefix = theme === 'light' ? 'light' : 'dark';
    const version = '?v=5';
    document.getElementById('theme-favicon')?.setAttribute('href', `/favicon-${prefix}.png${version}`);
    document.getElementById('theme-favicon-ico')?.setAttribute('href', `/favicon-${prefix}.ico${version}`);
    document.getElementById('theme-favicon-32')?.setAttribute('href', `/favicon-${prefix}-32x32.png${version}`);
    document.getElementById('theme-apple-touch-icon')?.setAttribute('href', `/apple-touch-icon-${prefix}.png${version}`);
  }, [theme]);

  const toggleTheme = () => {
    setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
  };

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
