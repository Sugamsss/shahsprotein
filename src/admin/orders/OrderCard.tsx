import React from 'react';
import { ArrowRight, Check, IndianRupee, Instagram, Phone, Repeat, StickyNote, Ticket, User } from 'lucide-react';
import { WhatsAppIcon } from '../../components/ui/WhatsAppIcon';
import { useTheme } from '../../context/ThemeContext';
import { adminCopy } from '../../data/adminCopy';
import { formatAge, formatDay, formatMoney, formatWhen } from '../format';
import { AdminLink } from '../router';
import type { Order, OrderSource } from '../types';
import { laneOf, linesFirst, nextOf, pileOf, productName, thumbOf } from './model';

const copy = adminCopy.orders;

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

/** Paid, as a switch you tap; plain text where there's nothing to change it (a customer's page). */
export const PaidChip: React.FC<{ order: Order; onToggle?: () => void }> = ({ order, onToggle }) => {
  const amount = order.amount != null ? `${formatMoney(order.amount)} · ` : '';
  if (!onToggle) {
    return (
      <span className={`adm-paid adm-paid--static${order.paid ? ' is-paid' : ''}`}>
        {order.paid ? <Check size={13} aria-hidden="true" /> : <i aria-hidden="true" />}
        {amount}{order.paid ? copy.paid : copy.notPaid}
      </span>
    );
  }
  return (
    <button type="button" className={`adm-paid${order.paid ? ' is-paid' : ''}`} aria-pressed={order.paid}
      aria-label={copy.paidLabel(order.name ?? order.code, order.paid)} onClick={onToggle}>
      {order.paid ? <Check size={13} aria-hidden="true" /> : <i aria-hidden="true" />}
      {amount}{order.paid ? copy.paid : copy.notPaid}
    </button>
  );
};

export type CardAction = 'next' | 'paid' | 'keep' | 'cancel';

/**
 * One order, the same everywhere: lanes, the board, search, a customer's page.
 * The whole card opens the order; its buttons sit above that link.
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
}> = ({ order: o, onAction, dateTitle, selected, mark, flash, product, search = '' }) => {
  const lane = laneOf(o);
  const next = nextOf(o);
  const ids = pileOf(o.lines, product);
  const act = (a: CardAction) => () => onAction?.(o, a);
  const chips: React.ReactNode[] = [];
  if (lane === 'send' || lane === 'way') chips.push(<PaidChip key="p" order={o} onToggle={onAction && act('paid')} />);
  if (lane === 'collect' && o.amount != null) {
    chips.push(<span key="m" className="adm-chip adm-chip--money"><IndianRupee size={13} aria-hidden="true" />{copy.toCollect(formatMoney(o.amount))}</span>);
  }
  if (lane === 'stale') chips.push(<span key="s" className="adm-chip">{copy.noMessage(formatAge(o.created_at))}</span>);
  if (o.source !== 'site') chips.push(<Via key="v" source={o.source} />);
  if (o.coupon) chips.push(<span key="c" className="adm-chip"><Ticket size={13} aria-hidden="true" />{o.coupon.code}</span>);
  if (o.customer && o.customer.order_number > 1) {
    chips.push(<span key="r" className="adm-chip adm-chip--accent"><Repeat size={13} aria-hidden="true" />{copy.nthOrder(o.customer.order_number)}</span>);
  }

  return (
    <article className={`adm-ocard${lane === 'stale' ? ' adm-ocard--stale' : ''}${selected ? ' is-open' : ''}${flash ? ' is-flash' : ''}`}>
      <AdminLink className="adm-ocard__open" to={`/admin/orders/${o.code}${search}`} aria-label={copy.open(o.name ?? o.code, o.code)} />
      <span className={`adm-pile adm-pile--${Math.min(ids.length, 2)}`}>
        {ids.map((id) => <Thumb key={id} id={id} />)}
      </span>
      <div className="adm-ocard__head">
        <span className="adm-ocard__name">{dateTitle ? formatDay(o.created_at) : o.name ?? o.phone}</span>
        {!dateTitle && <span className="adm-ocard__time">{formatWhen(o.created_at)}</span>}
      </div>
      <ul className="adm-ocard__items">
        {linesFirst(o.lines, product).map((l) => (
          <li key={l.product_id + l.size} className={product && l.product_id !== product ? 'is-other' : undefined}><b className="adm-pname">{productName(l.product_id)}</b>{l.size}<span>× {l.quantity}</span></li>
        ))}
      </ul>
      <div className="adm-ocard__extra">
        {chips.length > 0 && <span className="adm-chips">{chips}</span>}
        {o.note && <span className="adm-ocard__note"><StickyNote size={14} aria-hidden="true" />{o.note}</span>}
      </div>
      <div className="adm-ocard__foot">
        <span className="adm-ocard__meta"><Code code={o.code} mark={mark} />{o.pincode && <span className="adm-ocard__place"> · {o.pincode}</span>}</span>
        {lane === 'stale' && onAction && (
          <span className="adm-ocard__pair">
            <button type="button" className="adm-btn adm-btn--quiet adm-btn--xs" onClick={act('keep')}>{copy.stillWaiting}</button>
            <button type="button" className="adm-btn adm-btn--quiet adm-btn--xs" onClick={act('cancel')}>{copy.cancel}</button>
          </span>
        )}
        {/* A stale card keeps its pair; "They messaged, confirm it" is on the order itself. */}
        {next && lane !== 'stale' && onAction && (
          <button type="button" className="adm-btn adm-btn--tonal adm-btn--xs" onClick={act('next')}>
            {lane === 'collect' && <Check size={16} aria-hidden="true" />}
            {next.labels[0]}
            {lane !== 'collect' && <ArrowRight size={16} aria-hidden="true" />}
          </button>
        )}
        {/* A customer's page: where each open order is, as Done cards say theirs. */}
        {dateTitle && lane !== 'done' && <span className="adm-ocard__word is-open">{adminCopy.order.steps[o.status as keyof typeof adminCopy.order.steps]}</span>}
        {lane === 'done' && (
          <span className={`adm-ocard__word${o.status === 'cancelled' ? ' is-cancelled' : ''}`}>
            {o.status === 'cancelled' ? copy.cancelled : <><Check size={14} aria-hidden="true" />{copy.deliveredPaid}</>}
          </span>
        )}
      </div>
    </article>
  );
};
