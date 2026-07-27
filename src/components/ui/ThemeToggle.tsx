import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

export const ThemeToggle: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        width: '48px',
        height: '26px',
        padding: '2px',
        borderRadius: '9999px',
        backgroundColor: 'var(--color-bg-pill)',
        border: '1px solid var(--color-border-subtle)',
        cursor: 'pointer',
        transition: 'background-color var(--transition-normal), border-color var(--transition-normal)',
        outline: 'none',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '20px',
          height: '20px',
          borderRadius: '9999px',
          backgroundColor: 'var(--color-accent-primary)',
          color: 'var(--color-btn-text)',
          transform: isDark ? 'translateX(0px)' : 'translateX(22px)',
          transition: 'transform var(--transition-normal), background-color var(--transition-normal)',
          boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
        }}
      >
        {isDark ? <Moon size={11} /> : <Sun size={11} />}
      </span>
    </button>
  );
};
