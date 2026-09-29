import React, { useRef, useState } from 'react';
import { Pencil } from 'lucide-react';
import { OrderThumb } from '../../components/order/OrderThumb';
import { productsData } from '../../data/products';
import { adminCopy } from '../../data/adminCopy';
import { getKitchen, getStock, setStock } from '../api';
import { formatMoney, formatWeight } from '../format';
import { couponState } from '../orders/quote';
import { usePriceBook } from '../orders/usePriceBook';
import { LoadError, Skeleton } from '../parts';
import { ProductSheet } from './ProductSheet';
import { Switch } from '../Switch';
import type { OutOfStock } from '../types';
import { useRpc } from '../useRpc';
import { useUndoable } from '../useUndoable';

const copy = adminCopy.products;
const kx = adminCopy.kitchenForms;

// Stock (spec 2.9): a switch per product and size. Off means the site shows
// "Back soon". Flips go through useUndoable (at once, Undo, back on failure).
// Prices (admin only) read on each size row; the sample weight and shelf life read under
// the name. Both are set in one sheet per product. Each loads in its own quiet call:
// without them this is the stock page it always was.

const isOut = (stock: OutOfStock, productId: string, size: string) =>
  stock.some((row) => row.product_id === productId && row.size === size);

const ProductsPage: React.FC = () => {
  const { data: stock, error, loading, reload, setData } = useRpc(getStock, []);
  const run = useUndoable();
  const book = usePriceBook();
  const prices = book.ready ? book.prices : null;
  const kitchen = useRpc(getKitchen, []);
  const keepOf = (productId: string) => kitchen.data?.products.find((p) => p.product_id === productId) ?? null;
  const [editing, setEditing] = useState<string | null>(null);
  // The latest list, so a flip that lands after another starts from it.
  const stockRef = useRef<OutOfStock | null>(stock);
  stockRef.current = stock;
  const show = (list: OutOfStock) => { stockRef.current = list; setData(list); };

  const flip = (productId: string, size: string, name: string, inStock: boolean, quiet = false) => {
    const item = `${name} ${size}`;
    void run({
      apply: () => {
        const before = stockRef.current ?? [];
        const others = before.filter((row) => !(row.product_id === productId && row.size === size));
        show(inStock ? others : [...others, { product_id: productId, size, since: new Date().toISOString() }]);
        return () => show(before);
      },
      save: async () => show(await setStock(productId, size, inStock)),
      text: inStock ? copy.turnedOn(item) : copy.turnedOff(item),
      undo: () => flip(productId, size, name, !inStock, true),
      quiet,
    });
  };

  // Edit (the product's sheet), and how many coupons in use have their own prices.
  const foot = (productId: string, name: string, sizes: string[]) => {
    if (!prices && !keepOf(productId)) return null;
    const now = new Date();
    const own = !prices ? 0 : (book.coupons ?? []).filter((c) => couponState(c.code, book.coupons ?? [], now) === 'live'
      && prices.coupons.some((r) => r.coupon_id === c.id && r.product_id === productId && sizes.includes(r.size))).length;
    return (
      <div className="adm-pfoot">
        <button type="button" className="adm-text-btn" aria-label={kx.editLabel(name)} onClick={() => setEditing(productId)}>
          <Pencil size={16} strokeWidth={1.75} aria-hidden="true" />{kx.edit}
        </button>
        {own > 0 && <small>{copy.couponsOwn(own)}</small>}
      </div>
    );
  };
  // "Sample 20 g · Keeps 6 months", under the name.
  const facts = (productId: string) => {
    const keep = keepOf(productId);
    if (!keep) return null;
    const life = keep.shelf_life && kx.shelfLife(keep.shelf_life.amount, keep.shelf_life.unit);
    return (
      <small>
        <span>{kx.sampleFact(formatWeight(keep.sample_grams))}</span>
        {life && <> · <span>{kx.keepsFact(life)}</span></>}
      </small>
    );
  };

  let body: React.ReactNode;
  if (error && !stock) {
    body = <LoadError onRetry={() => void reload()} />;
  } else if (!stock) {
    body = loading ? <Skeleton rows={3} /> : null;
  } else {
    body = (
      <div className="adm-products">
        {productsData.map((product) => (
          <section key={product.id} className="adm-card adm-product" aria-labelledby={`adm-product-${product.id}`}>
            <div className="adm-product__head">
              <OrderThumb product={product} className="adm-product__thumb" />
              <span className="adm-product__name">
                <h2 id={`adm-product-${product.id}`}>{product.name}</h2>
                {facts(product.id)}
              </span>
            </div>
            {product.weightOptions.map((size) => {
              const on = !isOut(stock, product.id, size);
              const price = prices?.base.find((r) => r.product_id === product.id && r.size === size)?.price;
              return (
                <div key={size} className={`adm-product__size${prices ? ' has-price' : ''}`}>
                  <span className="adm-product__size-name">{size}</span>
                  <span className={on ? 'adm-product__status' : 'adm-product__status is-off'}>{on ? copy.on : copy.off}</span>
                  {prices && (
                    <span className={`adm-pread${price == null ? ' is-none' : ''}`}>{price == null ? copy.noPrice : formatMoney(price)}</span>
                  )}
                  <Switch
                    checked={on}
                    label={copy.switchLabel(`${product.name} ${size}`)}
                    onChange={(next) => flip(product.id, size, product.name, next)}
                  />
                </div>
              );
            })}
            {foot(product.id, product.name, product.weightOptions)}
          </section>
        ))}
      </div>
    );
  }
  const editingProduct = productsData.find((p) => p.id === editing);

  return (
    <div className="adm-page adm-page--products">
      <h1 className="adm-title">{copy.title}</h1>
      <p className="adm-intro">{prices || kitchen.data ? kx.productsIntro : copy.intro}</p>
      {body}
      {editingProduct && (
        <ProductSheet product={editingProduct} prices={prices} coupons={book.coupons} keep={keepOf(editingProduct.id)}
          onClose={() => setEditing(null)} onPrices={book.showPrices} onKeep={kitchen.setData} />
      )}
    </div>
  );
};

export default ProductsPage;
