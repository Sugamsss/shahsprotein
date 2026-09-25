import React from 'react';
import { Plus } from 'lucide-react';
import { productsData } from '../../data/products';
import { siteConfig } from '../../data/siteConfig';
import { OrderThumb } from './OrderThumb';

const copy = siteConfig.order;

/** "Add something else": a tile per product. Each adds the smallest pack, or one more of it. */
export const OrderShelf: React.FC<{ onAdd: (productId: string) => void }> = ({ onAdd }) => (
  <section className="popup-section" aria-label={copy.addMoreHeading}>
    <h4>{copy.addMoreHeading}</h4>
    <ul className="order-shelf">
      {productsData.map((product) => (
        <li key={product.id}>
          <button
            type="button"
            className="order-shelf__item"
            aria-label={copy.pickAddLabel(product.name, product.weightOptions[0])}
            onClick={() => onAdd(product.id)}
          >
            <OrderThumb product={product} className="order-shelf__art" />
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
        </li>
      ))}
    </ul>
  </section>
);
