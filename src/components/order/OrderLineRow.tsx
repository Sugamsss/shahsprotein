import React from 'react';
import { Info, Minus, Plus, Trash2, Undo2 } from 'lucide-react';
import { siteConfig } from '../../data/siteConfig';
import type { OrderLine } from '../../types/order';
import type { Product } from '../../types/product';
import { SizeChoice } from './SizeChoice';
import { OrderThumb } from './OrderThumb';
import { lineKey } from './orderLineKey';

const copy = siteConfig.order;

/** A tint behind the row that fades. A new `at` restarts it without remounting the row. */
export interface LineFlash {
  at: number;
  /** A row that has just appeared also rises into place. */
  rise: boolean;
}

interface OrderLineRowProps {
  line: OrderLine;
  product: Product;
  maxQuantity: number;
  flash?: LineFlash;
  /** Short notes under the row, e.g. the merge note and the limit hint. */
  notes: string[];
  leaving: boolean;
  onSize: (size: string) => void;
  onLess: () => void;
  onMore: () => void;
}

/** One compact row: thumbnail, name, pack size, and a stepper whose minus becomes a bin at 1. */
export const OrderLineRow: React.FC<OrderLineRowProps> = ({
  line, product, maxQuantity, flash, notes, leaving, onSize, onLess, onMore,
}) => {
  const item = copy.itemName(product.name, line.size);
  const atOne = line.quantity <= 1;
  const atMax = line.quantity >= maxQuantity;
  const classes = [
    'order-line',
    flash && 'is-new',
    flash?.rise && 'is-rising',
    leaving && 'is-leaving',
  ].filter(Boolean).join(' ');

  return (
    <li className={classes} data-line-key={lineKey(line)}>
      {flash && <span key={flash.at} className="order-line__flash" aria-hidden="true" />}
      <OrderThumb product={product} className="order-line__thumb" />
      <p className="order-line__name">{product.name}</p>
      <div className="order-line__size">
        <SizeChoice
          sizes={product.weightOptions}
          value={line.size}
          onChange={onSize}
          legend={copy.sizeLegend(product.name)}
          single={copy.singleSize(line.size)}
        />
      </div>
      <div className="qty-stepper" role="group" aria-label={copy.qtyGroup(item)}>
        <button
          type="button"
          className={`qty-stepper__btn${atOne ? ' is-remove' : ''}`}
          aria-label={atOne ? copy.qtyRemove(item) : copy.qtyLess(item)}
          onClick={onLess}
        >
          {atOne ? <Trash2 size={16} strokeWidth={2.25} aria-hidden="true" /> : <Minus size={16} strokeWidth={2.25} aria-hidden="true" />}
        </button>
        <span className="qty-stepper__value">{line.quantity}</span>
        <button
          type="button"
          className="qty-stepper__btn qty-stepper__btn--more"
          aria-label={copy.qtyMore(item)}
          aria-disabled={atMax || undefined}
          onClick={onMore}
        >
          <Plus size={16} strokeWidth={2.25} aria-hidden="true" />
        </button>
      </div>
      {notes.length > 0 && (
        <div className="order-line__note">
          {notes.map((note) => (
            <p key={note}>
              <Info size={15} aria-hidden="true" />
              <span>{note}</span>
            </p>
          ))}
        </div>
      )}
    </li>
  );
};

interface OrderUndoRowProps {
  item: string;
  onUndo: () => void;
  /** Called when focus leaves the row (it may be waiting to go). */
  onLeave: () => void;
  as?: 'li' | 'div';
}

/** Stands where a removed line was, for a few seconds. */
export const OrderUndoRow: React.FC<OrderUndoRowProps> = ({ item, onUndo, onLeave, as: Tag = 'li' }) => (
  <Tag
    className="order-undo"
    onBlur={(event: React.FocusEvent<HTMLElement>) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onLeave();
    }}
  >
    <span>{copy.removed(item)}</span>
    <button type="button" onClick={onUndo}>
      <Undo2 size={16} aria-hidden="true" />
      {copy.undo}
    </button>
  </Tag>
);
