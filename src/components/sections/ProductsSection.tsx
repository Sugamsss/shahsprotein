import React from 'react';
import { Container } from '../layout/Container';
import { SectionHeader } from '../layout/SectionHeader';
import { Card } from '../ui/Card';
import { productsData } from '../../data/products';
import { useModal } from '../../context/ModalContext';
import { useScrollReveal } from '../../hooks/useScrollReveal';
import { use3DTilt } from '../../hooks/use3DTilt';
import { Leaf, Wheat, Dumbbell, ArrowRight, IndianRupee } from 'lucide-react';
import { IconType, Product } from '../../types/product';

const renderIcon = (type: IconType) => {
  switch (type) {
    case 'leaf':
      return <Leaf size={20} color="var(--color-text-accent)" />;
    case 'wheat':
      return <Wheat size={20} color="var(--color-text-accent)" />;
    case 'dumbbell':
      return <Dumbbell size={20} color="var(--color-text-accent)" />;
    case 'currency':
      return <IndianRupee size={20} color="var(--color-text-accent)" />;
    default:
      return <Leaf size={20} color="var(--color-text-accent)" />;
  }
};

const ProductCardItem: React.FC<{ product: Product; index: number }> = ({ product }) => {
  const { openProductModal } = useModal();
  const tiltRef = use3DTilt<HTMLDivElement>(8);

  return (
    <div style={{ display: 'flex', height: '100%', width: '100%' }}>
      <div ref={tiltRef} style={{ width: '100%', display: 'flex' }}>
        <Card
          interactive
          onClick={() => openProductModal(product)}
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
          }}
        >
          {/* Product Image + Icon Badge Container */}
          <div style={{ position: 'relative', marginBottom: 'var(--space-4)' }}>
            <img
              src={product.image}
              alt={product.name}
              width={1200}
              height={896}
              loading="lazy"
              className="product-card-img"
              style={{
                width: '100%',
                aspectRatio: '4/3',
                objectFit: 'cover',
                borderRadius: 'var(--radius-lg)',
                display: 'block',
              }}
            />
            <div
              className="product-icon-badge"
              style={{
                position: 'absolute',
                top: 'var(--space-3)',
                right: 'var(--space-3)',
                width: '40px',
                height: '40px',
                borderRadius: 'var(--radius-full)',
                backgroundColor: 'var(--color-bg-card)',
                backdropFilter: 'var(--glass-backdrop)',
                WebkitBackdropFilter: 'var(--glass-backdrop)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid var(--color-border-card)',
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
              flex: 1,
            }}
          >
            {product.shortDescription}
          </p>

          {/* Learn More Button */}
          <button
            type="button"
            className="product-learn-more-btn"
            onClick={(e) => {
              e.stopPropagation();
              openProductModal(product);
            }}
          >
            <span className="learn-more-text">Learn more</span> <ArrowRight size={16} className="product-card-arrow" />
          </button>
        </Card>
      </div>
    </div>
  );
};

export const ProductsSection: React.FC = () => {
  const sectionRef = useScrollReveal<HTMLElement>();

  return (
    <section
      id="products"
      ref={sectionRef}
      className="reveal products-section snap-section"
      aria-label="Our Products"
      style={{
        minHeight: '100vh',
        paddingTop: 'calc(var(--header-height) + var(--space-8))',
        paddingBottom: 'var(--space-12)',
        boxSizing: 'border-box',
      }}
    >
      <Container>
        <SectionHeader
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
          className="products-grid"
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
