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
        width: '52px',
        height: '28px',
        padding: '2px',
        borderRadius: 'var(--radius-full)',
        backgroundColor: 'var(--color-bg-card)',
        border: '1px solid var(--color-border-card)',
        cursor: 'pointer',
        transition: 'background-color var(--transition-normal), border-color var(--transition-normal)',
        outline: 'none',
      }}
    >
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '22px',
          height: '22px',
          borderRadius: 'var(--radius-full)',
          backgroundColor: 'var(--color-accent-primary)',
          color: 'var(--color-btn-text)',
          transform: isDark ? 'translateX(0px)' : 'translateX(24px)',
          transition: 'transform var(--transition-normal), background-color var(--transition-normal)',
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
        }}
      >
        {isDark ? <Moon size={12} /> : <Sun size={12} />}
      </span>
    </button>
  );
};

