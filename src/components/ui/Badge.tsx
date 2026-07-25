import React from 'react';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: 'gold' | 'blue' | 'pill';
  className?: string;
  style?: React.CSSProperties;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  className = '',
  style,
}) => {
  return (
    <span
      className={`badge ${className}`}
      style={{
        ...style,
      }}
    >
      {children}
    </span>
  );
};

