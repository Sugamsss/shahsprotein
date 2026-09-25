import React from 'react';
import { Plus } from 'lucide-react';
import { productsData } from '../../data/products';
import { siteConfig } from '../../data/siteConfig';
import { firstInStockSize, useStock } from '../../services/stockService';
import { orderUrl, trackOrderChat } from '../../utils/contact';
import { OrderThumb } from './OrderThumb';

const copy = siteConfig.order;

/**
 * Nothing in the order yet: a row per product, and a way to just chat instead.
 * A product that's all out shows "Back soon" and can't be tapped.
 */
export const OrderEmpty: React.FC<{ onAdd: (productId: string) => void }> = ({ onAdd }) => {
  const stock = useStock();
  return (
    <div className="order-empty">
      <p className="order-empty__title">{copy.emptyTitle}</p>
      <p className="order-empty__body">{copy.emptyBody}</p>
      <ul className="order-picks">
        {productsData.map((product) => {
          const size = firstInStockSize(product, stock);
          const details = (
            <>
              <OrderThumb product={product} className="order-pick__thumb" />
              <span>
                <span className="order-pick__name">{product.name}</span>
                <span className="order-pick__tagline">{product.tagline}</span>
              </span>
            </>
          );
          return (
            <li key={product.id}>
              {size ? (
                <button
                  type="button"
                  className="order-pick"
                  aria-label={copy.pickAddLabel(product.name, size)}
                  onClick={() => onAdd(product.id)}
                >
                  {details}
                  <span className="order-pick__add" aria-hidden="true">
                    <Plus size={16} strokeWidth={2.5} />
                    <span>{copy.pickAdd}</span>
                  </span>
                </button>
              ) : (
                <div className="order-pick is-out">
                  {details}
                  <span className="back-soon">{copy.backSoon}</span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="order-chat">
        {copy.chatLead}{' '}
        <a
          href={orderUrl()}
          target="_blank"
          rel="noopener noreferrer"
          className="order-text-link"
          onClick={trackOrderChat}
        >
          {copy.chatLink}
        </a>
      </p>
    </div>
  );
};
