import React from 'react';
import { ArrowRight, Check, ChevronsUp, Gift, Globe, IndianRupee, Instagram, Phone, Repeat, StickyNote, Ticket, User } from 'lucide-react';
import { WhatsAppIcon } from '../../components/ui/WhatsAppIcon';
import { useTheme } from '../../context/ThemeContext';
import { adminCopy } from '../../data/adminCopy';
import { formatDay, formatMoney, formatWhen } from '../format';
import { AdminLink } from '../router';
import type { Order, OrderSource } from '../types';
import { WAITING_FROM_DAYS, daysInStage, isHeld, isPartlyCooked, laneOf, lineState, linesFirst, nextOf, pileOf, productName, sizeText, thumbOf } from './model';
import { paidShare } from './payments';

const copy = adminCopy.orders;
const chipCopy = adminCopy.payments.chip;
const stageCopy = adminCopy.orderStages;

/** SN-7KQ4M: "SN-" quiet, the characters bold. `mark` highlights a search match. */
export const Code: React.FC<{ code: string; mark?: string }> = ({ code, mark }) => {
  const rest = code.replace(/^SN-/, '');
  const needle = (mark ?? '').trim().toUpperCase().replace(/^#/, '').replace(/^SN-/, '');
  const at = needle ? rest.indexOf(needle) : -1;
  const len = needle.length;
  return (
    <span className="adm-code">
      <span className="adm-code__pre">SN-</span>
      {at >= 0 && len > 0
        ? <>{rest.slice(0, at)}<mark>{rest.slice(at, at + len)}</mark>{rest.slice(at + len)}</>
        : rest}
    </span>
  );
};

/** The order-popup thumb, with the product's art colour behind it. */
export const Thumb: React.FC<{ id: string; className?: string }> = ({ id, className }) => {
  const { theme } = useTheme();
  return (
    <span className={`adm-thumb adm-thumb--${id} ${className ?? ''}`} aria-hidden="true">
      <img src={thumbOf(id, theme === 'dark')} alt="" width={48} height={48} loading="lazy" decoding="async" />
    </span>
  );
};

const VIA_ICON: Record<Exclude<OrderSource, 'site'>, React.ReactNode> = {
  whatsapp: <WhatsAppIcon size={13} />,
  call: <Phone size={13} aria-hidden="true" />,
  instagram: <Instagram size={13} aria-hidden="true" />,
  in_person: <User size={13} aria-hidden="true" />,
};

export const Via: React.FC<{ source: OrderSource }> = ({ source }) =>
  source === 'site' ? null : <span className="adm-chip">{VIA_ICON[source]}{copy.via[source]}</span>;

/** A website order may never have arrived on WhatsApp, so it's the one came-via marker cards keep. */
export const FromWebsite: React.FC = () => <span className="adm-chip"><Globe size={13} aria-hidden="true" />{copy.fromWebsite}</span>;

/** In place of the money chip on a free sample order: nothing to pay. */
export const FreeSampleChip: React.FC = () => <span className="adm-chip"><Gift size={13} aria-hidden="true" />{copy.freeSample}</span>;

/** How much of the total is in, for a chip's fill: `--p` from 0% to 100%. */
const fillOf = (o: Order) => ({ '--p': `${Math.round(paidShare(o) * 100)}%` }) as React.CSSProperties;

/** The paid chip's words: "₹900 · Not paid", "₹1,200 · ₹600 due", "₹1,180 · Paid", "₹1,000 · Paid, ₹50 extra". */
const paidWords = (o: Order): string => {
  const total = o.amount != null ? formatMoney(o.amount) : null;
  if (o.payment_state === 'part_paid' && total && o.amount_due != null) return chipCopy.partPaid(total, formatMoney(o.amount_due));
  if (!o.paid) return chipCopy.notPaid(total);
  if (total && o.amount_extra) return chipCopy.extra(total, formatMoney(o.amount_extra));
  return chipCopy.paid(total);
};

/**
 * Paid, as a toggle you tap; plain text where there's nothing to change it (a customer's page).
 * Part paid fills with the success tint from the left, as far as the money has come in.
 */
export const PaidChip: React.FC<{ order: Order; onToggle?: () => void }> = ({ order, onToggle }) => {
  const part = order.payment_state === 'part_paid';
  const words = paidWords(order);
  const className = `adm-paid${order.paid ? ' is-paid' : ''}${part ? ' adm-fill' : ''}`;
  const style = part ? fillOf(order) : undefined;
  const icon = order.paid ? <Check size={13} aria-hidden="true" /> : !part && <i aria-hidden="true" />;
  if (!onToggle) return <span className={`${className} adm-paid--static`} style={style}>{icon}{words}</span>;
  return (
    <button type="button" className={className} style={style} aria-pressed={part ? 'mixed' : order.paid}
      aria-label={chipCopy.label(order.name ?? order.code, words, part, order.paid)} onClick={onToggle}>
      {icon}{words}
    </button>
  );
};

/** To collect: "₹640 to collect", or "₹250 left to collect" with the fill once part of it is in. */
const CollectChip: React.FC<{ order: Order }> = ({ order }) => {
  const part = order.payment_state === 'part_paid';
  const due = formatMoney(order.amount_due ?? order.amount ?? 0);
  return (
    <span className={`adm-chip adm-chip--money${part ? ' adm-fill' : ''}`} style={part ? fillOf(order) : undefined}>
      <IndianRupee size={13} aria-hidden="true" />{part ? chipCopy.leftToCollect(due) : chipCopy.toCollect(due)}
    </span>
  );
};

export type CardAction = 'next' | 'paid';

/** A small quiet marker on a priority order while it cooks. Existing tokens, never the warning colour. */
export const PriorityMark: React.FC = () => (
  <span className="adm-chip adm-chip--strong adm-chip--priority"><ChevronsUp size={14} aria-hidden="true" />{stageCopy.priority}</span>
);

/**
 * One order, the same everywhere: the board's stages, search, Done, a customer's page.
 * The whole card opens the order; its buttons sit above that link.
 *
 * `light` is the board's face (O1): one thumb, name and day, the lines, then one row with
 * the money (or sample) chip on the left and the next step on the right. No code or pincode;
 * those are in the order view. Without it (search, Done, a customer's page) the code shows.
 */
export const OrderCard: React.FC<{
  order: Order;
  onAction?: (order: Order, action: CardAction) => void;
  /** A customer's page: the date takes the name's place. */
  dateTitle?: boolean;
  selected?: boolean;
  mark?: string;
  /** It just landed in this lane: the site's order-flash tint. */
  flash?: boolean;
  /** A board filtered to one product: its lines come first and its pouch on top; the rest are dimmed. */
  product?: string | null;
  /** The board's query (?product=…&q=…), kept on the link so the order opens over the same board. */
  search?: string;
  light?: boolean;
  /** It just left this stage: it folds away while the switcher's count ticks down. */
  leaving?: boolean;
}> = ({ order: o, onAction, dateTitle, selected, mark, flash, product, search = '', light, leaving }) => {
  const lane = laneOf(o);
  const next = nextOf(o);
  const ids = pileOf(o.lines, product);
  // The light card has one thumb: the filtered product's pouch, else the first product's.
  const thumbs = light ? [ids[ids.length - 1] === product ? product : ids[0]] : ids;
  const act = (a: CardAction) => () => onAction?.(o, a);
  // Partly cooked: a line whose product is already covered says "✓ ready"; waiting lines stay plain.
  const marks = isPartlyCooked(o);
  const held = isHeld(o);
  const waited = lane === 'ready' ? daysInStage(o) : 0;
  const chips: React.ReactNode[] = [];
  if (lane === 'cooking' && o.priority) chips.push(<PriorityMark key="!" />);
  // Cooking shows the same money chip its card will carry in Packing.
  if (o.free_sample) chips.push(<FreeSampleChip key="f" />);
  else if (lane === 'cooking' || lane === 'packing' || lane === 'ready') chips.push(<PaidChip key="p" order={o} onToggle={onAction && act('paid')} />);
  else if (lane === 'collect') {
    chips.push(o.amount != null ? <CollectChip key="m" order={o} /> : <span key="m" className="adm-paid adm-paid--static"><i aria-hidden="true" />{copy.noTotalYet}</span>);
  }
  if (o.source === 'site') chips.push(<FromWebsite key="v" />);
  if (!light && o.coupon) chips.push(<span key="c" className="adm-chip"><Ticket size={13} aria-hidden="true" />{o.coupon.code}</span>);
  if (!light && o.customer && o.customer.order_number > 1) {
    chips.push(<span key="r" className="adm-chip adm-chip--strong"><Repeat size={13} aria-hidden="true" />{copy.nthOrder(o.customer.order_number)}</span>);
  }
  const button = next && onAction && (
    <button type="button" className="adm-btn adm-btn--tonal adm-btn--xs" onClick={act('next')}>
      {lane === 'collect' && <Check size={16} aria-hidden="true" />}
      {next.labels[0]}
      {lane !== 'collect' && <ArrowRight size={16} aria-hidden="true" />}
    </button>
  );
  const chipRow = chips.length > 0 && <span className="adm-chips">{chips}</span>;

  return (
    <article className={`adm-ocard${light ? ' adm-ocard--light' : ''}${selected ? ' is-open' : ''}${flash ? ' is-flash' : ''}${leaving ? ' is-leaving' : ''}`}
      aria-hidden={leaving || undefined}>
      <AdminLink className="adm-ocard__open" to={`/admin/orders/${o.code}${search}`} aria-label={copy.open(o.name ?? o.code, o.code)}
        tabIndex={leaving ? -1 : undefined} />
      <span className={`adm-pile adm-pile--${Math.min(thumbs.length, 2)}`}>
        {thumbs.map((id) => <Thumb key={id} id={id} />)}
      </span>
      <div className="adm-ocard__head">
        <span className="adm-ocard__name">{dateTitle ? formatDay(o.created_at) : o.name ?? o.phone}</span>
        {!dateTitle && (waited >= WAITING_FROM_DAYS
          ? <span className="adm-ocard__time is-late">{stageCopy.waiting(waited)}</span>
          : <span className="adm-ocard__time">{formatWhen(o.created_at)}</span>)}
      </div>
      <ul className="adm-ocard__items">
        {linesFirst(o.lines, product).map((l) => {
          const ready = marks && lineState(o, l.product_id)?.ready;
          return (
            <li key={l.product_id + l.size} className={product && l.product_id !== product ? 'is-other' : undefined}>
              <span className="adm-ocard__what">
                <b className="adm-pname">{productName(l.product_id)}</b> <span className="adm-ocard__size">{sizeText(l.size)}</span>
                {ready && <span className="adm-lready"><Check size={13} aria-hidden="true" />{stageCopy.lineReady}</span>}
              </span>
              <span className="adm-ocard__q">× {l.quantity}</span>
            </li>
          );
        })}
      </ul>
      {(o.note || held || (!light && chipRow)) && (
        <div className="adm-ocard__extra">
          {!light && chipRow}
          {held && <span className="adm-ocard__held">{adminCopy.order.held}</span>}
          {o.note && <span className="adm-ocard__note"><StickyNote size={14} aria-hidden="true" />{o.note}</span>}
        </div>
      )}
      {light ? (
        (chipRow || button) && <div className="adm-ocard__foot">{chipRow}{button}</div>
      ) : (
        <div className="adm-ocard__foot">
          <span className="adm-ocard__meta"><Code code={o.code} mark={mark} />{o.pincode && <span className="adm-ocard__place"> · {o.pincode}</span>}</span>
          {/* Cooking has no button: it moves on by itself (or "Move to Packing" in the order's ⋯). */}
          {button}
          {/* A customer's page: where each open order is, as Done cards say theirs. */}
          {dateTitle && lane !== 'done' && <span className="adm-ocard__word is-open">{adminCopy.order.steps[o.status as keyof typeof adminCopy.order.steps]}</span>}
          {lane === 'done' && (
            <span className={`adm-ocard__word${o.status === 'cancelled' ? ' is-cancelled' : ''}`}>
              {o.status === 'cancelled' ? copy.cancelled : <><Check size={14} aria-hidden="true" />{o.free_sample ? copy.deliveredFree : o.amount_extra ? adminCopy.payments.doneExtra(formatMoney(o.amount_extra)) : copy.deliveredPaid}</>}
            </span>
          )}
        </div>
      )}
    </article>
  );
};
