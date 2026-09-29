import React, { useEffect, useId, useRef, useState } from 'react';
import { adminCopy } from '../../data/adminCopy';
import { AdminSheet } from '../AdminSheet';
import { getCustomers } from '../api';
import { useToast } from '../toast';
import type { Customer } from '../types';
import { contactNumbers, plainPhone } from './model';

// Filling "Who it's for" on Add order: past customers under the name box, and
// a contacts button beside Phone where the phone has a contact picker (Android Chrome only).

const copy = adminCopy.orderForm;

/** What both fill in. The number is digits as the server stores them. */
export interface Picked { name: string; phone: string; pincode?: string | null }

const MAX = 5;
/** Numbers the way this form's Phone box shows them: 9876543210, or +447700900456. */
const plain = (digits: string) => plainPhone(digits) ?? digits;

/**
 * The name box as a combobox: typing 2+ letters (or 3+ digits) lists up to five
 * people who ordered before; a tap, or ↓ ↑ and Enter, fills them in. Spread
 * `inputProps` on the name input and put `list` right after the name field.
 */
export const useNameSuggestions = (name: string, onPick: (p: Picked) => void) => {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [people, setPeople] = useState<Customer[]>([]);
  const [active, setActive] = useState(-1);
  const query = name.trim();

  // Asked 250ms after typing stops; a late answer for older text is dropped.
  useEffect(() => {
    setActive(-1);
    if (!open || query.length < 2) return setPeople([]);
    let live = true;
    const timer = setTimeout(() => {
      // The server matches anywhere in a name; here only a word's start counts, so "An" finds Anita, not Rohan.
      const words = ` ${query.toLowerCase()}`;
      getCustomers(query).then(({ customers }) => {
        if (live) setPeople(customers.filter((c) => /\d/.test(query) || ` ${c.name ?? ''}`.toLowerCase().includes(words)).slice(0, MAX));
      }, () => {});
    }, 250);
    return () => { live = false; clearTimeout(timer); };
  }, [query, open]);

  const shown = open && query.length >= 2 && people.length > 0;
  const pick = (c: Customer) => {
    setOpen(false);
    onPick({ name: c.name ?? '', phone: c.phone, pincode: c.pincode });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!shown) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      // Cycles through "none" (-1, the name box itself) and each person.
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => ((i + 1 + step + people.length + 1) % (people.length + 1)) - 1);
    } else if (e.key === 'Enter' && active >= 0 && people[active]) {
      e.preventDefault(); // pick, don't submit the form
      pick(people[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const optionId = (i: number) => `${listId}-${i}`;
  const inputProps = {
    role: 'combobox',
    'aria-autocomplete': 'list' as const,
    'aria-expanded': shown,
    'aria-controls': listId,
    'aria-activedescendant': shown && active >= 0 ? optionId(active) : undefined,
    onKeyDown,
    onInput: () => setOpen(true),
    onBlur: () => setOpen(false),
  };

  const list = (
    <ul id={listId} role="listbox" aria-label={copy.suggestions} className="adm-of__suggest" hidden={!shown}>
      {shown && people.map((c, i) => (
        // Options aren't focusable: pressing one keeps focus in the name box, so it doesn't blur shut first.
        <li key={c.phone} id={optionId(i)} role="option" aria-selected={i === active}
          onMouseDown={(e) => e.preventDefault()} onClick={() => pick(c)}>
          <b>{c.name ?? plain(c.phone)}</b>
          {c.name && <small>{plain(c.phone)}</small>}
        </li>
      ))}
    </ul>
  );

  return { inputProps, list };
};

// The Contact Picker API isn't in TypeScript's DOM types yet.
interface ContactsManager { select: (props: ('name' | 'tel')[], options?: { multiple?: boolean }) => Promise<{ name?: string[]; tel?: string[] }[]> }
const contacts = typeof navigator !== 'undefined' ? (navigator as Navigator & { contacts?: ContactsManager }).contacts : undefined;

/** The usual contacts icon: an address book with a person on the page (Material's "contacts"). */
const ContactBookIcon: React.FC = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M20 0H4v2h16V0zM4 24h16v-2H4v2zM20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-8 2.75c1.24 0 2.25 1.01 2.25 2.25s-1.01 2.25-2.25 2.25S9.75 10.24 9.75 9 10.76 6.75 12 6.75zM17 17H7v-1.5c0-1.67 3.33-2.5 5-2.5s5 .83 5 2.5V17z" />
  </svg>
);

/** How long the number chooser ignores a close after it opens. The phone's own picker's Done tap can land on the page right as it closes. */
const SETTLE_MS = 500;

/** Pick from contacts, a round button beside Phone: only where the phone has a contact picker, so nobody taps a button that can't work. */
export const ContactsButton: React.FC<{ onPick: (p: Picked) => void }> = ({ onPick }) => {
  const toast = useToast();
  const [choosing, setChoosing] = useState<{ name: string; phones: string[] } | null>(null);
  const openedAt = useRef(0);
  if (!contacts?.select) return null;

  const open = async () => {
    let chosen;
    try {
      [chosen] = await contacts.select(['name', 'tel'], { multiple: false });
    } catch {
      return toast.show({ text: copy.contactsFailed });
    }
    if (!chosen) return; // closed without picking
    const name = (chosen.name ?? []).map((n) => n.trim()).find(Boolean)?.slice(0, 60) ?? '';
    const phones = contactNumbers(chosen.tel ?? []);
    if (phones.length > 1) {
      openedAt.current = Date.now();
      return setChoosing({ name, phones });
    }
    if (phones.length === 1) return onPick({ name, phone: phones[0] });
    // No number we can use: keep the name, and say so.
    if (name) onPick({ name, phone: '' });
    toast.show({ text: copy.noNumber(name) });
  };

  const choose = (phone: string) => {
    if (choosing) onPick({ name: choosing.name, phone });
    setChoosing(null);
  };

  return (
    <>
      <button type="button" className="adm-of__contacts" aria-label={copy.pickContact} title={copy.pickContact} onClick={() => void open()}>
        <ContactBookIcon />
      </button>
      <AdminSheet isOpen={!!choosing} onClose={() => setChoosing(null)} title={copy.whichNumber(choosing?.name ?? '')} closeLabel={adminCopy.close}
        canClose={() => Date.now() - openedAt.current > SETTLE_MS}>
        <div className="adm-of__numbers">
          {choosing?.phones.map((phone) => (
            <button key={phone} type="button" onClick={() => choose(phone)}>{plain(phone)}</button>
          ))}
        </div>
      </AdminSheet>
    </>
  );
};
