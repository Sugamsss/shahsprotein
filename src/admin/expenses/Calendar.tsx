import React, { useEffect, useId, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { adminCopy } from '../../data/adminCopy';
import { addDays } from '../journal/model';
import { DAY_MIN, daysInMonth, monthCells, monthOf, monthTitle, shiftMonth } from './model';

const copy = adminCopy.expenses;

const fullDate = (day: string): string =>
  new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    .format(new Date(`${day}T00:00:00Z`));

const clampDay = (day: string, today: string): string => (day > today ? today : day < DAY_MIN ? DAY_MIN : day);

const inMonth = (day: string | null, month: string): boolean => Boolean(day && monthOf(day) === month);

/**
 * An in-house month grid. No native date input: the design's cells, today's ring,
 * the picked day's fill, and no day after today (an expense can't be ahead).
 * Every day is a labelable button with its full date, and the whole grid is one
 * roving stop: arrows move a day or a week, Home and End the week's ends,
 * PageUp and PageDown a month, Enter or Space picks.
 */
export const Calendar: React.FC<{
  value: string;
  today: string;
  onChange: (day: string) => void;
  /** Gets the day that holds the grid's tab stop, so the popup opens on it. */
  initialFocus: React.MutableRefObject<HTMLElement | null>;
}> = ({ value, today, onChange, initialFocus }) => {
  const titleId = useId();
  const [view, setView] = useState(() => monthOf(value));
  const [focusDay, setFocusDay] = useState(value);
  const [focusTick, setFocusTick] = useState(0);
  const dayRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Keyboard moves only: the popup's own opening focus is useDialog's job.
  useEffect(() => {
    if (focusTick) dayRefs.current[focusDay]?.focus();
  }, [focusTick, focusDay]);

  /** Keep the grid's tab stop in the month being looked at. */
  const stepMonth = (delta: number) => {
    const month = shiftMonth(view, delta);
    const keep = [focusDay, value, today].find((day) => inMonth(day, month));
    setView(month);
    setFocusDay(keep ?? `${month}-01`);
  };

  const move = (to: string) => {
    const next = clampDay(to, today);
    setView(monthOf(next));
    setFocusDay(next);
    setFocusTick((n) => n + 1);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-day]');
    if (!button?.dataset.day) return;
    const day = button.dataset.day;
    const week = new Date(`${day}T00:00:00Z`).getUTCDay();
    const steps: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    let next: string | null = null;
    if (steps[event.key] !== undefined) next = addDays(day, steps[event.key]);
    else if (event.key === 'Home') next = addDays(day, -week);
    else if (event.key === 'End') next = addDays(day, 6 - week);
    else if (event.key === 'PageUp' || event.key === 'PageDown') {
      const month = shiftMonth(monthOf(day), event.key === 'PageUp' ? -1 : 1);
      const wanted = Math.min(Number(day.slice(8)), daysInMonth(month));
      next = `${month}-${String(wanted).padStart(2, '0')}`;
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onChange(day);
      return;
    } else return;
    event.preventDefault();
    move(next);
  };

  const cells = monthCells(view);
  const atStart = view <= monthOf(DAY_MIN);
  const atEnd = view >= monthOf(today);

  return (
    <div className="adm-cal">
      <div className="adm-cal__nav">
        <button type="button" className="adm-cal__step" aria-label={copy.previousMonth} disabled={atStart} onClick={() => stepMonth(-1)}>
          <ChevronLeft size={20} strokeWidth={1.75} aria-hidden="true" />
        </button>
        <h3 id={titleId} aria-live="polite">{monthTitle(view)}</h3>
        <button type="button" className="adm-cal__step" aria-label={copy.nextMonth} disabled={atEnd} onClick={() => stepMonth(1)}>
          <ChevronRight size={20} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
      <div className="adm-cal__row adm-cal__dow" role="row">
        {copy.weekdayInitials.map((letter, i) => (
          <span key={copy.weekdays[i]} role="columnheader" aria-label={copy.weekdays[i]}>{letter}</span>
        ))}
      </div>
      <div className="adm-cal__grid" role="grid" aria-labelledby={titleId} onKeyDown={onKeyDown}>
        {Array.from({ length: cells.length / 7 }, (_, row) => (
          <div key={row} className="adm-cal__row" role="row">
            {cells.slice(row * 7, row * 7 + 7).map((day, column) => {
              if (!day) return <span key={`blank-${column}`} className="adm-cal__blank" role="presentation" />;
              const disabled = day > today;
              return (
                <button
                  key={day}
                  type="button"
                  role="gridcell"
                  data-day={day}
                  ref={(el) => {
                    dayRefs.current[day] = el;
                    if (day === focusDay) initialFocus.current = el;
                  }}
                  className={`adm-cal__day${day === today ? ' is-today' : ''}`}
                  tabIndex={day === focusDay ? 0 : -1}
                  aria-label={`${fullDate(day)}${day === today ? `, ${copy.today.toLowerCase()}` : ''}`}
                  aria-selected={day === value}
                  aria-current={day === today ? 'date' : undefined}
                  aria-disabled={disabled || undefined}
                  onClick={() => { if (!disabled) onChange(day); }}
                >
                  <span>{Number(day.slice(8))}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};
