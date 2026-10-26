import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BadgeCheck, PartyPopper, Sparkles, Volume2, VolumeX } from 'lucide-react';
import { OrderThumb } from '../../components/order/OrderThumb';
import { useDialog } from '../../components/ui/useDialog';
import { adminCopy } from '../../data/adminCopy';
import { productsData } from '../../data/products';
import type { Product } from '../../types/product';
import { formatMoney, formatMoneyShort, formatWeight } from '../format';
import { dimStatusBar } from '../homeScreenApp';
import type { Order } from '../types';
import { MAX_QUANTITY, hypeLevel, typedNumber } from './bigOrder';
import { itemsText } from './model';
import { partySoundOn, playParty, setPartySoundOn, unlockPartySound, type PartyKind } from './partySound';

const copy = adminCopy.orderForm.big;

type Css = React.CSSProperties & Record<`--${string}`, string | number>;

// Big orders in Add order: the party when "Big order?" is tapped, the big order card and
// lines (typed packs and price per pack), and the party again when it's saved. Every piece
// of the party is CSS (big-order.css); with reduced motion only the words and buttons show.

// ---- The party's pieces, made once --------------------------------------------------------

const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const secs = (n: number) => `${n.toFixed(2)}s`;

/** Shot from the two bottom corners on four paths each. */
const CANNON = range(40).map((i) => ({
  className: `adm-fx-bit adm-fx-bit--${i % 4} adm-fx-c${i % 8} adm-fx-cannon adm-fx-cannon--${i % 2 ? 'r' : 'l'}${((i >> 1) % 4) + 1}`,
  style: { '--dur': secs(1.6 + (i % 5) * 0.15), '--delay': secs(0.05 + (i % 6) * 0.04) } as Css,
}));
/** Keeps falling while the party is on. */
const RAIN = range(28).map((i) => ({
  className: `adm-fx-bit adm-fx-bit--${(i + 1) % 4} adm-fx-c${(i + 3) % 8} adm-fx-rain adm-fx-rain--${i % 2 ? 'a' : 'b'}`,
  style: { '--x': `${2 + ((i * 37) % 95)}%`, '--dur': secs(2.8 + (i % 4) * 0.35), '--delay': secs(0.8 + ((i * 0.37) % 2.4)) } as Css,
}));
/** Four fireworks, one after another, 12 sparks each. */
const SPARKS = [[18, 18], [82, 23], [23, 77], [77, 73]].flatMap(([x, y], b) => range(12).map((k) => ({
  className: `adm-fx-spark adm-fx-spark--${k} adm-fx-burst${b}`,
  style: { '--x': `${x}%`, '--y': `${y}%`, '--delay': secs(0.35 + b * 0.5) } as Css,
})));
const BALLOONS = range(7).map((i) => ({
  className: `adm-fx-balloon adm-fx-b${i}`,
  style: { '--x': `${2 + i * 13.5}%`, '--dur': secs(5 + (i % 3) * 0.9), '--delay': secs(0.2 + ((i * 0.55) % 2.5)), '--sway': secs(-i * 0.3) } as Css,
}));
const STARS = [[8, 11], [38, 7], [67, 12], [90, 8], [5, 36], [92, 33], [10, 56], [88, 59], [33, 25], [64, 27], [18, 66], [80, 66], [46, 83], [51, 15]]
  .map(([x, y], i) => ({
    className: `adm-fx-star adm-fx-star--${i % 3}`,
    style: { '--x': `${x}%`, '--y': `${y}%`, '--dur': secs(1.2 + (i % 4) * 0.3), '--delay': secs((i * 0.23) % 1.6) } as Css,
  }));
const NOTES = [[8, 47], [20, 52], [77, 46], [90, 51], [36, 53], [62, 50], [3, 56], [93, 54]].map(([x, y], i) => ({
  className: `adm-fx-note adm-fx-c${[1, 4, 6, 3][i % 4]}`,
  style: { '--x': `${x}%`, '--y': `${y}%`, '--delay': secs(0.9 + i * 0.3) } as Css,
}));
/** The dance floor: two rows that flash in turns on the beat. */
const TILES = range(16).map((i) => {
  const turn = i + Math.floor(i / 8);
  return { className: `adm-party__tile adm-fx-t${turn % 4}`, style: { '--delay': secs((turn % 2) * 0.5) } as Css };
});
/** A marigold toran: strands longest in the middle, swaying out of step. */
const TORAN = [2, 3, 3, 4, 4, 5, 5, 5, 4, 4, 3, 3, 2].map((flowers, i) => ({
  flowers: range(flowers).map((k) => ((k + i) % 2 ? 'is-yellow' : 'is-orange')),
  style: { '--delay': secs(-i * 0.25) } as Css,
}));
const letters = (word: string, start: number) => word.split('').map((ch, i) => ({
  ch,
  style: { '--delay': secs(start + i * 0.09), '--beat': secs(1.4 + i * 0.07) } as Css,
}));
const TOP = letters(copy.party.top, 0.3);
const BOTTOM = letters(copy.party.bottom, 0.6);

