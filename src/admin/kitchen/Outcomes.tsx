import React, { useEffect, useRef, useState } from 'react';
import { Archive, Check, Hourglass, PackageCheck } from 'lucide-react';
import { adminCopy } from '../../data/adminCopy';
import { toAdminError, type AdminError } from '../api';
import { formatWeight } from '../format';
import { madeOnDay, productName } from '../orders/model';
import type { Kitchen, KitchenEffects } from '../types';
import { outcomesOf, type Outcome } from './model';

const copy = adminCopy.kitchen;
const say = copy.outcomes;

// "When you log this": the server's preview of a batch (it runs the real thing and
// rolls it back), in plain sentences. It asks ~300 ms after the amounts stop changing,
// keeps only the latest answer, and crossfades when a new one lands.

/** The preview for `request` (null: nothing to ask), asked once it has been still for `ms`. */
export const usePreview = (request: { key: string; load: () => Promise<KitchenEffects> } | null, ms = 300) => {
  const [answer, setAnswer] = useState<{ key: string; effects: KitchenEffects | null; error: AdminError | null } | null>(null);
  const latest = useRef(0);
  const load = useRef(request?.load);
  load.current = request?.load;
  const key = request?.key ?? null;

  useEffect(() => {
    const call = ++latest.current;
    if (key === null) { setAnswer(null); return undefined; }
    const timer = window.setTimeout(() => {
      load.current?.()
        .then((effects) => { if (call === latest.current) setAnswer({ key, effects, error: null }); })
        .catch((err) => { if (call === latest.current) setAnswer({ key, effects: null, error: toAdminError(err) }); });
    }, ms);
    return () => window.clearTimeout(timer);
  }, [key, ms]);

  const fresh = answer?.key === key;
  return { effects: answer?.effects ?? null, error: fresh ? answer?.error ?? null : null, stale: !fresh, shownKey: answer?.key ?? null };
};

const weightOf = (product_id: string, grams: number) => copy.item(formatWeight(grams), productName(product_id));

type Line = { icon?: React.ReactNode; tone?: 'ok' | 'wait'; title: string; detail?: string; quiet?: boolean };

const lineOf = (o: Outcome): Line => {
  switch (o.kind) {
    case 'toPacking':
      return {
        icon: <PackageCheck size={18} aria-hidden="true" />, tone: 'ok',
        title: o.all ? say.allCovered(o.names.length) : say.covered(o.names),
        detail: say.goPacking(o.names, o.all),
      };
    case 'partly':
      return {
        icon: <Check size={18} aria-hidden="true" />, tone: 'ok',
        title: say.partly(o.name, o.got.map(productName)),
        detail: o.waits.length ? say.partlyWaits(o.waits.map((w) => weightOf(w.product_id, w.grams))) : undefined,
      };
    case 'stillWait':
      return {
        icon: <Hourglass size={18} aria-hidden="true" />, tone: 'wait',
        title: say.stillWait(o.names),
        detail: o.toCook.length ? say.stillToCook(o.toCook.map((c) => weightOf(c.product_id, c.grams))) : undefined,
      };
    case 'backToCooking':
      return { icon: <Hourglass size={18} aria-hidden="true" />, tone: 'wait', title: say.back(o.names), detail: say.backWhy(o.names.length) };
    case 'waitsAgain':
      return { icon: <Hourglass size={18} aria-hidden="true" />, tone: 'wait', title: say.waitsAgain(o.name, o.lost.map((l) => weightOf(l.product_id, l.grams))) };
    case 'spare':
      return {
        icon: <Archive size={18} aria-hidden="true" />, tone: 'wait',
        title: say.spare(formatWeight(o.grams), productName(o.product_id)),
        detail: o.useBy ? say.goodTill(madeOnDay(o.useBy)) : undefined,
      };
    case 'spareLess':
      return {
        icon: <Archive size={18} aria-hidden="true" />, tone: 'wait',
        title: say.spareLess(formatWeight(o.before), o.after ? formatWeight(o.after) : null, productName(o.product_id)),
      };
    case 'noSpare':
      return { title: say.noSpare, quiet: true };
    case 'ordersSame':
      return { title: say.ordersSame, quiet: true };
    default:
      return { title: '' };
  }
};

/**
 * The sentences under a sheet's amounts. `request` null shows `empty` instead (nothing
 * to log). A failed preview says so quietly; the action itself still works.
 */
export const Outcomes: React.FC<{
  heading: string;
  before: Kitchen;
  mode: 'log' | 'fix';
  request: { key: string; load: () => Promise<KitchenEffects> } | null;
  empty?: string;
}> = ({ heading, before, mode, request, empty }) => {
  const preview = usePreview(request);
  const lines = preview.effects ? outcomesOf(preview.effects, before, mode).map(lineOf) : [];
  let body: React.ReactNode;
  if (!request) body = empty ? <p className="adm-kx-outcomes__quiet">{empty}</p> : null;
  else if (preview.error) {
    body = <p className="adm-kx-outcomes__quiet">{preview.error.kind === 'message' ? preview.error.message : copy.previewFailed}</p>;
  } else if (!preview.effects) body = <p className="adm-kx-outcomes__quiet">{copy.checking}</p>;
  else {
    body = (
      <ul key={preview.shownKey} className="adm-kx-outcomes__list">
        {lines.map((line, i) => (line.quiet ? (
          <li key={i} className="adm-kx-outcomes__quiet">{line.title}</li>
        ) : (
          <li key={i} className="adm-kx-outcome">
            <span className={`adm-kx-outcome__icon is-${line.tone}`}>{line.icon}</span>
            <span><b>{line.title}</b>{line.detail && <span>{line.detail}</span>}</span>
          </li>
        )))}
      </ul>
    );
  }
  return (
    <section className={`adm-kx-outcomes${request && preview.stale ? ' is-stale' : ''}`} aria-live="polite" aria-busy={request && preview.stale ? true : undefined}>
      <h3 className="adm-kx-label">{heading}</h3>
      {body}
    </section>
  );
};
