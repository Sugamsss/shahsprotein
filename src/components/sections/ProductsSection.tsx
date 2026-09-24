import React, { useCallback, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { Container } from '../layout/Container';
import { Modal } from '../ui/Modal';
import { OrderLink } from '../ui/OrderLink';
import { productsData } from '../../data/products';
import { useScrollReveal } from '../../hooks/useScrollReveal';
import type { Product } from '../../types/product';

/** ["250 g", "500 g"] -> "250 g and 500 g" */
const joinWithAnd = (items: string[]): string =>
  items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}` : items[0] ?? '';

const ProductCard: React.FC<{ product: Product; onOpen: (product: Product) => void }> = ({ product, onOpen }) => (
  <article className={`portfolio-card portfolio-card--${product.id}`}>
    <div
      className="portfolio-card__art"
      role="img"
      aria-label={`${product.name} pouch and ingredients from the Shah's Nutrition product portfolio`}
      style={{ backgroundImage: `url(${product.image})` }}
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
        <OrderLink
          source={`product:${product.id}`}
          productName={product.name}
          size="sm"
          className="portfolio-card__order"
          aria-label={`Order ${product.name} on WhatsApp`}
        >
          Order
        </OrderLink>
      </div>
    </div>
  </article>
);

export const ProductsSection: React.FC = () => {
  const sectionRef = useScrollReveal<HTMLElement>();
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const closeDetails = useCallback(() => setSelectedProduct(null), []);

  return (
    <>
      <section id="products" ref={sectionRef} className="reveal products-section snap-section" aria-label="Our Products">
        <Container>
          <div className="portfolio-intro">
            <p className="portfolio-intro__eyebrow">Meet the range</p>
            <h2>Simple ingredients. <em>Extraordinary benefits.</em></h2>
            <p>Wholesome everyday foods made with real ingredients and honest nutrition.</p>
          </div>
          <div className="portfolio-grid">
            {productsData.map((product) => <ProductCard key={product.id} product={product} onOpen={setSelectedProduct} />)}
          </div>
        </Container>
      </section>

      {selectedProduct && (
        <Modal isOpen onClose={closeDetails} title={selectedProduct.name}>
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
                  <dd>{selectedProduct.shelfLifeDays} days. No preservatives.</dd>
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

            {/* Pinned to the bottom of the popup on phones, so it never hides below the nutrition table. */}
            <div className="product-detail__order">
              <OrderLink
                source={`product-details:${selectedProduct.id}`}
                productName={selectedProduct.name}
                size="lg"
                className="product-detail__order-btn"
              >
                Order {selectedProduct.name} on WhatsApp
              </OrderLink>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
};
