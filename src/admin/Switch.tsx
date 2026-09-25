import React from 'react';

// Styles: parts.css. The Paid switch (lane B) wraps this with its ₹ circle and text.

/** On/off, 52×32 (spec 2.3's Paid switch without its text). A button with role="switch". */
export const Switch: React.FC<{
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** What it turns on, read with its state: "Muesli 500 g on the site". */
  label: string;
  disabled?: boolean;
}> = ({ checked, onChange, label, disabled }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    className="adm-switch"
    onClick={() => onChange(!checked)}
  />
);