// ---- Pieces -----------------------------------------------------------------------------

const Bits: React.FC<{ list: { className: string; style: Css }[] }> = ({ list }) => (
  <>{list.map((b, i) => <i key={i} className={b.className} style={b.style} />)}</>
);

const Balloon: React.FC = () => (
  <svg viewBox="0 0 48 80" width="48" height="80">
    <ellipse cx="24" cy="24" rx="20" ry="24" className="adm-fx-balloon__body" />
    <ellipse cx="16" cy="15" rx="5" ry="8" className="adm-fx-balloon__shine" />
    <path d="M20 47 L28 47 L24 53 Z" className="adm-fx-balloon__body" />
    <path d="M24 53 C 18 60, 30 67, 24 80" className="adm-fx-balloon__string" />
  </svg>
);

const Star: React.FC = () => (
  <svg viewBox="0 0 24 24"><path d="M12 0 L14.5 9.5 L24 12 L14.5 14.5 L12 24 L9.5 14.5 L0 12 L9.5 9.5 Z" /></svg>
);

const Note: React.FC = () => (
  <svg viewBox="0 0 22 24" width="22" height="24">
    <ellipse cx="6" cy="18" rx="5" ry="4" />
    <path d="M10.5 18 V3 Q16 5 18 10" />
  </svg>
);

const Popper: React.FC<{ side: 'l' | 'r' }> = ({ side }) => (
  <svg className={`adm-party__popper adm-party__popper--${side}`} viewBox="0 0 84 84" width="84" height="84" aria-hidden="true">
    <path d="M6 80 L30 26 L58 54 Z" className="adm-party__popper-cone" />
    <path d="M14 62 L44 40" className="adm-party__popper-band" />
    <path d="M22 44 L50 47" className="adm-party__popper-stripe" />
    <path d="M30 26 L58 54" className="adm-party__popper-rim" />
    <path d="M50 14 L54 4 M62 22 L74 16 M66 34 L78 34" className="adm-party__popper-pop" />
  </svg>
);

