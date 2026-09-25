import React, { useCallback, useRef, useState } from 'react';
import { ArrowUpRight, Plus } from 'lucide-react';
import { Container } from '../layout/Container';
import { Badge } from '../ui/Badge';
import { HighlightedText } from '../ui/HighlightedText';
import { Modal } from '../ui/Modal';
import { OrderLink } from '../ui/OrderLink';
import { SizeChoice } from '../order/SizeChoice';
import { preloadOrderHandlers } from '../order/OrderButton';
import { LazyOrderPanel } from '../order/orderPanelLoader';
import { productsData } from '../../data/products';
import { siteConfig } from '../../data/siteConfig';
import { useOrder } from '../../context/OrderContext';
import { useScrollReveal } from '../../hooks/useScrollReveal';
import { useTheme } from '../../context/ThemeContext';
import type { Product } from '../../types/product';
import type { Theme } from '../../types/theme';

/** ["250 g", "500 g"] -> "250 g and 500 g" */
const joinWithAnd = (items: string[]): string =>
  items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}` : items[0] ?? '';

const copy = siteConfig.order;
const text = siteConfig.products;

const ProductCard: React.FC<{
  product: Product;
  theme: Theme;
  onOpen: (product: Product) => void;
  onAdd: (product: Product) => void;
}> = ({ product, theme, onOpen, onAdd }) => (
  <article className={`portfolio-card portfolio-card--${product.id}`}>
    <img
      className="portfolio-card__art"
      src={theme === 'dark' ? product.imageDark : product.image}
      alt={text.cardImageAlt(product.name)}
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
          aria-label={text.viewDetailsLabel(product.name)}
          aria-haspopup="dialog"
          onClick={() => onOpen(product)}
        >
          {text.viewDetails} <ArrowUpRight size={18} aria-hidden="true" />
        </button>
        {/* Adds the smallest pack (or one more of it) and opens "Your order". */}
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
      </div>
    </div>
  </article>
);

/** The product popup's pinned bar: pick a pack size, then add it to the order. */
const ProductOrderBar: React.FC<{ product: Product; onAdd: (size: string) => void }> = ({ product, onAdd }) => {
  const [size, setSize] = useState(product.weightOptions[0]);

  return (
    <div className="popup-bar product-detail__order">
      <SizeChoice
        large
        sizes={product.weightOptions}
        value={size}
        onChange={setSize}
        legend={copy.sizeLegendProduct}
        single={copy.singleSize(size)}
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
    </div>
  );
};

export const ProductsSection: React.FC = () => {
  const { theme } = useTheme();
  const sectionRef = useScrollReveal<HTMLElement>();
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const { addItem, openOrder, closeOrder, isOpen, openedFrom } = useOrder();

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
      <section id="products" ref={sectionRef} className="reveal products-section snap-section" aria-label={text.label}>
        <Container>
          <div className="portfolio-intro">
            <p className="portfolio-intro__eyebrow"><Badge>{text.eyebrow}</Badge></p>
            <h2><HighlightedText segments={text.heading} as="em" /></h2>
            <p>{text.intro}</p>
          </div>
          <div className="portfolio-grid">
            {productsData.map((product) => <ProductCard key={product.id} product={product} theme={theme} onOpen={setSelectedProduct} onAdd={addFromCard} />)}
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

              <section className="product-detail__section" aria-label={text.ingredients}>
                <h4>{text.ingredients}</h4>
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

              <section className="product-detail__section" aria-label={text.goodToKnow}>
                <h4>{text.goodToKnow}</h4>
                <dl className="product-detail__facts">
                  <div>
                    <dt>{text.staysFresh}</dt>
                    <dd>{text.freshness(selectedProduct.shelfLife, selectedProduct.madeToOrder)}</dd>
                  </div>
                  <div>
                    <dt>{text.contains}</dt>
                    <dd>{selectedProduct.contains}</dd>
                  </div>
                  {selectedProduct.weightOptions.length > 0 && (
                    <div>
                      <dt>{text.packSizes(selectedProduct.weightOptions.length)}</dt>
                      <dd>{joinWithAnd(selectedProduct.weightOptions)}</dd>
                    </div>
                  )}
                </dl>
              </section>

              <section className="product-detail__section" aria-label={text.nutrition}>
                <h4>{text.nutrition}</h4>
                {selectedProduct.nutritionFacts.length > 0 ? (
                  <table className="product-detail__nutrition">
                    <thead>
                      <tr>
                        <th scope="col">{text.nutrient}</th>
                        <th scope="col">{text.per100g}</th>
                        <th scope="col">{text.perServing} <span>{text.serving}</span></th>
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
                    {text.nutritionMissing(selectedProduct.name)}{' '}
                    <OrderLink source={`nutrition:${selectedProduct.id}`} ask variant="text">
                      {text.nutritionAsk}
                    </OrderLink>{' '}
                    {text.nutritionAskAfter}
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
