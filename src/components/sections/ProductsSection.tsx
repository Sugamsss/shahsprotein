import React from 'react';
import { Container } from '../layout/Container';
import { SectionHeader } from '../layout/SectionHeader';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { productsData } from '../../data/products';
import { useModal } from '../../context/ModalContext';
import { Leaf, Wheat, Dumbbell, ArrowRight } from 'lucide-react';
import { IconType } from '../../types/product';

export const ProductsSection: React.FC = () => {
  const { openProductModal } = useModal();

  const renderIcon = (type: IconType) => {
    switch (type) {
      case 'leaf':
        return <Leaf size={24} color="var(--color-text-accent)" />;
      case 'wheat':
        return <Wheat size={24} color="var(--color-text-accent)" />;
      case 'dumbbell':
        return <Dumbbell size={24} color="var(--color-text-accent)" />;
      default:
        return <Leaf size={24} color="var(--color-text-accent)" />;
    }
  };

  return (
    <section id="products" style={{ paddingTop: 'var(--space-16)', paddingBottom: 'var(--space-16)' }}>
      <Container>
        <SectionHeader
          badge="OUR FIRST PRODUCTS"
          title="We're starting with Protein Chivda, Muesli, and Protein Bars."
        />

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: 'var(--space-8)',
          }}
        >
          {productsData.map((product) => (
            <Card key={product.id} interactive onClick={() => openProductModal(product)}>
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: 'var(--radius-full)',
                  backgroundColor: 'var(--color-bg-badge)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 'var(--space-4)',
                }}
              >
                {renderIcon(product.iconType)}
              </div>

              <h3
                style={{
                  fontSize: 'var(--font-size-xl)',
                  color: 'var(--color-text-primary)',
                  marginBottom: 'var(--space-2)',
                }}
              >
                {product.name}
              </h3>

              <p
                style={{
                  fontSize: 'var(--font-size-sm)',
                  color: 'var(--color-text-secondary)',
                  lineHeight: 1.6,
                  marginBottom: 'var(--space-6)',
                  minHeight: '4.8em',
                }}
              >
                {product.shortDescription}
              </p>

              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  openProductModal(product);
                }}
                style={{ paddingLeft: 0, color: 'var(--color-text-accent)' }}
              >
                Learn more <ArrowRight size={16} />
              </Button>
            </Card>
          ))}
        </div>
      </Container>
    </section>
  );
};
