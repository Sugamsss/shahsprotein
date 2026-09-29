import React from 'react';
import { CheckCircle, ChevronRight, Hourglass } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { adminCopy } from '../../data/adminCopy';
import { productsData } from '../../data/products';
import type { Product } from '../../types/product';
import { formatWeight } from '../format';
import { cardNotes } from '../kitchen/model';
import { SpareFoot } from '../kitchen/Spare';
import { AdminLink } from '../router';
import type { Kitchen, KitchenProduct, OutOfStock, Totals, TotalsCell, TotalsStage } from '../types';

const copy = adminCopy.homePage.cards;

// The three product cards at the top of Home: always all three, in product order,
// each one link to that product's orders, with the spare on the shelf at its foot.
// Pranjali's say what to cook in kitchen words; Sunit's list the four stages.
// `totals` is undefined while it loads: the labels stay and the numbers pulse.

const EMPTY: TotalsCell = { orders: 0, packs: 0, samples: 0, grams: 0, by_size: [] };

export type ProductStages = Record<TotalsStage, TotalsCell>;

/** One product's cells, zeros when the RPC left it out (nothing on it in any stage). */
export const stagesOf = (totals: Totals, productId: string): ProductStages => {
  const found = totals.products.find((p) => p.product_id === productId)?.stages;
  return {
    cooking: found?.cooking ?? EMPTY,
    packing: found?.packing ?? EMPTY,
    ready: found?.ready ?? EMPTY,
    to_collect: found?.to_collect ?? EMPTY,
  };
};

/** The sizes that are off the site; null when the whole product is off. */
const offSizes = (product: Product, stock: OutOfStock | null): string[] | null | undefined => {
  const sizes = product.weightOptions.filter((size) => stock?.some((r) => r.product_id === product.id && r.size === size));
  if (!sizes.length) return undefined;
  return sizes.length === product.weightOptions.length ? null : sizes;
};

const Pulse: React.FC<{ className?: string }> = ({ className = '' }) => <span className={`adm-pulse ${className}`} aria-hidden="true" />;

/** "250 g × 2 · Sample × 1" */
const sizesText = (sizes: { size: string; packs: number }[]) =>
  sizes.map((s) => copy.sizeTimes(s.size === 'sample' ? copy.sample : s.size, s.packs)).join(' · ');

/**
 * The wide product photo on phones (the row that scrolls) and laptops; the 4:5
 * pouch tile on a tablet's three-across shelf. The media query matches home.css.
 * The <picture> means each size downloads only its own file. Above the fold, so not lazy.
 */
const Photo: React.FC<{ product: Product }> = ({ product }) => {
  const dark = useTheme().theme === 'dark';
  const tile = dark ? product.orderTileDark : product.orderTile;
  return (
    <span className={`adm-pcard__photo adm-pcard__photo--${product.id}`}>
      <picture>
        <source media="(max-width: 639px), (min-width: 960px)" srcSet={dark ? product.imageDark : product.image} />
        <img src={tile.src} srcSet={tile.srcSet} sizes="210px" width={360} height={450} decoding="async" alt="" />
      </picture>
    </span>
  );
};

/** Who's named under a cook card: priority orders, then orders waiting on nothing else. */
const notesOf = (kitchen: KitchenProduct): string[] => {
  const { priority, onlyThis } = cardNotes(kitchen);
  return [priority.length ? copy.priority(priority) : '', onlyThis.length ? copy.onlyThis(onlyThis) : ''].filter(Boolean);
};

/** Pranjali: "Cook 2 kg", the packs waiting on it, "for 4 orders", and who's named. */
/** Under "Nothing to cook": where its orders are, once the totals are in. */
const withSunitText = (stages: ProductStages | undefined) =>
  stages && copy.withSunit(stages.packing.orders + stages.ready.orders, !stages.cooking.orders);

const CookBody: React.FC<{ kitchen?: KitchenProduct; stages?: ProductStages; off?: string[] | null }> = ({ kitchen, stages, off }) => {
  if (!kitchen) {
    return <span className="adm-pcard__make"><span>{copy.make}</span><Pulse className="adm-pulse--big" /></span>;
  }
  const offNote = off !== undefined && <span className="adm-pcard__off"><i />{copy.offSite(off)}</span>;
  if (!kitchen.to_cook) {
    const where = withSunitText(stages);
    return (
      <>
        <span className="adm-pcard__none"><CheckCircle size={18} aria-hidden="true" />{copy.nothingToMake}</span>
        {where && <span className="adm-pcard__for">{where}</span>}
        {offNote}
      </>
    );
  }
  const notes = notesOf(kitchen);
  return (
    <>
      <span className="adm-pcard__make"><span>{copy.make}</span><b>{formatWeight(kitchen.to_cook)}</b></span>
      <span className="adm-pcard__sizes">{sizesText(kitchen.waiting_packs)}</span>
      <span className="adm-pcard__for">{copy.forOrders(kitchen.queue.length)}</span>
      {notes.length > 0 && (
        <span className="adm-pcard__notes">
          {notes.map((note) => <span key={note}><Hourglass size={14} aria-hidden="true" />{note}</span>)}
        </span>
      )}
      {offNote}
    </>
  );
};

