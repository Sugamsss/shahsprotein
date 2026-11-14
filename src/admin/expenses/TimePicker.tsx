import React from 'react';
import { adminCopy } from '../../data/adminCopy';
import { WheelColumn } from '../wheel';
import { from24, to24, type Clock } from './model';

const copy = adminCopy.expenses;

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);
const MERIDIEMS = [0, 1];
const pad = (n: number) => String(n).padStart(2, '0');

/**
 * The time as three wheels (hour, minute, AM/PM), the kitchen's own wheel from Log
 * cooking: snap, 40px rows, a centre band, arrow keys, tap a row to roll. The field
 * above changes the moment a wheel settles, and the value underneath is always 24h.
 */
export const TimePicker: React.FC<{
  value: string;
  onChange: (time: string) => void;
  /** Opens on the hour wheel. */
  initialFocus: React.MutableRefObject<HTMLElement | null>;
}> = ({ value, onChange, initialFocus }) => {
  const clock = from24(value);
  const set = (change: Partial<Clock>) => onChange(to24({ ...clock, ...change }));

  return (
    <div className="adm-wheel adm-xp-wheel" role="group" aria-label={copy.clock}>
      <span className="adm-wheel__band" aria-hidden="true" />
      <span className="adm-wheel__colon" aria-hidden="true">:</span>
      <WheelColumn
        options={HOURS}
        value={clock.hour}
        onChange={(hour) => set({ hour })}
        label={copy.hour}
        valueText={(n) => String(n)}
        columnRef={initialFocus}
      />
      <WheelColumn
        options={MINUTES}
        value={clock.minute}
        onChange={(minute) => set({ minute })}
        label={copy.minute}
        valueText={(n) => `${n} ${n === 1 ? 'minute' : 'minutes'}`}
        format={pad}
      />
      <WheelColumn
        options={MERIDIEMS}
        value={clock.meridiem === 'pm' ? 1 : 0}
        onChange={(index) => set({ meridiem: index ? 'pm' : 'am' })}
        label={copy.meridiem}
        valueText={(index) => (index ? 'PM' : 'AM')}
        format={(index) => (index ? 'PM' : 'AM')}
        className="adm-wheel__col--ap"
      />
    </div>
  );
};
