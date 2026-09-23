import React from 'react';
import { Container } from '../layout/Container';
import { productsData } from '../../data/products';
import { useScrollReveal } from '../../hooks/useScrollReveal';
import type { Product } from '../../types/product';

const ProductCard: React.FC<{ product: Product }> = ({ product }) => (
  <article className={`portfolio-card portfolio-card--${product.id}`}>
    <div
      className="portfolio-card__art"
      role="img"
      aria-label={`${product.name} pouch and ingredients from the Shah's Nutrition product portfolio`}
      style={{ backgroundImage: `url(${product.image})` }}
    />
    <div className="portfolio-card__body">
      <p className="portfolio-card__eyebrow">Shah's Nutrition / The everyday range</p>
      <h3>{product.name}</h3>
      <p className="portfolio-card__tagline">{product.tagline}</p>
      <p className="portfolio-card__description">{product.shortDescription}</p>
      <div className="portfolio-card__ingredients">
        <h4>Made with</h4>
        <ul>
          {product.ingredients.map((ingredient) => <li key={ingredient}>{ingredient}</li>)}
        </ul>
      </div>
    </div>
  </article>
);

export const ProductsSection: React.FC = () => {
  const sectionRef = useScrollReveal<HTMLElement>();

  return (
    <section id="products" ref={sectionRef} className="reveal products-section snap-section" aria-label="Our Products">
      <Container>
        <div className="portfolio-intro">
          <p className="portfolio-intro__eyebrow">Meet the range</p>
          <h2>Simple ingredients. <em>Extraordinary benefits.</em></h2>
          <p>Wholesome everyday foods made with real ingredients and honest nutrition.</p>
        </div>
        <div className="portfolio-grid">
          {productsData.map((product) => <ProductCard key={product.id} product={product} />)}
        </div>
      </Container>
    </section>
  );
};
