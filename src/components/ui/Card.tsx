import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  interactive?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  interactive = false,
  className = '',
  style,
  ...props
}) => {
  return (
    <div
      className={`glass-card ${className}`}
      style={{
        padding: 'var(--space-6)',
        cursor: interactive ? 'pointer' : 'default',
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
};
