import React from 'react';

export interface ContainerProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export const Container: React.FC<ContainerProps> = ({ children, className = '', style }) => (
  <div className={`container ${className}`.trim()} style={style}>
    {children}
  </div>
);
