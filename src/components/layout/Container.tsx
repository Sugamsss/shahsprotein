import React from 'react';

export interface ContainerProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export const Container: React.FC<ContainerProps> = ({ children, className = '', style }) => {
  return (
    <div
      className={`container ${className}`}
      style={{
        maxWidth: 'var(--container-max-width)',
        margin: '0 auto',
        paddingLeft: 'var(--space-4)',
        paddingRight: 'var(--space-4)',
        width: '100%',
        ...style,
      }}
    >
      {children}
    </div>
  );
};
