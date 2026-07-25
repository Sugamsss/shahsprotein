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
  const cardClassName = ['glass-card', interactive ? 'interactive' : '', className]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={cardClassName}
      style={{
        padding: 'var(--space-6)',
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
};
