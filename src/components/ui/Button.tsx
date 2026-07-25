import React, { useState } from 'react';

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
  onMouseEnter,
  onMouseLeave,
  disabled,
  ...props
}) => {
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
    setIsHovered(true);
    if (onMouseEnter) onMouseEnter(e);
  };

  const handleMouseLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
    setIsHovered(false);
    if (onMouseLeave) onMouseLeave(e);
  };

  const getVariantStyles = (): React.CSSProperties => {
    const isInteractive = !disabled && isHovered;
    switch (variant) {
      case 'primary':
        return {
          background: 'var(--color-accent-gradient)',
          color: 'var(--color-btn-text)',
          fontWeight: 600,
          boxShadow: isInteractive ? '0 0 32px var(--color-accent-primary)' : 'var(--shadow-glow)',
          border: 'none',
        };
      case 'secondary':
        return {
          background: isInteractive ? 'var(--color-bg-card-hover)' : 'var(--color-bg-card)',
          color: 'var(--color-text-primary)',
          border: '1px solid var(--color-border-card)',
          boxShadow: isInteractive ? 'var(--shadow-card)' : 'none',
        };
      case 'outline':
        return {
          background: 'transparent',
          color: 'var(--color-text-primary)',
          border: isInteractive ? '1px solid var(--color-border-hover)' : '1px solid var(--color-border-card)',
        };
      case 'ghost':
        return {
          background: isInteractive ? 'var(--color-bg-badge)' : 'transparent',
          color: 'var(--color-text-accent)',
          border: 'none',
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
    transition: 'transform var(--transition-fast), box-shadow var(--transition-fast), background var(--transition-fast), border-color var(--transition-fast)',
    whiteSpace: 'nowrap',
    width: fullWidth ? '100%' : 'auto',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
    transform: !disabled && isHovered ? 'scale(1.03)' : 'scale(1)',
    ...getVariantStyles(),
    ...getSizeStyles(),
    ...style,
  };

  return (
    <button
      className={`btn ${className}`}
      style={baseStyle}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
};

