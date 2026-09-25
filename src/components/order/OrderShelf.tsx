import React from 'react';
import { Plus } from 'lucide-react';
import { productsData } from '../../data/products';
import { siteConfig } from '../../data/siteConfig';
import { firstInStockSize, useStock } from '../../services/stockService';
import { OrderThumb } from './OrderThumb';

const copy = siteConfig.order;

/** The tile picture's width: a third of the sheet on phones, 48px beside the name on wider screens. Matches .order-shelf__art. */
const TILE_SIZES = '(max-width: 600px) calc((100vw - 68px) / 3), 48px';

/**
 * "Add something else": a tile per product. Each adds the smallest pack in stock, or
 * one more of it. A product that's all out shows "Back soon" and can't be tapped.
 */
export const OrderShelf: React.FC<{ onAdd: (productId: string) => void }> = ({ onAdd }) => {
  const stock = useStock();
  return (
    <section className="popup-section" aria-label={copy.addMoreHeading}>
      <h4>{copy.addMoreHeading}</h4>
      <ul className="order-shelf">
        {productsData.map((product) => {
          const size = firstInStockSize(product, stock);
          const art = <OrderThumb product={product} className="order-shelf__art" tileSizes={TILE_SIZES} />;
          return (
            <li key={product.id}>
              {size ? (
                <button
                  type="button"
                  className="order-shelf__item"
                  aria-label={copy.pickAddLabel(product.name, size)}
                  onClick={() => onAdd(product.id)}
                >
                  {art}
                  <span className="order-shelf__plus" aria-hidden="true">
                    <Plus size={14} strokeWidth={2.75} />
                  </span>
                  <span className="order-shelf__name">
                    {product.name}
                    <small aria-hidden="true">
                      <Plus size={14} strokeWidth={2.5} />
                      {copy.pickAdd}
                    </small>
                  </span>
                </button>
              ) : (
                <div className="order-shelf__item is-out">
                  {art}
                  <span className="order-shelf__name">
                    {product.name}
                    <small>{copy.backSoon}</small>
                  </span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
};
