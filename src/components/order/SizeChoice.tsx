import React, { useId } from 'react';

export interface SizeChoiceProps {
  /** The product's pack sizes, e.g. ["250 g", "500 g"]. */
  sizes: string[];
  value: string;
  onChange: (size: string) => void;
  /** Read by screen readers as the group's name. */
  legend: string;
  /** Shown instead of a switch when there's only one size, e.g. "250 g pack". */
  single: string;
  /** The bigger version in the product popup's bar. */
  large?: boolean;
}

/** Pack size as native radios in a pill, so arrow keys work. One size is plain text. */
export const SizeChoice: React.FC<SizeChoiceProps> = ({ sizes, value, onChange, legend, single, large = false }) => {
  const name = useId();

  if (sizes.length < 2) {
    return <span className={`size-fixed${large ? ' size-fixed--lg' : ''}`}>{single}</span>;
  }

  return (
    <fieldset className={`size-choice${large ? ' size-choice--lg' : ''}`}>
      <legend className="visually-hidden">{legend}</legend>
      {sizes.map((size, index) => {
        const id = `${name}-${index}`;
        return (
          <React.Fragment key={size}>
            <input
              type="radio"
              id={id}
              name={name}
              value={size}
              checked={size === value}
              onChange={() => onChange(size)}
            />
            <label htmlFor={id}>{size}</label>
          </React.Fragment>
        );
      })}
    </fieldset>
  );
};
