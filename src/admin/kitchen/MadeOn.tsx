import React, { useEffect, useRef, useState } from 'react';
import { adminCopy } from '../../data/adminCopy';
import { madeOnDay } from '../orders/model';
import { Segmented } from '../parts';
import { MADE_ON_DAYS_BACK, madeOnChoice, shiftDay, type MadeOnChoice } from './model';

const copy = adminCopy.kitchen;

/**
 * Made on: Today / Yesterday / Pick a day (a sliding switch). Pick a day shows a date
 * field, from 60 days back up to today (the database's own limits). `value` is a day
 * like "2026-09-29"; `today` is India's, from the kitchen.
 */
export const MadeOn: React.FC<{ value: string; today: string; onChange: (day: string) => void }> = ({ value, today, onChange }) => {
  const [picking, setPicking] = useState(() => madeOnChoice(value, today) === 'pick');
  const choice: MadeOnChoice = picking ? 'pick' : madeOnChoice(value, today);
  const field = useRef<HTMLInputElement>(null);
  const min = shiftDay(today, -MADE_ON_DAYS_BACK);
  const pickedLabel = choice === 'pick' && value !== today && value !== shiftDay(today, -1) ? madeOnDay(value) : copy.pickDay;

  // Pick a day: straight to the field (and the phone's date picker where it opens on focus).
  const [focusField, setFocusField] = useState(false);
  useEffect(() => {
    if (!focusField) return;
    setFocusField(false);
    field.current?.focus();
    try { field.current?.showPicker?.(); } catch { /* needs a tap in some browsers; the field is there */ }
  }, [focusField]);

  const pick = (next: MadeOnChoice) => {
    setPicking(next === 'pick');
    if (next === 'today') onChange(today);
    else if (next === 'yesterday') onChange(shiftDay(today, -1));
    else setFocusField(true);
  };

  return (
    <div className="adm-kx-madeon">
      <span className="adm-kx-label" aria-hidden="true">{copy.madeOn}</span>
      <Segmented
        label={copy.madeOn}
        slide
        value={choice}
        onChange={pick}
        options={[
          { value: 'today', label: copy.today },
          { value: 'yesterday', label: copy.yesterday },
          { value: 'pick', label: pickedLabel },
        ]}
      />
      {choice === 'pick' && (
        <label className="adm-kx-madeon__day">
          <span className="visually-hidden">{copy.pickLabel}</span>
          <input
            ref={field}
            type="date"
            className="adm-input"
            min={min}
            max={today}
            value={value}
            onChange={(e) => {
              const day = e.target.value;
              if (day && day >= min && day <= today) onChange(day);
            }}
          />
        </label>
      )}
    </div>
  );
};