/** A stage's count: just the number, zeros faded. */
const Value: React.FC<{ n?: number }> = ({ n }) => {
  if (n === undefined) return <Pulse />;
  if (!n) return <b className="is-zero">0</b>;
  return <b>{n}</b>;
};

const Stage: React.FC<{ label: string; cell?: TotalsCell; sizes?: boolean; accent?: boolean }> = ({ label, cell, sizes = true, accent }) => (
  <li className={accent && cell?.orders ? 'is-accent' : ''}>
    <span>
      {label}
      {sizes && cell && cell.by_size.length > 0 && <small>{sizesText(cell.by_size)}</small>}
    </span>
    <Value n={cell?.orders} />
  </li>
);

/** Sunit: the four stages, always all four in the same order, in orders, with their packs under. */
const AdminBody: React.FC<{ stages?: ProductStages; off?: string[] | null }> = ({ stages, off }) => (
  <>
    <ul className="adm-pcard__stages">
      <Stage label={copy.cooking} cell={stages?.cooking} />
      <Stage label={copy.packing} cell={stages?.packing} accent />
      <Stage label={copy.ready} cell={stages?.ready} />
      <Stage label={copy.notPaid} cell={stages?.to_collect} sizes={false} />
    </ul>
    {off !== undefined && <span className="adm-pcard__note">{copy.off(off)}</span>}
  </>
);

/** What a screen reader says for the card's link. */
const spokenName = (product: Product, stages: ProductStages | undefined, kitchen: KitchenProduct | undefined, cook: boolean, off: string[] | null | undefined) => {
  if (!stages) return `${product.name}. ${copy.seeOrders}`;
  if (!cook || !kitchen) {
    return copy.adminName(product.name, stages.cooking.orders, stages.packing.orders, stages.ready.orders, stages.to_collect.orders);
  }
  const main = kitchen.to_cook
    ? `${copy.make.toLowerCase()} ${formatWeight(kitchen.to_cook)} ${copy.forOrders(kitchen.queue.length)}`
    : [copy.nothingToMake.toLowerCase(), withSunitText(stages)].filter(Boolean).join('. ');
  const notes = kitchen.to_cook ? notesOf(kitchen) : [];
  return copy.cookName(product.name, main, [...notes, off !== undefined ? copy.offSite(off) : ''].filter(Boolean).join('. '));
};

/**
 * On phones the row scrolls sideways. A browser doesn't scroll a card that only
 * peeks in when it gets keyboard focus, so bring it fully into view (the row's
 * scroll-padding keeps it on the page's gutter). Taps don't need it.
 */
const revealFocused = (event: React.FocusEvent<HTMLDivElement>) => {
  const el = event.target;
  const card = el instanceof HTMLElement ? el.closest('.adm-pcard') : null;
  if (card && el.matches(':focus-visible')) card.scrollIntoView({ block: 'nearest', inline: 'nearest' });
};

export const ProductCards: React.FC<{
  cook: boolean;
  totals: Totals | null | undefined;
  stock: OutOfStock | null;
  /** Used up / thrown out, from a spare line (only where kitchen.can_write_off). */
  onTake: (productId: string, batchId: string) => void;
}> = ({ cook, totals, stock, onTake }) => {
  const kitchenOf: Kitchen | undefined = totals?.kitchen;
  return (
    <div className={`adm-pcards adm-pcards--${cook ? 'cook' : 'admin'}`} onFocus={revealFocused}>
      {productsData.map((product) => {
        const stages = totals ? stagesOf(totals, product.id) : undefined;
        const kitchen = kitchenOf?.products.find((k) => k.product_id === product.id);
        const off = offSizes(product, stock);
        const open = stages
          ? stages.cooking.orders + stages.packing.orders + stages.ready.orders + stages.to_collect.orders
          : undefined;
        return (
          <div key={product.id} className="adm-card adm-pcard">
            <AdminLink
              to={`/admin/orders?product=${product.id}`}
              className="adm-pcard__link"
              aria-label={spokenName(product, stages, kitchen, cook, off)}
              aria-busy={stages ? undefined : true}
            >
              <Photo product={product} />
              <span className="adm-pcard__body">
                <span className="adm-pcard__top">
                  <b className="adm-pname">{product.name}</b>
                  {!cook && open !== undefined && <span className="adm-pcard__meta">{open ? copy.orders(open) : copy.allClear}</span>}
                  <ChevronRight className="adm-pcard__chev" size={18} aria-hidden="true" />
                </span>
                {cook ? <CookBody kitchen={kitchen} stages={stages} off={off} /> : <AdminBody stages={stages} off={off} />}
              </span>
            </AdminLink>
            <SpareFoot product={kitchen} canWriteOff={Boolean(kitchenOf?.can_write_off)} onTake={onTake} />
          </div>
        );
      })}
    </div>
  );
};
