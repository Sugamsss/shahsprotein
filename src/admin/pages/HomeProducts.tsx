import React from 'react';
import { CheckCircle, ChevronRight } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { adminCopy } from '../../data/adminCopy';
import { productsData } from '../../data/products';
import type { Product } from '../../types/product';
import { formatWeight } from '../format';
import { AdminLink } from '../router';
import type { OutOfStock, Totals, TotalsCell, TotalsStage } from '../types';

const copy = adminCopy.homePage.cards;

// The three product cards at the top of Home (temp/home-totals/v2): always all
// three, in product order, each one link to that product's orders. Pranjali's
// say what to make; Sunit's list every stage. `totals` is undefined while it
// loads: the labels stay and the numbers pulse.

const EMPTY: TotalsCell = { orders: 0, packs: 0, grams: 0, by_size: [] };

export type ProductStages = Record<TotalsStage, TotalsCell>;

/** One product's cells, zeros when the RPC left it out (nothing on it in any stage). */
export const stagesOf = (totals: Totals, productId: string): ProductStages => {
  const found = totals.products.find((p) => p.product_id === productId)?.stages;
  return {
    to_confirm: found?.to_confirm ?? EMPTY,
    to_send: found?.to_send ?? EMPTY,
    on_the_way: found?.on_the_way ?? EMPTY,
    to_collect: found?.to_collect ?? EMPTY,
    stale: found?.stale ?? EMPTY,
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
 * The pouch: the 4:5 tile on phones, the wide product photo on a laptop. The
 * <picture> means each size downloads only its own file. Above the fold, so not lazy.
 */
const Photo: React.FC<{ product: Product }> = ({ product }) => {
  const dark = useTheme().theme === 'dark';
  const tile = dark ? product.orderTileDark : product.orderTile;
  return (
    <span className={`adm-pcard__photo adm-pcard__photo--${product.id}`}>
      <picture>
        <source media="(min-width: 960px)" srcSet={dark ? product.imageDark : product.image} />
        <img src={tile.src} srcSet={tile.srcSet} sizes="34vw" width={360} height={450} decoding="async" alt="" />
      </picture>
    </span>
  );
};

/** Pranjali: "Make 3 kg", "6 × 250 g · 3 × 500 g", "for 6 orders", then the dashed maybe. */
const CookBody: React.FC<{ stages?: ProductStages; off?: string[] | null }> = ({ stages, off }) => {
  if (!stages) {
    return <span className="adm-pcard__make"><span>{copy.make}</span><Pulse className="adm-pulse--big" /></span>;
  }
  const make = stages.to_send;
  const maybe = stages.to_confirm;
  const maybeBox = maybe.orders > 0 && (
    <span className="adm-pcard__maybe">
      <span className="adm-pcard__long">{copy.maybe} <b>{formatWeight(maybe.grams)}</b> {copy.maybeMore(maybe.orders)}</span>
      <span className="adm-pcard__short">{copy.maybe} <b>+{formatWeight(maybe.grams)}</b></span>
    </span>
  );
  const offNote = off !== undefined && <span className="adm-pcard__off"><i />{copy.offOnSite(off)}</span>;
  if (make.packs === 0) {
    return (
      <>
        <span className="adm-pcard__none"><CheckCircle size={18} aria-hidden="true" />{maybe.orders ? copy.nothingYet : copy.nothingToMake}</span>
        {maybeBox}{offNote}
      </>
    );
  }
  return (
    <>
      <span className="adm-pcard__make"><span>{copy.make}</span><b>{formatWeight(make.grams)}</b></span>
      <span className="adm-pcard__sizes">
        {make.by_size.map((s, i) => (
          <React.Fragment key={s.size}>{i > 0 && <i>·</i>}<span>{copy.packsOf(s.packs, s.size)}</span></React.Fragment>
        ))}
      </span>
      <span className="adm-pcard__for">{copy.forOrders(make.orders)}</span>
      {maybeBox}{offNote}
    </>
  );
};

const Value: React.FC<{ n?: number; unit?: string }> = ({ n, unit }) => {
  if (n === undefined) return <Pulse />;
  if (!n) return <b className="is-zero">0</b>;
  return <b>{n}{unit && <em> {unit}</em>}</b>;
};

/** Sunit: the four stages, always all four in the same order, zeros faded. */
const AdminBody: React.FC<{ stages?: ProductStages; off?: string[] | null }> = ({ stages, off }) => {
  const pack = stages?.to_send;
  const foot = [
    stages?.stale.orders ? copy.stale(stages.stale.orders) : '',
    off !== undefined ? copy.off(off) : '',
  ].filter(Boolean);
  return (
    <>
      <ul className="adm-pcard__stages">
        <li className={stages?.to_confirm.orders ? 'is-accent' : ''}><span>{copy.toConfirm}</span><Value n={stages?.to_confirm.orders} /></li>
        <li>
          <span>
            {copy.toPack}
            {pack && pack.packs > 0 && <small>{pack.by_size.map((s) => copy.sizeTimes(s.size, s.packs)).join(' · ')}</small>}
          </span>
          <Value n={pack?.packs} unit={pack ? copy.pack(pack.packs) : undefined} />
        </li>
        <li><span>{copy.onTheWay}</span><Value n={stages?.on_the_way.orders} /></li>
        <li><span>{copy.notPaid}</span><Value n={stages?.to_collect.orders} /></li>
      </ul>
      {foot.length > 0 && <span className="adm-pcard__note">{foot.join(' · ')}</span>}
    </>
  );
};

/** What a screen reader says for the whole card. */
const spokenName = (cook: boolean, product: Product, stages: ProductStages | undefined, off: string[] | null | undefined) => {
  if (!stages) return `${product.name}. ${copy.seeOrders}`;
  if (!cook) {
    return copy.adminName(product.name, stages.to_confirm.orders, stages.to_send.packs, stages.on_the_way.orders, stages.to_collect.orders);
  }
  const make = stages.to_send;
  const maybe = stages.to_confirm;
  const main = make.packs
    ? `${copy.make.toLowerCase()} ${formatWeight(make.grams)} ${copy.forOrders(make.orders)}`
    : (maybe.orders ? copy.nothingYet : copy.nothingToMake).toLowerCase();
  const maybeText = maybe.orders ? `${copy.maybe} ${formatWeight(maybe.grams)} ${copy.maybeMore(maybe.orders)}` : '';
  return copy.cookName(product.name, main, maybeText, off !== undefined ? copy.offOnSite(off) : '');
};

export const ProductCards: React.FC<{
  cook: boolean;
  totals: Totals | null | undefined;
  stock: OutOfStock | null;
}> = ({ cook, totals, stock }) => (
  <div className={`adm-pcards adm-pcards--${cook ? 'cook' : 'admin'}`}>
    {productsData.map((product) => {
      const stages = totals ? stagesOf(totals, product.id) : undefined;
      const off = offSizes(product, stock);
      const open = stages
        ? stages.to_confirm.orders + stages.to_send.orders + stages.on_the_way.orders + stages.to_collect.orders
        : undefined;
      return (
        <AdminLink
          key={product.id}
          to={`/admin/orders?product=${product.id}`}
          className="adm-card adm-pcard"
          aria-label={spokenName(cook, product, stages, off)}
          aria-busy={stages ? undefined : true}
        >
          <Photo product={product} />
          <span className="adm-pcard__body">
            <span className="adm-pcard__top">
              <b className="adm-pname">{product.name}</b>
              {!cook && open !== undefined && <span className="adm-pcard__meta">{open ? copy.orders(open) : copy.allClear}</span>}
              <ChevronRight className="adm-pcard__chev" size={18} aria-hidden="true" />
            </span>
            {cook ? <CookBody stages={stages} off={off} /> : <AdminBody stages={stages} off={off} />}
          </span>
        </AdminLink>
      );
    })}
  </div>
);
