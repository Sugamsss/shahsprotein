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
    withBody = false,
  ) => {
    const Host: React.FC = () => {
      const [text, setText] = React.useState(initial);
      return (
        <form onSubmit={onSubmit}>
          {withBody ? <div className="adm-sheet__body"><VendorField value={text} vendors={vendors} onChange={setText} error={error} /></div> : <VendorField value={text} vendors={vendors} onChange={setText} error={error} />}
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
    // Each case gives the box its own viewport; drop it so the next starts clean.
    if (Object.prototype.hasOwnProperty.call(window, 'visualViewport')) {
      delete (window as unknown as { visualViewport?: unknown }).visualViewport;
    }
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

  it('fits below the input in a panned visual viewport', () => {
    const viewport = new EventTarget() as VisualViewport;
    Object.defineProperties(viewport, {
      offsetTop: { configurable: true, value: 200 },
      height: { configurable: true, value: 300 },
    });
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
    render('', undefined, null, true);
    const body = document.querySelector('.adm-sheet__body')!;
    const input = box();
    vi.spyOn(body, 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: 800, left: 0, right: 300, width: 300, height: 800, x: 0, y: 0, toJSON: () => ({}) });
    const inputRect = vi.spyOn(input, 'getBoundingClientRect').mockReturnValue({ top: 210, bottom: 254, left: 0, right: 200, width: 200, height: 44, x: 0, y: 210, toJSON: () => ({}) });
    focusBox();
    expect(list().classList.contains('adm-vend--above')).toBe(false);
    expect(list().dataset.rows).toBe('4');

    // Panning down, the visible band moves with the box, and the card follows it.
    inputRect.mockReturnValue({ top: 380, bottom: 424, left: 0, right: 200, width: 200, height: 44, x: 0, y: 380, toJSON: () => ({}) });
    act(() => { viewport.dispatchEvent(new Event('resize')); });
    expect(list().dataset.rows).toBe('1');

    // Near the band's foot there is no room below, and above is measured from the
    // band's top (400), not from the layout viewport's 0.
    Object.defineProperties(viewport, {
      offsetTop: { configurable: true, value: 400 },
      height: { configurable: true, value: 200 },
    });
    inputRect.mockReturnValue({ top: 560, bottom: 604, left: 0, right: 200, width: 200, height: 44, x: 0, y: 560, toJSON: () => ({}) });
    act(() => { viewport.dispatchEvent(new Event('scroll')); });
    expect(list().classList.contains('adm-vend--above')).toBe(true);
    expect(list().dataset.rows).toBe('3');
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

  it('scrolls the fifth keyboard-selected vendor into the card without moving the page', () => {
    render();
    focusBox();
    const card = list();
    Object.defineProperty(card, 'clientHeight', { configurable: true, value: 196 });
    options().forEach((option, index) => {
      Object.defineProperty(option, 'offsetTop', { configurable: true, value: 6 + index * 46 });
      Object.defineProperty(option, 'offsetHeight', { configurable: true, value: 44 });
    });
    // jsdom has no scrollIntoView, so the method is put on the real DOM chain where
    // the component's own call would find it — not on a detached vi.fn.
    const scrollIntoView = vi.fn();
    Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView });
    const scrollPage = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    const scrollByPage = vi.spyOn(window, 'scrollBy').mockImplementation(() => undefined);
    expect(options()[0].scrollIntoView).toBe(scrollIntoView);
    for (let i = 0; i < 5; i += 1) press('ArrowDown');
    delete (Element.prototype as unknown as { scrollIntoView?: unknown }).scrollIntoView;
    expect(options()[4].getAttribute('aria-selected')).toBe('true');
    expect(card.scrollTop).toBeGreaterThan(0);
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(scrollPage).not.toHaveBeenCalled();
    expect(scrollByPage).not.toHaveBeenCalled();
  });

  it('scrolls an upward keyboard selection back to the top of the card', () => {
    render();
    focusBox();
    const card = list();
    Object.defineProperty(card, 'clientHeight', { configurable: true, value: 104 });
    options().forEach((option, index) => {
      Object.defineProperty(option, 'offsetTop', { configurable: true, value: 6 + index * 46 });
      Object.defineProperty(option, 'offsetHeight', { configurable: true, value: 44 });
    });
    for (let i = 0; i < 5; i += 1) press('ArrowDown');
    expect(card.scrollTop).toBeGreaterThan(0);
    press('ArrowUp');
    expect(options()[3].getAttribute('aria-selected')).toBe('true');
    expect(card.scrollTop).toBe(130);
    press('ArrowUp');
    expect(options()[2].getAttribute('aria-selected')).toBe('true');
    expect(card.scrollTop).toBe(98);
  });

  it('brings the active vendor back into a card that a short screen shrank', () => {
    render();
    const input = box();
    const card = list();
    const heights: Record<string, number> = { '1': 58, '2': 104, '3': 150, '4': 196 };
    Object.defineProperty(card, 'clientHeight', { configurable: true, get: () => heights[card.dataset.rows ?? ''] ?? 0 });
    vi.spyOn(input, 'getBoundingClientRect').mockReturnValue({ top: 100, bottom: 144, left: 0, right: 200, width: 200, height: 44, x: 0, y: 100, toJSON: () => ({}) });
    const innerHeight = vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(768);
    focusBox();
    // The options exist once the box opens; they keep their nodes as the card shrinks.
    options().forEach((option, index) => {
      Object.defineProperty(option, 'offsetTop', { configurable: true, value: 6 + index * 46 });
      Object.defineProperty(option, 'offsetHeight', { configurable: true, value: 44 });
    });
    expect(card.dataset.rows).toBe('4');

    press('ArrowDown');
    press('ArrowDown');
    press('ArrowDown');
    expect(options()[2].getAttribute('aria-selected')).toBe('true');
    expect(card.scrollTop).toBe(0);

    // The keyboard was up and the screen short: only one row fits now, and the third
    // option sits below it. Its own card scrolls; the page and the sheet do not.
    innerHeight.mockReturnValue(222);
    act(() => { window.dispatchEvent(new Event('resize')); });
    expect(card.dataset.rows).toBe('1');
    expect(card.scrollTop).toBe(84);
    expect(input.getAttribute('aria-activedescendant')).toBe(options()[2].id);
    expect(98).toBeGreaterThanOrEqual(card.scrollTop);
    expect(142).toBeLessThanOrEqual(card.scrollTop + card.clientHeight);
  });

  it('does not advertise an expanded list when neither side has room', () => {
    render();
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(0);
    vi.spyOn(box(), 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: 40, left: 0, right: 100, width: 100, height: 40, x: 0, y: 0, toJSON() {} });
    focusBox();
    expect(box().getAttribute('aria-expanded')).toBe('false');
    expect(list().hidden).toBe(true);
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
