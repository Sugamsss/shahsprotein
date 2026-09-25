import React, { useCallback, useRef, useState } from 'react';
import { ArrowUpRight, Plus } from 'lucide-react';
import { Container } from '../layout/Container';
import { Badge } from '../ui/Badge';
import { Modal } from '../ui/Modal';
import { OrderLink } from '../ui/OrderLink';
import { SizeChoice } from '../order/SizeChoice';
import { preloadOrderHandlers } from '../order/OrderButton';
import { LazyOrderPanel } from '../order/orderPanelLoader';
import { productsData } from '../../data/products';
import { siteConfig } from '../../data/siteConfig';
import { useOrder } from '../../context/OrderContext';
import { useScrollReveal } from '../../hooks/useScrollReveal';
import { firstInStockSize, useStock } from '../../services/stockService';
import { useTheme } from '../../context/ThemeContext';
import type { Product } from '../../types/product';
import type { Theme } from '../../types/theme';

/** ["250 g", "500 g"] -> "250 g and 500 g" */
const joinWithAnd = (items: string[]): string =>
  items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}` : items[0] ?? '';

const copy = siteConfig.order;

const ProductCard: React.FC<{
  product: Product;
  theme: Theme;
  /** Every pack size is out: "Back soon" instead of Add. */
  out: boolean;
  onOpen: (product: Product) => void;
  onAdd: (product: Product) => void;
}> = ({ product, theme, out, onOpen, onAdd }) => (
  <article className={`portfolio-card portfolio-card--${product.id}`}>
    <img
      className="portfolio-card__art"
      src={theme === 'dark' ? product.imageDark : product.image}
      alt={`${product.name} pouch and ingredients from the Shah's Nutrition product portfolio`}
      width={946}
      height={728}
      loading="lazy"
      decoding="async"
    />
    <div className="portfolio-card__body">
      <h3>{product.name}</h3>
      <p className="portfolio-card__tagline">{product.tagline}</p>
      <p className="portfolio-card__description">{product.shortDescription}</p>
      <div className="portfolio-card__actions">
        <button
          type="button"
          className="portfolio-card__action"
          aria-label={`View details for ${product.name}`}
          aria-haspopup="dialog"
          onClick={() => onOpen(product)}
        >
          View details <ArrowUpRight size={18} aria-hidden="true" />
        </button>
        {/* Adds the smallest pack in stock (or one more of it) and opens "Your order". */}
        {out ? (
          <span className="back-soon">{copy.backSoon}</span>
        ) : (
          <button
            type="button"
            aria-haspopup="dialog"
            className="order-btn order-btn--sm portfolio-card__order portfolio-card__add"
            aria-label={copy.cardAddLabel(product.name)}
            onClick={() => onAdd(product)}
            {...preloadOrderHandlers}
          >
            <Plus size={16} strokeWidth={2.5} aria-hidden="true" />
            <span>{copy.cardAdd}</span>
          </button>
        )}
      </div>
    </div>
  </article>
);

/** The product popup's pinned bar: pick a pack size, then add it to the order. */
const ProductOrderBar: React.FC<{ product: Product; onAdd: (size: string) => void }> = ({ product, onAdd }) => {
  const stock = useStock();
  const [picked, setSize] = useState<string | undefined>(undefined);
  // The picked size, unless it's out (stock can arrive while the popup is open):
  // then the first size in stock. Undefined when every size is out.
  const size = picked && !stock.isOut(product.id, picked) ? picked : firstInStockSize(product, stock);

  // Every size out: one full-width label in place of the switch and the button.
  if (!size) {
    return (
      <div className="popup-bar product-detail__order">
        <span className="back-soon back-soon--lg" role="status">{copy.backSoon}</span>
      </div>
    );
  }

  const outSizes = product.weightOptions.filter((option) => stock.isOut(product.id, option));

  return (
    <div className="popup-bar product-detail__order">
      <SizeChoice
        large
        sizes={product.weightOptions}
        value={size}
        onChange={setSize}
        legend={copy.sizeLegendProduct}
        single={copy.singleSize(product.weightOptions[0])}
        isOut={(option) => stock.isOut(product.id, option)}
      />
      <button
        type="button"
        className="order-btn order-btn--lg product-detail__add"
        onClick={() => onAdd(size)}
        {...preloadOrderHandlers}
      >
        <Plus size={18} strokeWidth={2.5} aria-hidden="true" />
        <span>{copy.addToOrder}</span>
      </button>
      {outSizes.map((option) => (
        <p key={option} className="product-detail__size-note">{copy.sizeBackSoon(option)}</p>
      ))}
    </div>
  );
};

