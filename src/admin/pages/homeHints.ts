import { adminCopy } from '../../data/adminCopy';
import type { Overview, Totals } from '../types';

// The words under Sunit's "Waiting on you" rows. No React here.

const copy = adminCopy.homePage;
const payCopy = adminCopy.payments;

/** Sentences joined with one full stop and one space each, ending on a full stop. */
export const sentences = (parts: (string | false | null | undefined)[]): string => {
  const said = parts.map((p) => (p || '').trim().replace(/\.+$/, '')).filter(Boolean);
  return said.length ? `${said.join('. ')}.` : '';
};

/** To pack: "3 packs. 1 paid, 1 not paid in full". A part-paid order isn't paid. */
export const packingHint = (packing: Overview['queue']['packing'], packs: number | undefined): string => {
  const split = copy.paidSplit(packing.paid, packing.count - packing.paid, packing.part_paid);
  return packs === undefined ? split : copy.packsThen(packs, split);
};

/**
 * Ready: who hasn't paid. With part payments it's two sentences, "Aarav hasn't paid.
 * Snehal paid part.", since the server's unpaid names include the part paid.
 */
const wayHint = (way: Overview['queue']['ready'], names: Totals['overall']['ready'] | undefined): string => {
  if (!way.not_paid) return copy.allPaid;
  const unpaid = names?.unpaid_names ?? [];
  if (!way.part_paid) return unpaid.length ? copy.namesNotPaid(unpaid, way.not_paid) : copy.notPaidYet(way.not_paid);
  const part = names?.part_paid_names ?? [];
  // Take each part-paid name out once, so two people with the same first name both stay right.
  const left = [...part];
  const none = unpaid.filter((n) => {
    const at = left.indexOf(n);
    if (at < 0) return true;
    left.splice(at, 1);
    return false;
  });
  const noneCount = way.not_paid - way.part_paid;
  return sentences([
    noneCount > 0 && payCopy.hasntPaid(none.slice(0, noneCount), noneCount),
    payCopy.paidPart(part, way.part_paid),
  ]);
};

/** To drop off: "Farah's has waited 4 days. All paid." `age` is the formatted wait, when there is one. */
export const readyHint = (
  ready: Overview['queue']['ready'],
  names: Totals['overall']['ready'] | undefined,
  age: string | null,
  oldestName: string | null,
): string => sentences([age && copy.waited(age, ready.count, oldestName), wayHint(ready, names)]);
