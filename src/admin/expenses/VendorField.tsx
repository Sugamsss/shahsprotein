import React, { useEffect, useId, useRef, useState } from 'react';
import { adminCopy } from '../../data/adminCopy';
import type { ExpenseVendor } from '../types';
import { normalizeVendor, VENDOR_MAX, vendorMatches } from './model';

const copy = adminCopy.expenses;

/**
 * The card's own geometry, mirrored from expenses.css (.adm-vend): 1px edge, 6px
 * padding, 44px rows, 2px between them. It is four rows tall at most.
 */
const CARD = { air: 6, edge: 1, pad: 6, row: 44, gap: 2, rows: 4 };
const cardHeight = (rows: number) => CARD.edge * 2 + CARD.pad * 2 + rows * CARD.row + (rows - 1) * CARD.gap;
const CARD_MAX = cardHeight(CARD.rows); // 196

/**
 * The Vendor box as a combobox, the way Add order's name box behaves: an empty box
 * on focus lists the five used most recently, typing narrows it (a name that starts
 * with the letters first, then one with a word that does), ↓ ↑ and Enter pick, Esc
 * closes the list only, Tab leaves without picking. Free text is always kept: the
 * list is a shortcut, never a gate.
 *
 * The opened list is a floating card over Date and Time, not a list that pushes them
 * down (the sheet jumped every time it opened, and on a phone it shoved Date behind
 * the keyboard). It hangs 6px under the box: the box is inside `.adm-field__control`,
 * which is already `position: relative`, so the card is under the input and not under
 * a hint line.
 */
export const VendorField: React.FC<{
  value: string;
  onChange: (value: string) => void;
  vendors: ExpenseVendor[];
  /** Too long (the sheet checks it on save); it takes the line under the box, not the hint. */
  error?: string | null;
  /** The sheet's handle on the box, for its error's focus. */
  inputRef?: React.RefObject<HTMLInputElement>;
}> = ({ value, onChange, vendors, error, inputRef }) => {
  const fieldId = useId();
  const listId = useId();
  const noteId = useId();
  const ownBox = useRef<HTMLInputElement>(null);
  const box = inputRef ?? ownBox;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const query = normalizeVendor(value);
  const { items, exact } = vendorMatches(vendors, value);
  const shown = open && items.length > 0;
  /** Enough typed to be a name, and nothing we know: say a typo would become a new vendor. */
  const hint = open && query.length >= 2 && items.length === 0 && !exact;
  /** One line under the box: the error if there is one, else the quiet new-vendor hint. */
  const note = error ?? (hint ? copy.vendorNew : null);

  const close = () => {
    setOpen(false);
    setActive(-1);
  };

  const pick = (name: string) => {
    onChange(name);
    close();
  };

  // The sheet handles Escape twice: AdminSheet blurs a field (document, capture) and
  // useDialog closes the sheet (window). The vendor field mounts after the sheet, so
  // its listener would run last and the key would never get here. Window capture is
  // the first thing a key reaches, whatever the order it was added in: the list
  // closes, and stopping *immediate* propagation keeps the sheet's own doors shut.
  const shownRef = useRef(false);
  shownRef.current = shown;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !shownRef.current || event.target !== box.current) return;
      event.stopImmediatePropagation();
      close();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  // The card hangs under the box, and this sheet's body both scrolls and clips. So the
  // card is capped to the room below the box, in whole rows: on a short screen (or with
  // the keyboard up) it shows three rows, or two, and the rest scrolls inside the card.
  // The two alternatives are worse: its foot cut off by the body, or the body scrolling
  // the whole form up to make room, which moves Date and Time every time it opens.
  const [cardMax, setCardMax] = useState(CARD_MAX);
  useEffect(() => {
    if (!shown) return undefined;
    const fit = () => {
      const boxElement = box.current;
      if (!boxElement) return;
      const body = boxElement.closest('.adm-sheet__body');
      const limit = Math.min(body ? body.getBoundingClientRect().bottom : window.innerHeight, window.innerHeight);
      // 2px of air, so a 1px border never ends up sitting on the clip.
      const room = limit - boxElement.getBoundingClientRect().bottom - CARD.air - 2;
      const rows = Math.min(CARD.rows, Math.floor((room - CARD.edge * 2 - CARD.pad * 2 + CARD.gap) / (CARD.row + CARD.gap)));
      setCardMax(cardHeight(Math.max(1, rows)));
    };
    fit();
    window.addEventListener('resize', fit);
    document.addEventListener('scroll', fit, true);
    return () => {
      window.removeEventListener('resize', fit);
      document.removeEventListener('scroll', fit, true);
    };
  }, [shown]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!shown) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      // Cycles through "none" (-1, the box itself) and each vendor.
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => ((i + 1 + step + items.length + 1) % (items.length + 1)) - 1);
    } else if (event.key === 'Enter' && active >= 0 && items[active]) {
      event.preventDefault(); // pick, don't save the form
      pick(items[active].name);
    }
  };

  return (
    <div className="adm-field adm-vend-field">
      <label htmlFor={fieldId} className="adm-field__label">{copy.vendor}<small>{copy.optional}</small></label>
      <div className="adm-field__control">
        <input ref={box} id={fieldId} className="adm-input" type="text" autoComplete="off" maxLength={VENDOR_MAX}
          placeholder={copy.vendorPlaceholder} value={value} role="combobox" aria-autocomplete="list"
          aria-expanded={shown} aria-controls={listId} aria-describedby={note ? noteId : undefined}
          aria-invalid={error ? true : undefined}
          aria-activedescendant={shown && active >= 0 ? `${listId}-${active}` : undefined}
          onChange={(event) => { onChange(event.target.value); setActive(-1); setOpen(true); }}
          onFocus={() => { setActive(-1); setOpen(true); }}
          onBlur={close}
          onKeyDown={onKeyDown} />
        {/* The one dynamic measurement in this box: how much room is left under it, which
            only the browser knows (see the fit effect). Everything else is a class. */}
        <ul id={listId} role="listbox" aria-label={copy.vendorsLabel} className="adm-vend"
          hidden={!shown} style={shown ? { maxHeight: cardMax } : undefined}>
          {shown && items.map((item, i) => (
            // Options aren't focusable: pressing one keeps focus in the box, so it doesn't blur shut first.
            <li key={item.name} id={`${listId}-${i}`} role="option" aria-selected={i === active}
              onMouseDown={(event) => event.preventDefault()} onClick={() => pick(item.name)}>
              <b className="adm-vend__name">
                {item.at < 0 || !query.length
                  ? item.name
                  : <>
                    {item.name.slice(0, item.at)}
                    <span className="adm-vend__hit">{item.name.slice(item.at, item.at + query.length)}</span>
                    {item.name.slice(item.at + query.length)}
                  </>}
              </b>
              <small>{copy.entries(item.count)}</small>
            </li>
          ))}
        </ul>
      </div>
      {note && (
        <span id={noteId} className={error ? 'adm-field__error' : 'adm-field__hint'}>{note}</span>
      )}
    </div>
  );
};