export const ProductsSection: React.FC = () => {
  const { theme } = useTheme();
  const sectionRef = useScrollReveal<HTMLElement>();
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const { addItem, openOrder, closeOrder, isOpen, openedFrom } = useOrder();
  const stock = useStock();

  // "Add to order" turns this popup into "Your order" in place: the overlay
  // stays, and the title and content change. The shared OrderDialog stays shut
  // for this opener (see OrderDialog).
  const showingOrder = selectedProduct !== null && isOpen && openedFrom === 'product-details';

  const showingOrderRef = useRef(showingOrder);
  showingOrderRef.current = showingOrder;

  const closeDetails = useCallback(() => {
    setSelectedProduct(null);
    if (showingOrderRef.current) closeOrder();
  }, [closeOrder]);

  const addFromCard = useCallback((product: Product) => {
    addItem(product.id);
    openOrder('product');
  }, [addItem, openOrder]);

  const addFromDetails = (product: Product, size: string) => {
    addItem(product.id, size);
    openOrder('product-details');
  };

  return (
    <>
      <section id="products" ref={sectionRef} className="reveal products-section snap-section" aria-label="Our Products">
        <Container>
          <div className="portfolio-intro">
            <p className="portfolio-intro__eyebrow"><Badge>Meet the range</Badge></p>
            <h2>Simple ingredients. <em>Extraordinary benefits.</em></h2>
            <p>Wholesome everyday foods made with real ingredients and honest nutrition.</p>
          </div>
          <div className="portfolio-grid">
            {productsData.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                theme={theme}
                out={stock.isProductOut(product.id)}
                onOpen={setSelectedProduct}
                onAdd={addFromCard}
              />
            ))}
          </div>
        </Container>
      </section>

      {selectedProduct && (
        <Modal
          isOpen
          onClose={closeDetails}
          title={showingOrder ? copy.title : selectedProduct.name}
          titleClassName={showingOrder ? undefined : 'modal-title--product'}
          className={showingOrder ? 'order-dialog' : undefined}
        >
          {showingOrder ? (
            <React.Suspense fallback={null}>
              <LazyOrderPanel switched />
            </React.Suspense>
          ) : (
            <div className="product-detail">
              <p className="product-detail__tagline">{selectedProduct.tagline}</p>
              <p className="product-detail__description">{selectedProduct.fullDescription}</p>

              <section className="product-detail__section" aria-label="Ingredients">
                <h4>Ingredients</h4>
                <ul className="product-detail__ingredients">
                  {selectedProduct.ingredients.map((ingredient, index) => {
                    const { image, rows } = selectedProduct.ingredientSprite;
                    const column = index % 3;
                    const row = Math.floor(index / 3);

                    return (
                      <li key={ingredient}>
                        <span
                          className="product-detail__ingredient-art"
                          aria-hidden="true"
                          style={{
                            backgroundImage: `url(${image})`,
                            backgroundSize: `300% ${rows * 100}%`,
                            backgroundPosition: `${column * 50}% ${(row / (rows - 1)) * 100}%`,
                          }}
                        />
                        <span>{ingredient}</span>
                      </li>
                    );
                  })}
                </ul>
              </section>

              <section className="product-detail__section" aria-label="Good to know">
                <h4>Good to know</h4>
                <dl className="product-detail__facts">
                  <div>
                    <dt>Stays fresh</dt>
                    <dd>
                      {selectedProduct.shelfLife}. No preservatives.
                      {selectedProduct.madeToOrder && ' Made after you order.'}
                    </dd>
                  </div>
                  <div>
                    <dt>Contains</dt>
                    <dd>{selectedProduct.contains}</dd>
                  </div>
                  {selectedProduct.weightOptions.length > 0 && (
                    <div>
                      <dt>{selectedProduct.weightOptions.length > 1 ? 'Pack sizes' : 'Pack size'}</dt>
                      <dd>{joinWithAnd(selectedProduct.weightOptions)}</dd>
                    </div>
                  )}
                </dl>
              </section>

              <section className="product-detail__section" aria-label="Nutrition information">
                <h4>Nutrition information</h4>
                {selectedProduct.nutritionFacts.length > 0 ? (
                  <table className="product-detail__nutrition">
                    <thead>
                      <tr>
                        <th scope="col">Nutrient</th>
                        <th scope="col">Per 100 g</th>
                        <th scope="col">Per 30 g <span>(serving)</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedProduct.nutritionFacts.map((fact) => (
                        <tr key={fact.label}>
                          <th scope="row" className={fact.isSubItem ? 'product-detail__nutrition-subitem' : undefined}>{fact.label}</th>
                          <td>{fact.per100g}</td>
                          <td>{fact.perServing}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="product-detail__note">
                    We’re still adding the full nutrition panel for {selectedProduct.name}. Want the numbers before you
                    order?{' '}
                    <OrderLink source={`nutrition:${selectedProduct.id}`} ask variant="text">
                      Ask us on WhatsApp
                    </OrderLink>{' '}
                    and we’ll share what we have.
                  </p>
                )}
              </section>

              {/* Pinned to the bottom of the popup, so it never hides below the nutrition table. */}
              <ProductOrderBar
                key={selectedProduct.id}
                product={selectedProduct}
                onAdd={(size) => addFromDetails(selectedProduct, size)}
              />
            </div>
          )}
        </Modal>
      )}
    </>
  );
};
