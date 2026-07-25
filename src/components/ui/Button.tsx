import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  children,
  className = '',
  style,
  ...props
}) => {
  const getVariantStyles = (): React.CSSProperties => {
    switch (variant) {
      case 'primary':
        return {
          background: 'var(--color-accent-gradient)',
          color: 'var(--color-btn-text)',
          fontWeight: 600,
          boxShadow: 'var(--shadow-glow)',
        };
      case 'secondary':
        return {
          background: 'var(--color-bg-card)',
          color: 'var(--color-text-primary)',
          border: '1px solid var(--color-border-card)',
        };
      case 'outline':
        return {
          background: 'transparent',
          color: 'var(--color-text-primary)',
          border: '1px solid var(--color-border-hover)',
        };
      case 'ghost':
        return {
          background: 'transparent',
          color: 'var(--color-text-secondary)',
        };
    }
  };

  const getSizeStyles = (): React.CSSProperties => {
    switch (size) {
      case 'sm':
        return { padding: '0.4rem 0.85rem', fontSize: 'var(--font-size-xs)' };
      case 'md':
        return { padding: '0.65rem 1.25rem', fontSize: 'var(--font-size-sm)' };
      case 'lg':
        return { padding: '0.85rem 1.75rem', fontSize: 'var(--font-size-base)' };
    }
  };

  const baseStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    borderRadius: 'var(--radius-full)',
    transition: 'all var(--transition-fast)',
    whiteSpace: 'nowrap',
    width: fullWidth ? '100%' : 'auto',
    cursor: props.disabled ? 'not-allowed' : 'pointer',
    opacity: props.disabled ? 0.6 : 1,
    ...getVariantStyles(),
    ...getSizeStyles(),
    ...style,
  };

  return (
    <button className={`btn ${className}`} style={baseStyle} {...props}>
      {children}
    </button>
  );
};
