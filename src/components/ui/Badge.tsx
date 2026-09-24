import React from 'react';

export interface BadgeProps {
  children: React.ReactNode;
  icon?: React.ReactNode | null;
  className?: string;
  style?: React.CSSProperties;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  icon = null,
  className = '',
  style,
}) => {
  return (
    <span className={`badge ${className}`.trim()} style={style}>
      {icon ? icon : null}
      <span>{children}</span>
    </span>
  );
};
