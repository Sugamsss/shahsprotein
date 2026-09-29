import { adminCopy } from '../../data/adminCopy';
import { firstName } from '../format';
import type { HistoryDetail, KitchenEffects, Order, PriorityPouch } from '../types';
import { productName, sizeText } from './model';

// The words of the "give packed food to a priority order" popup, and its toast. No React here.

const copy = adminCopy.priorityGive;

/** "Raggi Jaggi 500 g", or "Raggi Jaggi 500 g × 2" for more than one pouch. */
const pouchText = (p: Pick<PriorityPouch, 'product_id' | 'size' | 'count'>) => `${productName(p.product_id)} ${sizeText(p.size)}${p.count > 1 ? ` × ${p.count}` : ''}`;
const nameOf = (o: { name: string | null; code: string }) => firstName(o.name) || o.code;

export interface GiveText {
  title: string;
  /** The question. With one giver it names the pouches; with several, `items` does, a line each. */
  question: string;
  items: string[];
  /** Who goes back to Cooking. Empty when nobody does (their order is still covered). */
  after: string;
  confirm: string;
}

/**
 * The popup's words for a preview. `backToCooking` are the orders the preview moves back to
 * Cooking (effects.orders with to 'cooking'); pouches are grouped by the order giving them.
 */
export const giveText = (taker: Pick<Order, 'name' | 'code'>, pouches: PriorityPouch[], backToCooking: { name: string | null; code: string }[]): GiveText => {
  const to = nameOf(taker);
  const givers = [...new Map(pouches.map((p) => [p.order_id, p])).values()].map((first) => ({
    name: nameOf(first),
    what: pouches.filter((p) => p.order_id === first.order_id).map(pouchText),
  }));
  const count = pouches.reduce((n, p) => n + p.count, 0);
  const one = givers.length === 1;
  return {
    title: copy.title(to),
    question: one ? copy.one(to, givers[0].name, givers[0].what) : copy.several(to),
    items: one ? [] : givers.map((g) => copy.item(g.name, g.what)),
    after: backToCooking.length ? copy.goesBack(backToCooking.map(nameOf)) : '',
    confirm: copy.confirm(to, count),
  };
};

/**
 * The toast after giving: where the priority order went ("Meera's order moved to Packing."),
 * or "Gave Meera the packed food." while it's still short; then every order that went back.
 */
export const givenText = (taker: Pick<Order, 'id' | 'name' | 'code'>, effects: KitchenEffects): string => {
  const k = adminCopy.kitchenEffects;
  const own = effects.orders.find((e) => e.id === taker.id);
  const first = own && own.from !== own.to ? k.moved(nameOf(taker), own.to) : copy.gave(nameOf(taker));
  const others = effects.orders.filter((e) => e.id !== taker.id && e.from !== e.to).map((e) => k.moved(nameOf(e), e.to));
  return [first, ...others].join(' ');
};

/** A history line from the server's detail, or null when there's no detail we know how to say. */
export const historyDetailText = (d: HistoryDetail | null | undefined): string | null =>
  d?.reason === 'gave_priority' && d.items?.length
    ? copy.gaveHistory(d.items.map(pouchText), nameOf({ name: d.to_name, code: d.to_code }))
    : null;