/** A pouch with a face, dancing: arms up and down on the beat, legs kicking in turns. */
const Dancer: React.FC<{ product: Product; small?: boolean; order: number }> = ({ product, small, order }) => {
  const words = product.name.split(' ');
  return (
    <div className={`adm-dancer adm-dancer--${product.id}${small ? ' adm-dancer--small' : ''}`} style={{ '--n': order } as Css}>
      <div className="adm-dancer__sway">
        <div className="adm-dancer__twirl">
          <div className="adm-dancer__bob">
            <svg viewBox="0 0 100 150" role="img" aria-label={copy.party.dancer(product.name)}>
              <g className="adm-dancer__leg adm-dancer__leg--l"><path d="M40 108 L36 136" /><ellipse cx="33" cy="139" rx="8" ry="4.5" /></g>
              <g className="adm-dancer__leg adm-dancer__leg--r"><path d="M60 108 L64 136" /><ellipse cx="67" cy="139" rx="8" ry="4.5" /></g>
              <g className="adm-dancer__arm adm-dancer__arm--l"><path d="M20 62 L5 88" /><circle cx="5" cy="88" r="5.5" /></g>
              <g className="adm-dancer__arm adm-dancer__arm--r"><path d="M80 62 L95 88" /><circle cx="95" cy="88" r="5.5" /></g>
              <rect x="18" y="22" width="64" height="88" rx="12" className="adm-dancer__body" />
              <rect x="20" y="14" width="60" height="12" rx="3" className="adm-dancer__seal" />
              <path d="M20 26 l5 -4 l5 4 l5 -4 l5 4 l5 -4 l5 4 l5 -4 l5 4 l5 -4 l5 4 l5 -4 l5 4" className="adm-dancer__zigzag" />
              <circle cx="40" cy="42" r="4" className="adm-dancer__eye" /><circle cx="60" cy="42" r="4" className="adm-dancer__eye" />
              <circle cx="41.5" cy="40.5" r="1.3" className="adm-dancer__shine" /><circle cx="61.5" cy="40.5" r="1.3" className="adm-dancer__shine" />
              <circle cx="32" cy="51" r="4" className="adm-dancer__cheek" /><circle cx="68" cy="51" r="4" className="adm-dancer__cheek" />
              <path d="M41 50 Q50 62 59 50 Z" className="adm-dancer__mouth" />
              <rect x="26" y="64" width="48" height="34" rx="6" className="adm-dancer__label" />
              {words.length > 1 ? (
                <>
                  <text x="50" y="79" className="adm-dancer__name">{words[0]}</text>
                  <text x="50" y="91" className="adm-dancer__name">{words.slice(1).join(' ')}</text>
                </>
              ) : <text x="50" y="85" className="adm-dancer__name">{words[0]}</text>}
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
};

/** Sound on or off for the party, remembered on this device. Turning it on plays the dhol from the top. */
const SoundToggle: React.FC<{ kind: PartyKind; stopRef: React.MutableRefObject<(() => void) | null> }> = ({ kind, stopRef }) => {
  const [on, setOn] = useState(partySoundOn);
  const toggle = () => {
    const next = !on;
    setOn(next);
    setPartySoundOn(next);
    stopRef.current?.();
    stopRef.current = null;
    if (next) {
      unlockPartySound();
      stopRef.current = playParty(kind, { withBuzz: false });
    }
  };
  return (
    <button type="button" className="adm-party__sound" aria-pressed={on} aria-label={copy.party.sound} onClick={toggle}>
      {on ? <Volume2 size={20} strokeWidth={2} aria-hidden="true" /> : <VolumeX size={20} strokeWidth={2} aria-hidden="true" />}
    </button>
  );
};

/** Full screen, dark in both themes: focus trap, Esc and the exit from useDialog. The dhol plays while it's open. */
const PartyLayer: React.FC<{ isOpen: boolean; onClose: () => void; className: string; sound: PartyKind; children: (titleId: string, close: () => void) => React.ReactNode }> = ({
  isOpen, onClose, className, sound, children,
}) => {
  const { dialogRef, isClosing, requestClose } = useDialog({ isOpen, onClose });
  const layerRef = useRef<HTMLDivElement>(null);
  const stopSound = useRef<(() => void) | null>(null);
  const titleId = useId();
  // The status bar takes the party's night colour while it's up.
  useEffect(() => (isOpen && layerRef.current ? dimStatusBar(layerRef.current) : undefined), [isOpen]);
  // The dhol and the buzz start with the party and fade out as it closes.
  useEffect(() => {
    if (!isOpen) return undefined;
    stopSound.current = playParty(sound);
    return () => { stopSound.current?.(); stopSound.current = null; };
  }, [isOpen, sound]);
  useEffect(() => { if (isClosing) { stopSound.current?.(); stopSound.current = null; } }, [isClosing]);
  if (!isOpen) return null;
  return createPortal(
    <div ref={layerRef} className={`adm-party-layer${isClosing ? ' is-closing' : ''}`}>
      <div ref={dialogRef} className={`adm-party ${className}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className="adm-party__flash" aria-hidden="true" />
        <div className="adm-party__stage">
          {children(titleId, requestClose)}
        </div>
        {/* Last in the focus order: the party's own button keeps the first focus. */}
        <SoundToggle kind={sound} stopRef={stopSound} />
      </div>
    </div>,
    document.body,
  );
};

// ---- The party ----------------------------------------------------------------------------

/** "Big order?" tapped: lights down, poppers, fireworks, balloons and three pouches dancing. */
export const BigOrderParty: React.FC<{ isOpen: boolean; onClose: () => void; name: string }> = ({ isOpen, onClose, name }) => (
  <PartyLayer isOpen={isOpen} onClose={onClose} className="adm-party--start" sound="party">
    {(titleId, close) => (
      <>
        <div className="adm-party__fx" aria-hidden="true">
          <div className="adm-party__sun"><div className="adm-party__rays" /></div>
          <div className="adm-party__glow" />
          <div className="adm-party__beam adm-party__beam--a" />
          <div className="adm-party__beam adm-party__beam--b" />
          <div className="adm-party__beam adm-party__beam--c" />
          <div className="adm-party__disco" />
          {NOTES.map((n, i) => <i key={i} className={n.className} style={n.style}><Note /></i>)}
          {BALLOONS.map((b, i) => <i key={i} className={b.className} style={b.style}><i className="adm-fx-balloon__sway"><Balloon /></i></i>)}
          <Bits list={SPARKS} />
          {STARS.map((s, i) => <i key={i} className={s.className} style={s.style}><Star /></i>)}
          <Bits list={RAIN} />
          <Bits list={CANNON} />
        </div>
        <Popper side="l" />
        <Popper side="r" />
        <div className="adm-party__content">
          <h2 id={titleId} className="adm-party__word">
            <span className="visually-hidden">{`${copy.party.top} ${copy.party.bottom}`}</span>
            <span className="adm-party__word-top" aria-hidden="true">{TOP.map((l, i) => <span key={i} className="adm-party__letter" style={l.style}>{l.ch}</span>)}</span>
            <span className="adm-party__word-bottom" aria-hidden="true">{BOTTOM.map((l, i) => <span key={i} className="adm-party__letter" style={l.style}>{l.ch}</span>)}</span>
          </h2>
          <div className="adm-party__floor-wrap">
            <div className="adm-party__floor" aria-hidden="true"><Bits list={TILES} /></div>
            {productsData.map((p, i) => <Dancer key={p.id} product={p} order={i} />)}
          </div>
          <p className="adm-party__title">{copy.party.title(name)}</p>
          <p className="adm-party__body">{copy.party.body}</p>
          <button type="button" className="adm-party__go" onClick={close}>{copy.party.go}</button>
        </div>
      </>
    )}
  </PartyLayer>
);

/** A big order just saved: a gold tick between two dancers, the numbers, and its card. */
export const BigOrderSaved: React.FC<{ order: Order | null; grams: number; onDone: () => void; onView: () => void }> = ({ order, grams, onDone, onView }) => {
  const saved = copy.saved;
  const first = productsData[0];
  const last = productsData[productsData.length - 1];
  return (
    <PartyLayer isOpen={!!order} onClose={onDone} className="adm-party--saved" sound="saved">
      {(titleId, close) => order && (
        <>
          <div className="adm-party__fx" aria-hidden="true">
            <div className="adm-party__glow adm-party__glow--top" />
            {STARS.map((s, i) => <i key={i} className={s.className} style={s.style}><Star /></i>)}
            <Bits list={RAIN} />
            <Bits list={CANNON} />
          </div>
          <div className="adm-party__content adm-party__content--saved">
            <div className="adm-party__medal-row">
              <div className="adm-party__sun adm-party__sun--small" aria-hidden="true"><div className="adm-party__rays" /></div>
              <Dancer product={first} small order={0} />
              <span className="adm-party__medal" aria-hidden="true"><BadgeCheck size={60} strokeWidth={2} /></span>
              <Dancer product={last} small order={2} />
            </div>
            <h2 id={titleId} className="adm-party__saved-title">{saved.title}</h2>
            <p className="adm-party__body">{saved.sub(adminCopy.order.packs(order.packs), order.name ?? order.code)}</p>
            <div className="adm-big-stats adm-big-stats--saved">
              <span><b>{order.packs.toLocaleString('en-IN')}</b>{copy.packs}</span>
              <span><b>{formatWeight(grams)}</b>{saved.cook}</span>
              <span><b>{order.amount != null ? formatMoneyShort(order.amount) : '–'}</b>{copy.total}</span>
            </div>
            <div className="adm-party__card">
              <div className="adm-party__card-head">
                <b>{order.name ?? order.code}</b>
                <span className="adm-big-badge"><Sparkles size={12} strokeWidth={2.4} aria-hidden="true" />{copy.badge}</span>
              </div>
              <p>{itemsText(order)}</p>
              <div className="adm-party__card-foot">
                <span className="adm-party__stage-chip">{adminCopy.order.steps[order.status as keyof typeof adminCopy.order.steps] ?? order.status}</span>
                {order.amount != null && <b>{formatMoney(order.amount)}</b>}
              </div>
            </div>
            {order.status === 'cooking' && <p className="adm-party__note">{saved.cooking}</p>}
            <div className="adm-party__actions">
              <button type="button" className="adm-party__go adm-party__go--now" onClick={close}>{saved.done}</button>
              <button type="button" className="adm-party__link" onClick={onView}>{saved.view}</button>
            </div>
          </div>
        </>
      )}
    </PartyLayer>
  );
};

// ---- Big order mode on the form -----------------------------------------------------------

export const Toran: React.FC = () => (
  <div className="adm-toran" aria-hidden="true">
    {TORAN.map((s, i) => (
      <span key={i} className="adm-toran__strand" style={s.style}>
        {s.flowers.map((f, k) => <i key={k} className={`adm-toran__flower ${f}`} />)}
        <i className="adm-toran__leaf" />
      </span>
    ))}
  </div>
);

/** The dark card at the top: hello, packs · kg · total, and a badge that grows with the order. */
export const BigOrderHero: React.FC<{ name: string; packs: number; grams: number; total: number | null; onParty: () => void }> = ({
  name, packs, grams, total, onParty,
}) => {
  const level = hypeLevel(packs);
  return (
    <div className="adm-big-hero">
      <div className="adm-big-hero__rays" aria-hidden="true"><div className="adm-party__rays" /></div>
      <div className="adm-big-hero__top">
        <span className="adm-big-badge"><Sparkles size={14} strokeWidth={2.4} aria-hidden="true" />{copy.badge}</span>
        <button type="button" className="adm-big-hero__again" onClick={onParty}>
          <PartyPopper size={16} strokeWidth={2} aria-hidden="true" />{copy.partyAgain}
        </button>
      </div>
      <div className="adm-big-hero__hello">
        <b>{copy.hello(name)}</b>
        <span>{copy.helloSub}</span>
      </div>
      <div className="adm-big-stats">
        <span><b>{packs.toLocaleString('en-IN')}</b>{copy.packs}</span>
        <span><b>{formatWeight(grams)}</b>{copy.food}</span>
        <span><b>{total != null ? formatMoneyShort(total) : '–'}</b>{copy.total}</span>
      </div>
      {/* A new key each level, so the pop and its sparks play again as it grows. */}
      <div className="adm-big-hero__hype">
        <span key={level} className={`adm-big-hype adm-big-hype--${level}`}>
          {copy.hype[level]}
          {level > 0 && <span className="adm-big-hype__burst" aria-hidden="true">{range(12).map((k) => <i key={k} className={`adm-fx-spark adm-fx-spark--${k} adm-fx-once`} />)}</span>}
        </span>
      </div>
    </div>
  );
};

export interface BigLine {
  key: string;
  product: Product;
  size: string;
  packs: number;
  /** A price typed on the order, else undefined. */
  rate: number | undefined;
  /** What the pack costs from the price list, shown as the price's placeholder. */
  listPrice: number | undefined;
  out: boolean;
}

/** Every pack size, each with typed packs and ₹ per pack, and +10 / +50 / +100. */
export const BigOrderLines: React.FC<{
  lines: BigLine[];
  setPacks: (key: string, packs: number) => void;
  setRate: (key: string, rate: number | null) => void;
}> = ({ lines, setPacks, setRate }) => (
  <ul className="adm-big-lines">
    {lines.map((l) => {
      const item = `${l.product.name} ${l.size}`;
      const price = l.rate ?? l.listPrice;
      return (
        <li key={l.key} className={`adm-card adm-big-line${l.packs ? ' is-in' : ''}`}>
          <div className="adm-big-line__head">
            <OrderThumb product={l.product} className="adm-of__thumb" />
            <span className="adm-list__main">
              <b className="adm-pname">{l.product.name}</b>
              <small>{l.size}{l.out && <> · <em>{adminCopy.orderForm.backSoon}</em></>}</small>
            </span>
            {l.packs > 0 && price != null && <b className="adm-big-line__amount">{formatMoney(l.packs * price)}</b>}
          </div>
          <div className="adm-big-line__fields">
            <label className="adm-big-field">
              <span className="adm-field__label">{copy.packsLabel}</span>
              <input className="adm-input" inputMode="numeric" autoComplete="off" placeholder="0" aria-label={`${copy.packsLabel}, ${item}`}
                value={l.packs ? String(l.packs) : ''} onChange={(e) => setPacks(l.key, Math.min(MAX_QUANTITY, typedNumber(e.target.value) ?? 0))} />
            </label>
            <label className="adm-big-field adm-big-field--money">
              <span className="adm-field__label">{copy.perPack}</span>
              <span className="adm-big-field__control">
                <i aria-hidden="true">₹</i>
                <input className="adm-input" inputMode="numeric" autoComplete="off" aria-label={`${copy.perPack}, ${item}`}
                  placeholder={l.listPrice != null ? String(l.listPrice) : copy.pricePlaceholder}
                  value={l.rate != null ? String(l.rate) : ''} onChange={(e) => setRate(l.key, typedNumber(e.target.value))} />
              </span>
            </label>
          </div>
          <div className="adm-big-line__more">
            {[10, 50, 100].map((n) => (
              <button key={n} type="button" className="adm-big-chip" aria-label={copy.addMoreLabel(n, item)}
                onClick={() => setPacks(l.key, Math.min(MAX_QUANTITY, l.packs + n))}>{copy.addMore(n)}</button>
            ))}
            <span>{l.packs ? (price != null ? copy.line(l.packs, formatMoney(price)) : adminCopy.order.packs(l.packs)) : copy.notInOrder}</span>
          </div>
        </li>
      );
    })}
  </ul>
);
