// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExpenseVendor } from '../types';
import { VendorField } from './VendorField';

// The vendor list's own doors: what a keyboard does with it, and that the sheet's
// Escape handling can't take the key away from the list.

const vendors: ExpenseVendor[] = [
  { name: 'Satara Packaging', count: 4, last_used: '2026-11-14' },
  { name: 'Patil Traders', count: 2, last_used: '2026-11-13' },
  { name: 'DTDC Satara', count: 1, last_used: '2026-11-12' },
  { name: 'Bharat Gas Agency', count: 1, last_used: '2026-11-10' },
  { name: 'Rajesh Printers', count: 3, last_used: '2026-11-09' },
  { name: 'Blue Dart', count: 1, last_used: '2026-10-27' },
];

describe('the vendor box', () => {
  let root: Root;
  let container: HTMLDivElement;

  const box = () => document.querySelector('input[role="combobox"]') as HTMLInputElement;
  const list = () => document.querySelector('ul[role="listbox"]') as HTMLUListElement;
  const options = () => [...document.querySelectorAll('li[role="option"]')];
  const names = () => options().map((option) => option.querySelector('b')?.textContent ?? '');

  const render = (
    initial = '',
    onSubmit: (event: React.FormEvent) => void = (event) => event.preventDefault(),
    error: string | null = null,
  ) => {
    const Host: React.FC = () => {
      const [text, setText] = React.useState(initial);
      return (
        <form onSubmit={onSubmit}>
          <VendorField value={text} vendors={vendors} onChange={setText} error={error} />
        </form>
      );
    };
    act(() => root.render(<Host />));
  };

  /** Typing, the way the browser delivers it: the input event React listens for. */
  const type = (text: string) => act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(box(), text);
    box().dispatchEvent(new Event('input', { bubbles: true }));
  });

  const focusBox = () => act(() => box().focus());
  const press = (key: string) => act(() => {
    box().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  });

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    vi.stubGlobal('matchMedia', () => ({
      matches: false, media: '', onchange: null,
      addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
    }));
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('lists the five used most recently when an empty box takes focus', () => {
    render();
    focusBox();
    expect(list().hidden).toBe(false);
    expect(names()).toEqual(['Satara Packaging', 'Patil Traders', 'DTDC Satara', 'Bharat Gas Agency', 'Rajesh Printers']);
    // The count is what the right side says, and no letters are bold with nothing typed.
    expect(options()[0].querySelector('small')?.textContent).toBe('4 entries');
    expect(document.querySelector('.adm-vend__hit')).toBeNull();
  });

  it('narrows as you type, with the typed letters bold, and keeps the typing', () => {
    render();
    focusBox();
    type('pa');
    expect(names()).toEqual(['Patil Traders', 'Satara Packaging']);
    expect(document.querySelector('.adm-vend__hit')?.textContent).toBe('Pa');
    expect(box().value).toBe('pa');
  });

  it('picks with ↓ and Enter, without saving the form', () => {
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    render('', onSubmit);
    focusBox();
    type('patil');
    press('ArrowDown');
    expect(options()[0].getAttribute('aria-selected')).toBe('true');
    press('Enter');
    expect(box().value).toBe('Patil Traders');
    expect(list().hidden).toBe(true);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('closes the list on Escape only, and keeps the cursor in the box', () => {
    // The sheet's two Escape doors were added before the box existed, exactly as on the
    // real page: AdminSheet blurs a field (document, capture), useDialog closes the
    // sheet (window). Neither may see a key the list has taken.
    const sheetSaw: string[] = [];
    const onSheetEsc = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      sheetSaw.push('sheet');
      box()?.blur();
    };
    document.addEventListener('keydown', onSheetEsc, true);
    window.addEventListener('keydown', onSheetEsc);

    render();
    focusBox();
    expect(list().hidden).toBe(false);

    press('Escape');
    document.removeEventListener('keydown', onSheetEsc, true);
    window.removeEventListener('keydown', onSheetEsc);

    expect(sheetSaw).toEqual([]);
    expect(list().hidden).toBe(true);
    expect(document.activeElement).toBe(box());
    expect(box().value).toBe('');
  });

  it('shows the error it is given instead of the hint, and says so to a screen reader', () => {
    render('', undefined, 'Keep the vendor under 80 characters.');
    focusBox();
    type('ko');
    expect(document.querySelector('.adm-field__error')?.textContent).toBe('Keep the vendor under 80 characters.');
    // The new-vendor hint gives way: only one line under the box.
    expect(document.querySelector('.adm-field__hint')).toBeNull();
    expect(box().getAttribute('aria-invalid')).toBe('true');
    const note = document.getElementById(box().getAttribute('aria-describedby')!);
    expect(note?.textContent).toBe('Keep the vendor under 80 characters.');
  });

  it('leaves on Tab without picking', () => {
    render();
    focusBox();
    const away = document.createElement('button');
    document.body.appendChild(away);
    act(() => away.focus());
    expect(list().hidden).toBe(true);
    expect(box().value).toBe('');
    away.remove();
  });

  it('says a new vendor will be remembered, but not for a name it already has', () => {
    render();
    focusBox();
    type('ko');
    // Nothing matches "ko": the list is closed, the free text stays, and it explains why.
    expect(list().hidden).toBe(true);
    expect(box().value).toBe('ko');
    expect(document.querySelector('.adm-field__hint')?.textContent).toBe('New vendor. We’ll remember it.');

    type('Satara Packaging');
    // Exactly a name it knows: nothing to offer, and nothing to warn about either.
    expect(list().hidden).toBe(true);
    expect(document.querySelector('.adm-field__hint')).toBeNull();

    type('s');
    expect(list().hidden).toBe(false);
    expect(document.querySelector('.adm-field__hint')).toBeNull();
  });
});
