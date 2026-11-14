import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

// A wheel, shared by the kitchen's amounts (kg + g) and the expenses' time (hour,
// minute, AM/PM). Native scrolling with scroll-snap, 40px rows, a centre band, rows
// fading above and below, tabular numbers; the chosen row is ink-1 600. A column
// reports its value once it settles (scrollend, or a short quiet spell where there's
// none), so a caller only hears amounts someone stopped on. Each column is a
// spinbutton: arrow keys step it, and a tap on a row rolls to it. A tap or focus
// anywhere else while a column is still moving reports the row in the band at once,
// so a button tapped mid-snap ("Log it", Save) always uses exactly what the wheel shows.

export const ROW = 40;
const SETTLE_MS = 140;

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** A light tick on each snap where the device has one (Android); nothing elsewhere. */
const tick = () => {
  try { navigator.vibrate?.(4); } catch { /* not allowed here */ }
};

/** What a row shows: the number itself, unless the caller formats it ("05", "PM"). */
export const WheelColumn: React.FC<{
  options: number[];
  value: number;
  onChange: (value: number) => void;
  /** Shown beside the chosen row ("kg", "g"); leave it out for a plain wheel. */
  unit?: string;
  label: string;
  /** What a screen reader hears for a value: "2 kg 250 g". */
  valueText: (value: number) => string;
  /** A row's words when they aren't the number: "05", "AM". */
  format?: (value: number) => string;
  /** Extra class on the column (the time picker's AM/PM column is quieter). */
  className?: string;
  /** Also handed out, so the picker can open on this column. */
  columnRef?: React.MutableRefObject<HTMLElement | null>;
}> = ({ options, value, onChange, unit, label, valueText, format, className, columnRef }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const index = Math.max(0, options.indexOf(value));
  // The row in the band while she scrolls (the value only changes once it settles).
  const [live, setLive] = useState(index);
  const liveRef = useRef(index);
  const timer = useRef<number>();
  const frame = useRef<number>();
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const valueRef = useRef(value);
  valueRef.current = value;

  const attach = useCallback((el: HTMLDivElement | null) => {
    ref.current = el;
    if (columnRef) columnRef.current = el;
  }, [columnRef]);

  // A new value from outside (the other column, a key, the first open): sit on it without animating.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    liveRef.current = index;
    setLive(index);
    if (Math.round(el.scrollTop / ROW) !== index) el.scrollTop = index * ROW;
  }, [index, options.length]);

  // Scrolled and not yet reported.
  const moving = useRef(false);
  const settle = useCallback(() => {
    window.clearTimeout(timer.current);
    moving.current = false;
    const next = optionsRef.current[liveRef.current];
    if (next !== undefined && next !== valueRef.current) onChangeRef.current(next);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const onScroll = () => {
      if (frame.current) cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => {
        const i = Math.min(optionsRef.current.length - 1, Math.max(0, Math.round(el.scrollTop / ROW)));
        if (i !== liveRef.current) {
          liveRef.current = i;
          setLive(i);
          tick();
        }
      });
      moving.current = true;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(settle, SETTLE_MS);
    };
    // Something else is touched or focused mid-roll: report the band's row now. Capture, so it
    // lands before that control's own handlers, and React has re-rendered by its click.
    const flush = (e: Event) => {
      if (!moving.current || el.contains(e.target as Node)) return;
      const i = Math.min(optionsRef.current.length - 1, Math.max(0, Math.round(el.scrollTop / ROW)));
      liveRef.current = i;
      setLive(i);
      settle();
    };
    // scrollend fires once the snap has landed; the timer covers browsers without it.
    const onEnd = () => requestAnimationFrame(settle);
    el.addEventListener('scroll', onScroll, { passive: true });
    el.addEventListener('scrollend', onEnd);
    document.addEventListener('pointerdown', flush, true);
    document.addEventListener('focusin', flush, true);
    return () => {
      el.removeEventListener('scroll', onScroll);
      el.removeEventListener('scrollend', onEnd);
      document.removeEventListener('pointerdown', flush, true);
      document.removeEventListener('focusin', flush, true);
      window.clearTimeout(timer.current);
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [settle]);

  const rollTo = (i: number) => {
    const el = ref.current;
    const to = Math.min(options.length - 1, Math.max(0, i));
    if (!el) return;
    el.scrollTo({ top: to * ROW, behavior: reducedMotion() ? 'auto' : 'smooth' });
    if (reducedMotion()) {
      liveRef.current = to;
      setLive(to);
      settle();
    }
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    const moves: Record<string, number> = {
      ArrowUp: -1, ArrowDown: 1, PageUp: -5, PageDown: 5, Home: -options.length, End: options.length,
    };
    const move = moves[event.key];
    if (move === undefined) return;
    event.preventDefault();
    // Keys change the value at once: no waiting for a scroll to settle.
    const to = Math.min(options.length - 1, Math.max(0, liveRef.current + move));
    liveRef.current = to;
    setLive(to);
    onChange(options[to]);
  };

  return (
    <div
      ref={attach}
      className={`adm-wheel__col${className ? ` ${className}` : ''}`}
      role="spinbutton"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={options[0]}
      aria-valuemax={options[options.length - 1]}
      aria-valuenow={options[live]}
      aria-valuetext={valueText(options[live])}
      onKeyDown={onKeyDown}
    >
      {options.map((n, i) => (
        <div
          key={n}
          className={`adm-wheel__row${i === live ? ' is-on' : ''}`}
          aria-hidden="true"
          onClick={() => rollTo(i)}
        >
          <b>{format ? format(n) : n}</b>
          {unit && <span>{unit}</span>}
        </div>
      ))}
    </div>
  );
};
