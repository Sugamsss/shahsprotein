import React, { useId } from 'react';
import { siteConfig } from '../../data/siteConfig';

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
  /** Out-of-stock sizes are disabled (arrow keys skip them), and described as "250 g is back soon." */
  isOut?: (size: string) => boolean;
}

/** Pack size as native radios in a pill, so arrow keys work. One size is plain text. */
export const SizeChoice: React.FC<SizeChoiceProps> = ({
  sizes, value, onChange, legend, single, large = false, isOut,
}) => {
  const name = useId();

  if (sizes.length < 2) {
    return <span className={`size-fixed${large ? ' size-fixed--lg' : ''}`}>{single}</span>;
  }

  return (
    <fieldset className={`size-choice${large ? ' size-choice--lg' : ''}`}>
      <legend className="visually-hidden">{legend}</legend>
      {sizes.map((size, index) => {
        const id = `${name}-${index}`;
        const out = isOut?.(size) ?? false;
        return (
          <React.Fragment key={size}>
            <input
              type="radio"
              id={id}
              name={name}
              value={size}
              checked={size === value}
              disabled={out}
              aria-describedby={out ? `${id}-out` : undefined}
              onChange={() => onChange(size)}
            />
            <label htmlFor={id}>{size}</label>
            {out && <span id={`${id}-out`} className="visually-hidden">{siteConfig.order.sizeBackSoon(size)}</span>}
          </React.Fragment>
        );
      })}
    </fieldset>
  );
};
