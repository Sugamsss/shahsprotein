import React, { useRef, useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { OrderThumb } from '../../components/order/OrderThumb';
import { productsData } from '../../data/products';
import { adminCopy } from '../../data/adminCopy';
import { getStock, setStock } from '../api';
import { formatMoney } from '../format';
import { couponState } from '../orders/quote';
import { usePriceBook } from '../orders/usePriceBook';
import { LoadError, Skeleton } from '../parts';
import { ProductPricesSheet } from './ProductPricesSheet';
import { Switch } from '../Switch';
import type { OutOfStock } from '../types';
import { useRpc } from '../useRpc';
import { useUndoable } from '../useUndoable';

const copy = adminCopy.products;

// Stock (spec 2.9): a switch per product and size. Off means the site shows
// "Back soon". Flips go through useUndoable (at once, Undo, back on failure).
// Prices (admin only) read on each size row and are set in a sheet per product.
// They load in their own quiet call: without them this is the stock page it always was.

const isOut = (stock: OutOfStock, productId: string, size: string) =>
  stock.some((row) => row.product_id === productId && row.size === size);

const ProductsPage: React.FC = () => {
  const { data: stock, error, loading, reload, setData } = useRpc(getStock, []);
  const run = useUndoable();
  const book = usePriceBook();
  const prices = book.ready ? book.prices : null;
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

  // "Edit prices" (or "Add prices" with no base price yet), and how many coupons in use have their own.
  const pricesFoot = (productId: string, name: string, sizes: string[]) => {
    if (!prices) return null;
    const none = !sizes.some((size) => prices.base.some((r) => r.product_id === productId && r.size === size));
    const now = new Date();
    const own = (book.coupons ?? []).filter((c) => couponState(c.code, book.coupons ?? [], now) === 'live'
      && prices.coupons.some((r) => r.coupon_id === c.id && r.product_id === productId && sizes.includes(r.size))).length;
    return (
      <div className="adm-pfoot">
        <button type="button" className="adm-text-btn" aria-label={(none ? copy.addPricesLabel : copy.editPricesLabel)(name)}
          onClick={() => setEditing(productId)}>
          {none ? <Plus size={16} strokeWidth={1.75} aria-hidden="true" /> : <Pencil size={16} strokeWidth={1.75} aria-hidden="true" />}
          {none ? copy.addPrices : copy.editPrices}
        </button>
        {own > 0 && <small>{copy.couponsOwn(own)}</small>}
      </div>
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
              <h2 id={`adm-product-${product.id}`}>{product.name}</h2>
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
            {prices && pricesFoot(product.id, product.name, product.weightOptions)}
          </section>
        ))}
      </div>
    );
  }
  const editingProduct = prices && book.coupons ? productsData.find((p) => p.id === editing) : undefined;

  return (
    <div className="adm-page adm-page--products">
      <h1 className="adm-title">{copy.title}</h1>
      <p className="adm-intro">{prices ? copy.introPrices : copy.intro}</p>
      {body}
      {editingProduct && prices && book.coupons && (
        <ProductPricesSheet product={editingProduct} prices={prices} coupons={book.coupons}
          onClose={() => setEditing(null)} onSaved={(next) => { book.showPrices(next); setEditing(null); }} />
      )}
    </div>
  );
};

export default ProductsPage;
