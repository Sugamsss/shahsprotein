import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
}

export const Input: React.FC<InputProps> = ({ icon, className = '', ...props }) => {
  return (
    <div className="input-wrap">
      {icon && <span className="input-wrap__icon">{icon}</span>}
      <input className={`input${icon ? ' input--icon' : ''} ${className}`} {...props} />
    </div>
  );
};
