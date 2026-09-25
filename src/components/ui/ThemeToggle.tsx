import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { warmTheme } from '../../utils/themeAssets';
import { siteConfig } from '../../data/siteConfig';

export const ThemeToggle: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggleTheme}
      // Reaching for the switch starts loading the other theme's logo and hero art.
      onPointerEnter={() => warmTheme(isDark ? 'light' : 'dark')}
      onFocus={() => warmTheme(isDark ? 'light' : 'dark')}
      aria-label={siteConfig.header.themeSwitchLabel(isDark ? 'light' : 'dark')}
    >
      <span className="theme-toggle__thumb" aria-hidden="true">
        {isDark ? <Moon size={11} /> : <Sun size={11} />}
      </span>
    </button>
  );
};
