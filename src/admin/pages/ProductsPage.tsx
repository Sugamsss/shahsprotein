import React, { useRef } from 'react';
import { OrderThumb } from '../../components/order/OrderThumb';
import { productsData } from '../../data/products';
import { adminCopy } from '../../data/adminCopy';
import { getStock, setStock } from '../api';
import { LoadError, Skeleton } from '../parts';
import { Switch } from '../Switch';
import { useToast } from '../toast';
import type { OutOfStock } from '../types';
import { useRpc } from '../useRpc';

const copy = adminCopy.products;

// Stock (spec 2.9): a switch per product and size. Off means the site shows
// "Back soon". A flip shows at once and saves in the background; if the save
// fails it goes back and the error toast offers Try again.

const isOut = (stock: OutOfStock, productId: string, size: string) =>
  stock.some((row) => row.product_id === productId && row.size === size);

const ProductsPage: React.FC = () => {
  const { data: stock, error, loading, reload, setData } = useRpc(getStock, []);
  const toast = useToast();
  // The latest list, so a flip that lands after another starts from it.
  const stockRef = useRef<OutOfStock | null>(stock);
  stockRef.current = stock;

  const flip = (productId: string, size: string, name: string, inStock: boolean, withUndo = true) => {
    const before = stockRef.current ?? [];
    const others = before.filter((row) => !(row.product_id === productId && row.size === size));
    const optimistic = inStock ? others : [...others, { product_id: productId, size, since: new Date().toISOString() }];
    stockRef.current = optimistic;
    setData(optimistic);
    const item = `${name} ${size}`;
    setStock(productId, size, inStock).then(
      (next) => {
        stockRef.current = next;
        setData(next);
        if (!withUndo) return;
        toast.show({
          text: inStock ? copy.turnedOn(item) : copy.turnedOff(item),
          action: { label: adminCopy.undo, onAction: () => flip(productId, size, name, !inStock, false) },
        });
      },
      () => {
        stockRef.current = before;
        setData(before);
        toast.error(() => flip(productId, size, name, inStock, withUndo));
      },
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
              <h2 id={`adm-product-${product.id}`} className="adm-product__name">{product.name}</h2>
            </div>
            {product.weightOptions.map((size) => {
              const on = !isOut(stock, product.id, size);
              return (
                <div key={size} className="adm-product__size">
                  <span className="adm-product__size-name">{size}</span>
                  <span className={on ? 'adm-product__status' : 'adm-product__status is-off'}>{on ? copy.on : copy.off}</span>
                  <Switch
                    checked={on}
                    label={copy.switchLabel(`${product.name} ${size}`)}
                    onChange={(next) => flip(product.id, size, product.name, next)}
                  />
                </div>
              );
            })}
          </section>
        ))}
      </div>
    );
  }

  return (
    <div className="adm-page adm-page--products">
      <h1 className="adm-title">{copy.title}</h1>
      <p className="adm-intro">{copy.intro}</p>
      {body}
    </div>
  );
};

export default ProductsPage;
