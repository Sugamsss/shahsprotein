import React from 'react';
import { CheckCircle, ChevronRight } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { adminCopy } from '../../data/adminCopy';
import { productsData } from '../../data/products';
import type { Product } from '../../types/product';
import { formatWeight } from '../format';
import { sizeText } from '../orders/model';
import { AdminLink } from '../router';
import type { KitchenProduct, OutOfStock, Totals, TotalsCell, TotalsStage } from '../types';

const copy = adminCopy.homePage.cards;

// The three product cards at the top of Home (temp/home-totals/v2): always all
// three, in product order, each one link to that product's orders. Pranjali's
// say what's still to cook (the kitchen's to_cook); Sunit's list every stage.
// `totals` is undefined while it loads: the labels stay and the numbers pulse.
// Interim: lane A rebuilds both.

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

/** Pranjali: "Cook 2 kg", the packs waiting on it, "for 4 orders". */
const CookBody: React.FC<{ kitchen?: KitchenProduct; off?: string[] | null }> = ({ kitchen, off }) => {
  if (!kitchen) {
    return <span className="adm-pcard__make"><span>{copy.make}</span><Pulse className="adm-pulse--big" /></span>;
  }
  const offNote = off !== undefined && <span className="adm-pcard__off"><i />{copy.offSite(off)}</span>;
  if (!kitchen.to_cook) {
    return <><span className="adm-pcard__none"><CheckCircle size={18} aria-hidden="true" />{copy.nothingToMake}</span>{offNote}</>;
  }
  return (
    <>
      <span className="adm-pcard__make"><span>{copy.make}</span><b>{formatWeight(kitchen.to_cook)}</b></span>
      <span className="adm-pcard__sizes">
        {kitchen.waiting_packs.map((s, i) => (
          <React.Fragment key={s.size}>{i > 0 && <i>·</i>}<span>{copy.sizeTimes(sizeText(s.size), s.packs)}</span></React.Fragment>
        ))}
      </span>
      <span className="adm-pcard__for">{copy.forOrders(kitchen.queue.length)}</span>
      {offNote}
    </>
  );
};

/** A stage's count: just the number, like every row. "To pack" counts packs; its sizes line says so, and the card's label says "5 packs". */
const Value: React.FC<{ n?: number }> = ({ n }) => {
  if (n === undefined) return <Pulse />;
  if (!n) return <b className="is-zero">0</b>;
  return <b>{n}</b>;
};

/** Sunit: the four stages, always all four in the same order, zeros faded. */
const AdminBody: React.FC<{ stages?: ProductStages; off?: string[] | null }> = ({ stages, off }) => {
  const pack = stages?.packing;
  return (
    <>
      <ul className="adm-pcard__stages">
        <li><span>{copy.cooking}</span><Value n={stages?.cooking.orders} /></li>
        <li className={pack?.packs ? 'is-accent' : ''}>
          <span>
            {copy.toPack}
            {pack && pack.packs > 0 && <small>{pack.by_size.map((s) => copy.sizeTimes(sizeText(s.size), s.packs)).join(' · ')}</small>}
          </span>
          <Value n={pack?.packs} />
        </li>
        <li><span>{copy.ready}</span><Value n={stages?.ready.orders} /></li>
        <li><span>{copy.notPaid}</span><Value n={stages?.to_collect.orders} /></li>
      </ul>
      {off !== undefined && <span className="adm-pcard__note">{copy.off(off)}</span>}
    </>
  );
};

/** What a screen reader says for the whole card. */
const spokenName = (product: Product, stages: ProductStages | undefined, kitchen: KitchenProduct | undefined, off: string[] | null | undefined) => {
  if (!stages) return `${product.name}. ${copy.seeOrders}`;
  if (!kitchen) {
    return copy.adminName(product.name, stages.cooking.orders, stages.packing.packs, stages.ready.orders, stages.to_collect.orders);
  }
  const main = kitchen.to_cook
    ? `${copy.make.toLowerCase()} ${formatWeight(kitchen.to_cook)} ${copy.forOrders(kitchen.queue.length)}`
    : copy.nothingToMake.toLowerCase();
  return copy.cookName(product.name, main, off !== undefined ? copy.offSite(off) : '');
};

/**
 * On phones the row scrolls sideways. A browser doesn't scroll a card that only
 * peeks in when it gets keyboard focus, so bring it fully into view (the row's
 * scroll-padding keeps it on the page's gutter). Taps don't need it.
 */
const revealFocused = (event: React.FocusEvent<HTMLDivElement>) => {
  const card = event.target;
  if (card instanceof HTMLElement && card.matches(':focus-visible')) card.scrollIntoView({ block: 'nearest', inline: 'nearest' });
};

export const ProductCards: React.FC<{
  cook: boolean;
  totals: Totals | null | undefined;
  stock: OutOfStock | null;
}> = ({ cook, totals, stock }) => (
  <div className={`adm-pcards adm-pcards--${cook ? 'cook' : 'admin'}`} onFocus={revealFocused}>
    {productsData.map((product) => {
      const stages = totals ? stagesOf(totals, product.id) : undefined;
      const kitchen = cook && totals ? totals.kitchen.products.find((k) => k.product_id === product.id) : undefined;
      const off = offSizes(product, stock);
      const open = stages
        ? stages.cooking.orders + stages.packing.orders + stages.ready.orders + stages.to_collect.orders
        : undefined;
      return (
        <AdminLink
          key={product.id}
          to={`/admin/orders?product=${product.id}`}
          className="adm-card adm-pcard"
          aria-label={spokenName(product, stages, kitchen, off)}
          aria-busy={stages ? undefined : true}
        >
          <Photo product={product} />
          <span className="adm-pcard__body">
            <span className="adm-pcard__top">
              <b className="adm-pname">{product.name}</b>
              {!cook && open !== undefined && <span className="adm-pcard__meta">{open ? copy.orders(open) : copy.allClear}</span>}
              <ChevronRight className="adm-pcard__chev" size={18} aria-hidden="true" />
            </span>
            {cook ? <CookBody kitchen={kitchen} off={off} /> : <AdminBody stages={stages} off={off} />}
          </span>
        </AdminLink>
      );
    })}
  </div>
);
