import React, { useEffect, useId, useState } from 'react';
import { BookUser } from 'lucide-react';
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

/** Pick from contacts, a round button beside Phone: only where the phone has a contact picker, so nobody taps a button that can't work. */
export const ContactsButton: React.FC<{ onPick: (p: Picked) => void }> = ({ onPick }) => {
  const toast = useToast();
  const [choosing, setChoosing] = useState<{ name: string; phones: string[] } | null>(null);
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
    if (phones.length > 1) return setChoosing({ name, phones });
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
        <BookUser size={18} strokeWidth={1.75} aria-hidden="true" />
      </button>
      <AdminSheet isOpen={!!choosing} onClose={() => setChoosing(null)} title={copy.whichNumber(choosing?.name ?? '')} closeLabel={adminCopy.close}>
        <div className="adm-of__numbers">
          {choosing?.phones.map((phone) => (
            <button key={phone} type="button" onClick={() => choose(phone)}>{plain(phone)}</button>
          ))}
        </div>
      </AdminSheet>
    </>
  );
};
