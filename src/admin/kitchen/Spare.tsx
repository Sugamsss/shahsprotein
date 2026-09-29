import React from 'react';
import { CalendarX, ChevronRight, Clock } from 'lucide-react';
import { adminCopy } from '../../data/adminCopy';
import { formatWeight } from '../format';
import { madeOnDay, productName } from '../orders/model';
import type { KitchenProduct } from '../types';
import { keepsOf, useByOf, type SpareBatch } from './model';

const copy = adminCopy.kitchen;

// Spare on the shelf: the band at a product card's foot (both Homes), and the batch
// line in Used up / thrown out. Amber when it's getting old, red when it's past its
// date ("Won't go to orders": past spare never fills an order). Fresh spare is quiet.

/** "3 days left", "last day today", "good till Sun 28 Mar"; '' when it has no shelf life. */
export const keepsText = (b: SpareBatch): string => {
  const keeps = keepsOf(b);
  if (keeps.kind === 'days') return copy.daysLeft(keeps.days);
  if (keeps.kind === 'today') return copy.lastDay;
  if (keeps.kind === 'until') return copy.goodTillShort(madeOnDay(keeps.day));
  return '';
};

/**
 * One batch's spare. Short (a card): "285 g spare · 3 days left". Long (the sheet):
 * "285 g · 3 days left, use by Fri 2 Oct".
 */
export const SpareKeeps: React.FC<{ batch: SpareBatch; long?: boolean }> = ({ batch, long }) => {
  const weight = formatWeight(batch.grams);
  if (batch.state === 'past') {
    return (
      <span className="adm-kx-spare is-past">
        <CalendarX size={16} aria-hidden="true" />
        <span><span>{copy.pastLine(weight)}</span><span>{copy.pastSub}</span></span>
      </span>
    );
  }
  const keeps = keepsText(batch);
  const useBy = long && keepsOf(batch).kind === 'days' ? useByOf(batch) : null;
  const text = long
    ? [weight, [keeps, useBy && copy.useBy(madeOnDay(useBy))].filter(Boolean).join(', ')].filter(Boolean).join(' · ')
    : copy.spareLine(weight, keeps);
  return (
    <span className={`adm-kx-spare${batch.state === 'near' ? ' is-near' : ''}`}>
      <Clock size={16} aria-hidden="true" />
      <span>{text}</span>
    </span>
  );
};

/**
 * The foot of a product card: one line per batch on the shelf, oldest first. Where this
 * person can take spare off the shelf, each line opens Used up / thrown out.
 */
export const SpareFoot: React.FC<{
  product: KitchenProduct | undefined;
  canWriteOff: boolean;
  onTake: (productId: string, batchId: string) => void;
}> = ({ product, canWriteOff, onTake }) => {
  const batches = product?.spare_batches ?? [];
  if (!product || !batches.length) return null;
  return (
    <ul className="adm-pcard__spare">
      {batches.map((b) => (
        <li key={b.batch_id}>
          {canWriteOff ? (
            <button
              type="button"
              className="adm-pcard__spare-btn"
              aria-label={`${copy.spareLine(formatWeight(b.grams), keepsText(b))}. ${copy.takeOffName(formatWeight(b.grams), productName(product.product_id))}`}
              onClick={() => onTake(product.product_id, b.batch_id)}
            >
              <SpareKeeps batch={b} />
              <ChevronRight className="adm-pcard__spare-chev" size={16} aria-hidden="true" />
            </button>
          ) : <SpareKeeps batch={b} />}
        </li>
      ))}
    </ul>
  );
};
