import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
}

export const Input: React.FC<InputProps> = ({ icon, className = '', style, ...props }) => {
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%' }}>
      {icon && (
        <span
          style={{
            position: 'absolute',
            left: '1rem',
            color: 'var(--color-text-muted)',
            display: 'flex',
            alignItems: 'center',
            pointerEvents: 'none',
            zIndex: 1,
          }}
        >
          {icon}
        </span>
      )}
      <input
        className={`input ${className}`}
        style={{
          width: '100%',
          paddingLeft: icon ? '2.75rem' : '1.25rem',
          paddingRight: '1.25rem',
          paddingTop: '0.75rem',
          paddingBottom: '0.75rem',
          ...style,
        }}
        {...props}
      />
    </div>
  );
};
