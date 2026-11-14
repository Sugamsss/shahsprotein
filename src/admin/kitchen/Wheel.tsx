import React from 'react';
import { adminCopy } from '../../data/adminCopy';
import { formatWeight } from '../format';
import { WheelColumn } from '../wheel';
import { gOptions, kgOptions, splitGrams } from './model';

const copy = adminCopy.kitchen;

// The kg + g wheels (design: pieces/notes.md "Wheel"). The column itself is shared
// with the expenses' time picker (src/admin/wheel.tsx); this file only names the
// two amounts and their units.

/**
 * One amount in grams. With `grams` (a list of steps) it's the grams wheel alone, for
 * amounts under a kilo (part of a batch's spare); otherwise kg (0–25) and g (0–950 in 50s).
 */
export const AmountWheel: React.FC<{
  value: number;
  onChange: (grams: number) => void;
  /** The product, for the columns' names. */
  name: string;
  grams?: number[];
  id?: string;
}> = ({ value, onChange, name, grams, id }) => {
  const { kg, g } = splitGrams(value);
  if (grams) {
    return (
      <div id={id} className="adm-wheel adm-wheel--one">
        <span className="adm-wheel__band" aria-hidden="true" />
        <WheelColumn options={grams} value={value} onChange={onChange} unit={copy.g} label={copy.wheelG(name)} valueText={formatWeight} />
      </div>
    );
  }
  return (
    <div id={id} className="adm-wheel">
      <span className="adm-wheel__band" aria-hidden="true" />
      <WheelColumn
        options={kgOptions()}
        value={kg}
        onChange={(next) => onChange(next * 1000 + g)}
        unit={copy.kg}
        label={copy.wheelKg(name)}
        valueText={(n) => formatWeight(n * 1000 + g)}
      />
      <WheelColumn
        options={gOptions(value)}
        value={g}
        onChange={(next) => onChange(kg * 1000 + next)}
        unit={copy.g}
        label={copy.wheelG(name)}
        valueText={(n) => formatWeight(kg * 1000 + n)}
      />
    </div>
  );
};
