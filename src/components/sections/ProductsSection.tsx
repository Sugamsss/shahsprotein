import React from 'react';
import { Container } from '../layout/Container';
import { SectionHeader } from '../layout/SectionHeader';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { productsData } from '../../data/products';
import { useModal } from '../../context/ModalContext';
import { useScrollReveal } from '../../hooks/useScrollReveal';
import { Leaf, Wheat, Dumbbell, ArrowRight } from 'lucide-react';
import { IconType, Product } from '../../types/product';

const renderIcon = (type: IconType) => {
  switch (type) {
    case 'leaf':
      return <Leaf size={20} color="var(--color-text-accent)" />;
    case 'wheat':
      return <Wheat size={20} color="var(--color-text-accent)" />;
    case 'dumbbell':
      return <Dumbbell size={20} color="var(--color-text-accent)" />;
    default:
      return <Leaf size={20} color="var(--color-text-accent)" />;
  }
};

const ProductCardItem: React.FC<{ product: Product; index: number }> = ({ product, index }) => {
  const { openProductModal } = useModal();
  const cardRef = useScrollReveal<HTMLDivElement>();
  const delayClass = `delay-${((index % 5) + 1) * 100}`;

  return (
    <div ref={cardRef} className={`reveal ${delayClass}`}>
      <Card interactive onClick={() => openProductModal(product)}>
        {/* Product Image + Icon Badge Container */}
        <div style={{ position: 'relative', marginBottom: 'var(--space-4)' }}>
          <img
            src={product.image}
            alt={product.name}
            style={{
              width: '100%',
              aspectRatio: '4/3',
              objectFit: 'cover',
              borderRadius: 'var(--radius-lg)',
              display: 'block',
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: 'var(--space-3)',
              right: 'var(--space-3)',
              width: '40px',
              height: '40px',
              borderRadius: 'var(--radius-full)',
              backgroundColor: 'var(--color-bg-badge)',
              backdropFilter: 'var(--glass-backdrop)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid var(--color-border-subtle)',
            }}
          >
            {renderIcon(product.iconType)}
          </div>
        </div>

        {/* Product Name */}
        <h3
          style={{
            fontSize: 'var(--font-size-xl)',
            color: 'var(--color-product-name)',
            marginBottom: 'var(--space-2)',
            fontWeight: 600,
          }}
        >
          {product.name}
        </h3>

        {/* Short Description */}
        <p
          style={{
            fontSize: 'var(--font-size-sm)',
            color: 'var(--color-text-secondary)',
            lineHeight: 1.6,
            marginBottom: 'var(--space-6)',
          }}
        >
          {product.shortDescription}
        </p>

        {/* Learn More Button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            openProductModal(product);
          }}
          style={{ paddingLeft: 0, color: 'var(--color-text-accent)' }}
        >
          Learn more <ArrowRight size={16} className="product-card-arrow" />
        </Button>
      </Card>
    </div>
  );
};

export const ProductsSection: React.FC = () => {
  const sectionRef = useScrollReveal<HTMLElement>();

  return (
    <section
      id="products"
      ref={sectionRef}
      className="reveal"
      aria-label="Our Products"
      style={{ paddingTop: 'var(--space-16)', paddingBottom: 'var(--space-16)' }}
    >
      <Container>
        <SectionHeader
          badge="OUR FIRST PRODUCTS"
          title={
            <>
              We're starting with{' '}
              <span style={{ color: 'var(--color-product-name)', textDecoration: 'underline' }}>
                Protein Chivda
              </span>
              ,{' '}
              <span style={{ color: 'var(--color-product-name)', textDecoration: 'underline' }}>
                Muesli
              </span>
              , and{' '}
              <span style={{ color: 'var(--color-product-name)', textDecoration: 'underline' }}>
                Protein Bars
              </span>
              .
            </>
          }
        />

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
            gap: 'var(--space-8)',
          }}
        >
          {productsData.map((product, index) => (
            <ProductCardItem key={product.id} product={product} index={index} />
          ))}
        </div>
      </Container>
    </section>
  );
};

